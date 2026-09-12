const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { createTraceabilityClient, traceabilityPayload } = load('src/lib/traceabilityClient.ts')
const { parseTraceDetail } = load('src/lib/server/foodTraceability.ts')
const fixtures = require('./foodTraceability.fixtures.json')
const data = { status: 'matched', checkedAt: '2026-09-12', message: '동일 원료 구성 확인', candidates: [], lot: parseTraceDetail(fixtures.detail) }
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function storage() {
  let saved = null
  return { getItem: () => saved, setItem: (_, value) => { saved = value } }
}

test('prefetch and clicks share one request; a reopened browser immediately restores the dated source', async () => {
  const disk = storage(), task = deferred()
  let calls = 0
  const client = createTraceabilityClient({ fetcher: () => { calls++; return task.promise }, storage: () => disk, now: () => 1000 })
  const key = traceabilityPayload(fixtures.product)
  client.prefetch([key])
  client.request(key)
  client.request(key)
  await tick()
  assert.equal(calls, 1)
  assert.equal(client.snapshot(key).pending, true)
  task.resolve(data)
  await tick()
  assert.equal(client.snapshot(key).data.lot.ingredients[0].country, data.lot.ingredients[0].country)
  assert.equal(client.snapshot(key), client.snapshot(key), 'React snapshots must remain stable')
  const reopened = createTraceabilityClient({ fetcher: async () => { calls++; return data }, storage: () => disk, now: () => 2000 })
  assert.equal(reopened.snapshot(key).data.lot.productionDate, '2026-06-15')
  reopened.request(key)
  await tick()
  assert.equal(calls, 1)
  assert.equal(reopened.snapshot(traceabilityPayload({ ...fixtures.product, subIngredients: ['변경 원료'] })), undefined)
})

test('stale information remains usable during refresh; failures retain its date and allow immediate explicit retry', async () => {
  let time = 1000, next = deferred()
  const client = createTraceabilityClient({ fetcher: () => next.promise, now: () => time })
  client.request('product')
  next.resolve(data)
  await tick()
  time += 3_600_001
  next = deferred()
  client.request('product')
  assert.equal(client.snapshot('product').pending, true)
  assert.equal(client.snapshot('product').data.checkedAt, data.checkedAt)
  next.reject(new Error('offline'))
  await tick()
  assert.equal(client.snapshot('product').pending, false)
  assert.ok(client.snapshot('product').error)
  assert.equal(client.snapshot('product').data, data)
  next = deferred()
  client.request('product', true, true)
  assert.equal(client.snapshot('product').pending, true)
  const newer = { ...data, checkedAt: '2026-09-13' }
  next.resolve(newer)
  await tick()
  assert.equal(client.snapshot('product').data.checkedAt, newer.checkedAt)
  assert.equal(client.snapshot('product').error, undefined)
})

test('clicked products use a reserved request slot, and obsolete queued prefetches are cancelled', async () => {
  const tasks = new Map(), started = []
  const client = createTraceabilityClient({ fetcher: key => {
    started.push(key); const task = deferred(); tasks.set(key, task); return task.promise
  } })
  const cancel = client.prefetch(['background', 'clicked', 'obsolete'])
  await tick()
  assert.deepEqual(started, ['background'])
  client.request('clicked')
  cancel()
  await tick()
  assert.deepEqual(started, ['background', 'clicked'])
  assert.equal(client.snapshot('obsolete'), undefined)
  tasks.get('background').resolve(data)
  tasks.get('clicked').resolve(data)
  await tick()
  assert.deepEqual(started, ['background', 'clicked'])
  assert.equal(client.snapshot('clicked').data.status, 'matched')
})

test('speculative queue stays bounded even when pointer crosses many products', async () => {
  const tasks = new Map(), started = []
  const client = createTraceabilityClient({ fetcher: key => { started.push(key); const task = deferred(); tasks.set(key, task); return task.promise } })
  client.prefetch(Array.from({ length: 30 }, (_, i) => String(i)))
  await tick()
  assert.equal(started.length, 1)
  assert.equal(client.snapshot('1'), undefined)
  for (let i = 0; i < 9; i++) { tasks.get(started[i]).resolve(data); await tick() }
  assert.deepEqual(started, ['0', '22', '23', '24', '25', '26', '27', '28', '29'])
})

test('malformed, unsafe and expired disk values are ignored; storage failure does not break lookup', async () => {
  const key = traceabilityPayload(fixtures.product)
  for (const raw of ['broken json', JSON.stringify([[key, { data, fetchedAt: 1 }]]),
    JSON.stringify([[key, { data: { ...data, lot: { ...data.lot, sourceUrl: 'javascript:alert(1)' } }, fetchedAt: 700_000_000 }]])]) {
    const client = createTraceabilityClient({ fetcher: async () => data, now: () => 700_000_001,
      storage: () => ({ getItem: () => raw, setItem: () => { throw new Error('quota') } }) })
    assert.equal(client.snapshot(key), undefined)
    client.request(key)
    await tick()
    assert.equal(client.snapshot(key).data.status, 'matched')
  }
})

test('failed or malformed lookups never become a persisted not-found result, and retry bypasses cooldown', async () => {
  const disk = storage()
  let calls = 0
  const client = createTraceabilityClient({ fetcher: async () => { calls++; return calls === 1 ? { status: 'not_found' } : data }, storage: () => disk, now: () => 0 })
  client.request('product')
  await tick()
  assert.ok(client.snapshot('product').error)
  assert.equal(client.snapshot('product').data, undefined)
  assert.equal(disk.getItem(), null)
  client.request('product')
  await tick()
  assert.equal(calls, 1)
  client.request('product', true, true)
  await tick()
  assert.equal(calls, 2)
  assert.equal(client.snapshot('product').data.status, 'matched')
})
