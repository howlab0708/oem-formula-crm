/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const load = require('./helpers/loadTs.cjs')()

test('shared search query survives password gate and successful login', async () => {
  const previous = process.env.APP_PASSWORD
  process.env.APP_PASSWORD = 'local-test-password-not-a-real-credential'
  try {
    const { proxy } = load('src/proxy.ts')
    const { POST } = load('src/app/api/login/route.ts')
    const target = '/?saved=12345678-1234-1234-1234-123456789012'
    const gate = await proxy(new NextRequest('https://app.example'+target))
    const redirected = new URL(gate.headers.get('location'))
    assert.equal(redirected.pathname,'/login')
    assert.equal(redirected.searchParams.get('next'),target)
    const response = await POST(new NextRequest('https://app.example/api/login',{method:'POST',body:new URLSearchParams({password:process.env.APP_PASSWORD,next:target})}))
    assert.equal(response.headers.get('location'),'https://app.example'+target)
    assert.match(response.headers.get('set-cookie'),/oem_auth=/)
  } finally {
    if (previous === undefined) delete process.env.APP_PASSWORD
    else process.env.APP_PASSWORD = previous
  }
})
