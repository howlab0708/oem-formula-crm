const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const zlib = require('node:zlib')
const ts = require('typescript')

function loadTs(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = loaded.require.bind(loaded)
  loaded.require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    return name.startsWith('.') ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`), mocks) : nativeRequire(name)
  }
  loaded._compile(compiled, filename)
  return loaded.exports
}

const codec = loadTs('src/lib/datasetSnapshot.ts')
const product = {
  id: '원본-id', name: '한글 Ω', manufacturer: '', form: '정제', formRaw: '원본 제형',
  weightLabel: '', weightMg: 0, mainIngredients: ['비타민C', '비타민C'], mainDetail: '원문',
  markers: [
    { name: '비타민C', value: 0, unit: 'mg', mgValue: 0, raw: '원문 0 mg' },
    { name: '균', value: 10, unit: 'CFU', mgValue: null, raw: '원문 10 CFU' },
  ], subIngredients: ['원료'], reportNo: '', primaryFunction: '기능성 설명',
}
const metadata = (generation = 'one', count = 1) => ({ generation, status: 'complete', file_name: 'file.csv', total_rows: count, imported_rows: count, started_at: '2026-09-05', finished_at: '2026-09-05' })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('snapshot preserves every product field, optional absence, original text, and numeric units', () => {
  const rows = [product, { ...product, id: 'second', weightMg: null, reportedAt: '' }]
  const meta = metadata('one', rows.length)
  const snapshot = JSON.parse(JSON.stringify(codec.packSnapshot(meta, rows)))
  assert.deepEqual(codec.unpackSnapshot(snapshot, meta), rows)
})

test('wrong generation, count, version and invalid string references are rejected', () => {
  const meta = metadata()
  const snapshot = codec.packSnapshot(meta, [product])
  assert.throws(() => codec.unpackSnapshot(snapshot, metadata('other')))
  assert.throws(() => codec.unpackSnapshot(snapshot, metadata('one', 2)))
  assert.throws(() => codec.unpackSnapshot({ ...snapshot, version: -1 }, meta))
  const broken = structuredClone(snapshot)
  broken.products[0][0] = -1
  assert.throws(() => codec.unpackSnapshot(broken, meta))
})

test('each read checks latest metadata; same-row-count updates invalidate cached products', async (t) => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  const calls = []
  let active = metadata()
  global.fetch = async (url, options) => {
    calls.push({ url, cache: options.cache })
    return url === '/api/products'
      ? json({ configured: true, meta: active })
      : json(codec.packSnapshot(active, [{ ...product, name: active.generation }]))
  }
  const client = loadTs('src/lib/api/products.ts')
  assert.equal((await client.fetchStoredDataset()).products[0].name, 'one')
  assert.equal((await client.fetchStoredDataset()).products[0].name, 'one')
  assert.equal(calls.length, 3)
  assert.equal(calls[1].cache, 'force-cache')
  assert.equal(calls[0].cache, 'no-store')
  active = metadata('two')
  assert.equal((await client.fetchStoredDataset()).products[0].name, 'two')
  assert.equal(calls.at(-1).url, `/api/products?generation=two&format=${codec.SNAPSHOT_FORMAT}`)
  active = null
  assert.equal((await client.fetchStoredDataset()).products, null)
})

test('a metadata failure never serves stale products', async (t) => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  global.fetch = async (url) => url === '/api/products' ? json({ configured: true, meta: metadata() }) : json(codec.packSnapshot(metadata(), [product]))
  const client = loadTs('src/lib/api/products.ts')
  await client.fetchStoredDataset()
  global.fetch = async () => json({ error: 'offline' }, 503)
  await assert.rejects(client.fetchStoredDataset(), /offline/)
})

test('snapshot failures fall back to the complete legacy dataset, including its final page', async (t) => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  const rows = Array.from({ length: 1501 }, (_, i) => ({ ...product, id: String(i) }))
  const calls = []
  global.fetch = async (url) => {
    calls.push(url)
    if (url === '/api/products') return json({ configured: true, meta: metadata('one', rows.length) })
    const query = new URL(url, 'http://localhost').searchParams
    if (query.has('format')) return json({ error: 'Unavailable' }, 503)
    const offset = Number(query.get('offset'))
    return json({ configured: true, products: rows.slice(offset, offset + 1500) })
  }
  const client = loadTs('src/lib/api/products.ts')
  const [first, second] = await Promise.all([client.fetchStoredDataset(), client.fetchStoredDataset()])
  assert.deepEqual(first.products, rows)
  assert.strictEqual(first, second)
  assert.equal(calls.length, 4)
})

test('server reuses persisted snapshots and streams both Brotli and identity responses', async () => {
  const meta = metadata()
  const snapshot = codec.packSnapshot(meta, [product])
  const compressed = zlib.brotliCompressSync(JSON.stringify(snapshot))
  let reads = 0
  const server = loadTs('src/lib/server/datasetSnapshot.ts', { '../db': {
    readDatasetSnapshot: async () => { reads += 1; return compressed },
    getSnapshotProducts: async () => assert.fail('Persisted snapshot should avoid full product reads'),
  } })
  const response = await server.snapshotResponse(meta, new Request('http://localhost', { headers: { 'Accept-Encoding': 'gzip, br' } }))
  assert.match(response.headers.get('Cache-Control'), /^private,/)
  assert.equal(response.headers.get('Content-Encoding'), 'br')
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(Buffer.from(await response.arrayBuffer()))), snapshot)
  const plain = await server.snapshotResponse(meta, new Request('http://localhost'))
  assert.equal(plain.headers.get('Content-Encoding'), null)
  assert.deepEqual(await plain.json(), snapshot)
  assert.equal(reads, 1)
})

test('incomplete generations are never persisted; complete generations are built only once', async () => {
  let written = 0
  let fetched = 0
  const server = loadTs('src/lib/server/datasetSnapshot.ts', { '../db': {
    readDatasetSnapshot: async () => null,
    getSnapshotProducts: async () => { fetched += 1; return [product] },
    writeDatasetSnapshot: async () => { written += 1 },
  } })
  await assert.rejects(server.getDatasetSnapshot(metadata('bad', 2)))
  assert.equal(written, 0)
  const [a, b] = await Promise.all([server.getDatasetSnapshot(metadata()), server.getDatasetSnapshot(metadata())])
  assert.strictEqual(a, b)
  assert.equal(written, 1)
  assert.equal(fetched, 2)
})
