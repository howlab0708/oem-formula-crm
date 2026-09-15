const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
let writes = 0
const store = { list: async () => [], products: async () => [], add: async () => { writes++; return { duplicate: false } }, setActive: async () => { writes++; return {} } }
const load = require('./helpers/loadTs.cjs')({ [path.resolve('src/lib/server/companyData.ts')]: { companyStore: async () => store, companyStorageIsLocal: () => false } })
const api = load('src/app/api/company-data/route.ts')
const input = { name: 'test.csv', text: '제품명,제조원\n샘플,회사', mapping: { name: 0, manufacturer: 1 } }
const request = (body, headers = {}, method = 'POST') => new Request('http://localhost/api/company-data', { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
test('company API rejects cross-site writes, unsupported body and unsafe column mappings', async () => {
  const start = writes
  for (const req of [request(input, { origin: 'https://evil.example' }), request(input, { 'sec-fetch-site': 'cross-site' }), request(input, { 'content-type': 'text/plain' }), request({ ...input, mapping: { name: 500 } }), request({ ...input, text: 'x'.repeat(2_100_001) })]) {
    assert.equal((await api.POST(req)).status, 400)
  }
  assert.equal(writes, start)
})
test('server reparses approved CSV and restricts file identifiers', async () => {
  assert.equal((await api.POST(request(input))).status, 200)
  assert.equal((await api.GET(new Request('http://localhost/api/company-data?id=../../public'))).status, 400)
  assert.equal((await api.PATCH(request({ id: 'abc', active: false }, {}, 'PATCH'))).status, 400)
})
