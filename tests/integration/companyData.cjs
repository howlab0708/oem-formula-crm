const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { PGlite } = require(process.env.PGLITE_TEST_PATH || '@electric-sql/pglite')
const load = require('../helpers/loadTs.cjs')()
const { CompanyStore, COMPANY_SCHEMA } = load('src/lib/server/companyData.ts')
const { validateCompanyImport } = load('src/lib/companyCsv.ts')
let pg, a, b
const sample = validateCompanyImport({ name: 'test.csv', text: '제품명,제조원,주원료\n시험제품,회사,C', mapping: { name: 0, manufacturer: 1, mainIngredients: 2 } }).products
function store(schema) {
  const transaction = fn => pg.transaction(async tx => {
    await tx.exec(`set local search_path to ${schema}`)
    return fn(async (sql, params = []) => (await tx.query(sql, params)).rows)
  })
  return new CompanyStore({ transaction, query: (sql, params) => transaction(q => q(sql, params)) })
}
before(async () => {
  pg = new PGlite()
  await pg.exec('create role anon; create role authenticated; create schema company_a; create schema company_b; create table public.products(id text); insert into public.products values (\'mfds-keep\');')
  for (const name of ['company_a', 'company_b']) await pg.exec(`set search_path to ${name}; ${COMPANY_SCHEMA}`)
  a = store('company_a'); b = store('company_b')
})
after(async () => { await pg.close() })
test('company import persists, isolates tenants and never replaces MFDS data', async () => {
  const saved = await a.add('test.csv', sample)
  assert.equal(saved.duplicate, false)
  assert.equal((await a.list()).length, 1)
  assert.equal((await a.products(saved.file.id))[0].companySource.fileName, 'test.csv')
  assert.deepEqual(await b.list(), []); assert.deepEqual(await b.products(saved.file.id), [])
  await assert.rejects(b.setActive(saved.file.id, false), /이 회사/)
  assert.equal((await pg.query('select id from public.products')).rows[0].id, 'mfds-keep')
})
test('retry or renamed identical file is idempotent; changed recipe remains a separate version', async () => {
  assert.equal((await a.add('renamed.csv', sample)).duplicate, true)
  assert.equal((await a.list()).length, 1)
  const changed = [{ ...sample[0], subIngredients: ['D'] }]
  assert.equal((await a.add('test.csv', changed)).duplicate, false)
  assert.equal((await a.list()).length, 2)
})
test('excluding a file is reversible and does not delete drafts or other files', async () => {
  const file = (await a.list()).find(f => f.name === 'test.csv')
  await a.setActive(file.id, false)
  assert.deepEqual(await a.products(file.id), [])
  assert.equal((await a.list()).length, 2)
  await a.setActive(file.id, true)
  assert.equal((await a.products(file.id)).length, 1)
})
test('new company tables reject direct anonymous and authenticated access', async () => {
  for (const role of ['anon', 'authenticated']) {
    await pg.exec(`grant usage on schema company_a to ${role}; set role ${role}`)
    await assert.rejects(pg.query('select * from company_a.oem_company_files'), /permission denied/)
    await pg.exec('reset role')
  }
  const { rows } = await pg.query("select relrowsecurity from pg_class where oid='company_a.oem_company_files'::regclass")
  assert.equal(rows[0].relrowsecurity, true)
})
