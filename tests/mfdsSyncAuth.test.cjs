const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./helpers/loadTs.cjs')
const root = path.resolve(__dirname, '..')

test('cron requires a strong matching bearer secret; secondary deployment is a no-op', async t => {
  const old = { enabled: process.env.MFDS_SYNC_ENABLED, secret: process.env.CRON_SECRET }
  t.after(() => {
    for (const [name, value] of [['MFDS_SYNC_ENABLED', old.enabled], ['CRON_SECRET', old.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  })
  let started = 0
  const load = createLoader({ [path.join(root, 'src/lib/server/mfdsSync.ts')]: { startSync: async () => { started++; return { store: {}, run: {} } }, collectSync: async () => 'complete' } })
  const { GET } = load('src/app/api/cron/mfds/route.ts')
  const request = headers => new Request('https://example.test/api/cron/mfds', { headers })
  delete process.env.MFDS_SYNC_ENABLED
  assert.equal((await GET(request())).status, 200); assert.equal(started, 0)
  process.env.MFDS_SYNC_ENABLED = '1'
  delete process.env.CRON_SECRET
  assert.equal((await GET(request())).status, 401)
  process.env.CRON_SECRET = 'public-test-secret-for-authentication-only'
  assert.equal((await GET(request({ authorization: 'Bearer wrong' }))).status, 401)
  assert.equal(started, 0)
  assert.equal((await GET(request({ authorization: `Bearer ${process.env.CRON_SECRET}` }))).status, 200)
  assert.equal(started, 1)
})

test('cross-origin or origin-less manual requests are rejected before work starts', async () => {
  let started = false
  const load = createLoader({ [path.join(root, 'src/lib/server/mfdsSync.ts')]: { startSync: async () => { started = true } } })
  const { POST } = load('src/app/api/products/sync/route.ts')
  for (const origin of [undefined, 'https://unrelated.test']) {
    const response = await POST(new Request('https://example.test/api/products/sync', { method: 'POST', headers: origin ? { origin } : {} }))
    assert.equal(response.status, 403)
  }
  assert.equal(started, false)
})

test('storage diagnostics omit upstream URLs, secrets, SQL details and invalid error codes', async t => {
  const logged = []
  t.mock.method(console, 'error', (...args) => logged.push(args))
  const { collectSync } = createLoader()('src/lib/server/mfdsSync.ts')
  let stopped
  const secret = 'private-test-value-never-to-be-logged'
  for (const code of ['23505', `https://example.test/${secret}`]) {
    const failure = Object.assign(new Error(`request ${secret}`), { code, detail: secret, query: secret })
    const state = await collectSync({ reclaimSpace: async () => {}, chargeRequest: async () => {}, savePage: async () => { throw failure }, stop: async (_, error) => { stopped = error } }, { fetched: 0, expected: null }, async () => ({ total: 1, products: [] }))
    assert.equal(state, 'failed')
    assert.equal(stopped.code, 'storage')
  }
  assert.deepEqual(logged.map(entry => entry[1]), [{ phase: 'save', fetched: 0, code: '23505' }, { phase: 'save', fetched: 0, code: 'UNKNOWN' }])
  assert.equal(JSON.stringify(logged).includes(secret), false)
})
