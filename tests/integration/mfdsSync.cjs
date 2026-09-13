// Run with PGLITE_TEST_PATH pointing to an installed @electric-sql/pglite package.
// Uses an isolated, disposable PostgreSQL WASM database, never production credentials.
const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { PGlite } = require(process.env.PGLITE_TEST_PATH || '@electric-sql/pglite')
const load = require('../helpers/loadTs.cjs')()
const { SyncStore, SYNC_SCHEMA } = load('src/lib/server/mfdsSyncStore.ts')
const { collectSync } = load('src/lib/server/mfdsSync.ts')
const { parseC003, SyncError } = load('src/lib/server/mfdsC003.ts')
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/mfds-c003-sample.json'), 'utf8'))
const products = parseC003(sample, 1, 5).products
let pg, store
const active = async () => (await pg.query("select generation from import_status where status='complete'")).rows.map(r => r.generation)
const queryFor = connection => async (sql, params = []) => (await connection.query(sql, params)).rows
before(async () => {
  pg = new PGlite()
  await pg.exec(`create table import_status(generation text primary key, status text not null, file_name text, total_rows integer, imported_rows integer not null default 0, started_at timestamptz not null default now(), finished_at timestamptz, provenance jsonb);
    create table products(id text not null,generation text not null references import_status(generation) on delete cascade,seq integer not null,payload jsonb not null, primary key(generation,id));`)
  await pg.exec(SYNC_SCHEMA)
  store = new SyncStore({ query: queryFor(pg), transaction: fn => pg.transaction(tx => fn(queryFor(tx))) })
})
after(async () => { await pg.close() })
beforeEach(async () => {
  await pg.exec("truncate import_status cascade; truncate oem_sync.runs; update oem_sync.requests set times='{}'; insert into import_status(generation,status,total_rows,imported_rows,finished_at) values('old','complete',2,2,now());")
  // One matched product and one no longer returned by MFDS. Existing brand/manual extras survive.
  for (const [i, p] of [{ ...products[0], id: 'csv-151', brand: '기존 브랜드', name: '이전 제품명' }, { ...products[1], id: 'csv-retained', reportNo: '99999999' }].entries()) {
    await pg.query("insert into products values($1,'old',$2,$3::jsonb)", [p.id, i, JSON.stringify(p)])
  }
})

test('complete publish preserves old IDs, factory identity, brand, missing records and rollback generation', async () => {
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products })
  assert.deepEqual(await active(), ['old'])
  await store.publish(run, 5)
  assert.deepEqual(await active(), [run.id])
  const current = (await pg.query('select payload from products where generation=$1', [run.id])).rows.map(r => r.payload)
  assert.equal(current.length, 6)
  const matched = current.find(p => p.id === 'csv-151')
  assert.equal(matched.brand, '기존 브랜드')
  assert.equal(matched.name, products[0].name)
  assert.equal(matched.licenseNo, products[0].licenseNo)
  assert.ok(current.some(p => p.id === 'csv-retained'))
  assert.equal((await pg.query("select status from import_status where generation='old'")).rows[0].status, 'archived')
  const status = await store.latest()
  assert.equal(status.added, 4); assert.equal(status.changed, 1); assert.equal(status.retained, 1)
  await assert.rejects(store.claim(), /1시간/)
})

test('network interruption resumes persisted pages without replacing the active dataset early', async () => {
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products: products.slice(0, 2) })
  const state = await collectSync(store, run, async () => { throw new SyncError('network', '연결 지연', true) })
  assert.equal(state, 'paused'); assert.deepEqual(await active(), ['old'])
  const resumed = await store.claim()
  assert.equal(resumed.id, run.id); assert.equal(resumed.fetched, 2)
  const ranges = []
  const result = await collectSync(store, resumed, async (start, end) => {
    ranges.push([start, end])
    return { total: 5, products: products.slice(start - 1, end) }
  })
  assert.equal(result, 'complete'); assert.deepEqual(ranges, [[3, 5], [1, 1]])
})

