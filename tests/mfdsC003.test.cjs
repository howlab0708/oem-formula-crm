const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const load = require('./helpers/loadTs.cjs')()
const { parseC003, fetchC003 } = load('src/lib/server/mfdsC003.ts')
const { packSnapshot, unpackSnapshot } = load('src/lib/datasetSnapshot.ts')
const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/mfds-c003-sample.json'), 'utf8'))

test('actual public C003 sample keeps report/license identity, source dates, and existing ingredient parsing', () => {
  const result = parseC003(sample, 1, 5)
  assert.equal(result.products.length, 5)
  assert.equal(result.products[0].reportNo, sample.C003.row[0].PRDLST_REPORT_NO)
  assert.equal(result.products[0].licenseNo, sample.C003.row[0].LCNS_NO)
  assert.ok(result.products[0].mainIngredients.length)
  assert.ok(result.products[0].markers.length)
  assert.equal(new Set(result.products.map(p => p.id)).size, 5)
  const meta = { generation: 'sample', imported_rows: 5 }
  assert.deepEqual(unpackSnapshot(packSnapshot(meta, result.products), meta), result.products)
})

test('incomplete pages, empty sources, duplicate reports and invalid identities are rejected', () => {
  const broken = structuredClone(sample)
  broken.C003.row.pop()
  assert.throws(() => parseC003(broken, 1, 5), /건수/)
  broken.C003.total_count = '0'
  assert.throws(() => parseC003(broken, 1, 5))
  const duplicate = structuredClone(sample)
  duplicate.C003.row[1] = duplicate.C003.row[0]
  assert.throws(() => parseC003(duplicate, 1, 5), /중복/)
  const missing = structuredClone(sample)
  missing.C003.row[0].LCNS_NO = ''
  assert.throws(() => parseC003(missing, 1, 5), /식별정보/)
})

test('network errors and upstream messages cannot expose the API URL or key', async () => {
  const testKey = 'testcredential12345'
  await assert.rejects(fetchC003(testKey, 1, 1000, async (url, options) => {
    assert.ok(url.startsWith('https://openapi.foodsafetykorea.go.kr/'))
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    throw new Error(`failed: ${url}`)
  }), error => error.retryable && !error.message.includes(testKey) && !error.message.includes('https'))
  assert.throws(() => parseC003({ C003: { RESULT: { CODE: 'INFO-100', MSG: testKey } } }, 1, 1), error => !error.message.includes(testKey))
})

test('more than 1000 records and path-like keys are blocked before network access', async () => {
  let called = false
  const read = async () => { called = true }
  await assert.rejects(fetchC003('../secrets', 1, 1, read))
  await assert.rejects(fetchC003('testcredential12345', 1, 1001, read))
  assert.equal(called, false)
})