test('count changes during collection discard staging and leave the existing snapshot intact', async () => {
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products: products.slice(0, 2) })
  assert.equal(await collectSync(store, run, async () => ({ total: 6, products: products.slice(2) })), 'failed')
  assert.deepEqual(await active(), ['old'])
  assert.equal((await pg.query('select count(*)::int as n from products where generation=$1', [run.id])).rows[0].n, 0)
})

test('final count probe prevents publishing even after every page was collected', async () => {
  const run = await store.claim()
  let calls = 0
  assert.equal(await collectSync(store, run, async () => ({ total: ++calls === 1 ? 5 : 6, products })), 'failed')
  assert.deepEqual(await active(), ['old'])
})

test('duplicate records across pages cannot replace or duplicate a product', async () => {
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products: products.slice(0, 2) })
  await assert.rejects(store.savePage(run, { total: 5, products: products.slice(1, 4) }), /중복/)
  assert.deepEqual(await active(), ['old'])
})

test('concurrent requests, expired leases and stale workers cannot overwrite each other', async () => {
  const first = await store.claim()
  await assert.rejects(store.claim(), /이미/)
  await pg.query("update oem_sync.runs set lease_until=now()-interval '1 second' where id=$1", [first.id])
  const second = await store.claim()
  assert.notEqual(second.owner, first.owner)
  await assert.rejects(store.savePage(first, { total: 5, products }), /이어받/)
  await store.stop(first, new SyncError('old', 'old worker'))
  assert.equal((await store.latest()).state, 'running')
  const updated = await store.savePage(second, { total: 5, products })
  await store.publish(updated, 5)
})

test('a different factory license or missing existing ingredient data stops reflection', async () => {
  const run = await store.claim()
  const changed = structuredClone(products)
  changed[0].licenseNo = '123456789'
  await assert.rejects(store.savePage(run, { total: 5, products: changed }), /제조소/)
  changed[0] = { ...products[0], mainIngredients: [], subIngredients: [] }
  await assert.rejects(store.savePage(run, { total: 5, products: changed }), /원료/)
  assert.deepEqual(await active(), ['old'])
})

test('active CSV import blocks sync; abandoned staging may be cleaned without deleting visible products', async () => {
  await pg.exec("insert into import_status(generation,status) values('csv-active','in_progress')")
  await assert.rejects(store.claim(), /다른 데이터/)
  await pg.exec("update import_status set started_at=now()-interval '3 hours' where generation='csv-active'")
  await store.claim()
  assert.deepEqual(await active(), ['old'])
})

test('rolling request budget pauses before making more calls and saves the current cursor', async () => {
  const run = await store.claim()
  await pg.exec("update oem_sync.requests set times=array_fill(now(),array[90])")
  let called = false
  assert.equal(await collectSync(store, run, async () => { called = true }), 'paused')
  assert.equal(called, false); assert.equal((await store.latest()).fetched, 0)
  assert.deepEqual(await active(), ['old'])
})

test('time budget exhaustion persists a retryable state without publishing', async () => {
  const run = await store.claim()
  assert.equal(await collectSync(store, run, async () => { throw Error('must not fetch') }, 1), 'paused')
  assert.deepEqual(await active(), ['old'])
})

test('Postgres JSON object key order does not make unchanged ingredients appear changed', async () => {
  await pg.query("update products set payload=$1::jsonb where id='csv-151'", [JSON.stringify({ ...products[0], id: 'csv-151', brand: '기존 브랜드' })])
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products })
  await store.publish(run, 5)
  assert.equal((await store.latest()).changed, 0)
})

test('a changed active generation prevents publication', async () => {
  let run = await store.claim()
  run = await store.savePage(run, { total: 5, products })
  await pg.exec("update import_status set status='archived' where generation='old'; insert into import_status(generation,status,finished_at) values('external','complete',now())")
  await assert.rejects(store.publish(run, 5), /검증/)
  assert.deepEqual(await active(), ['external'])
})
