const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const createLoader = require('./helpers/loadTs.cjs')
const load = createLoader()
const fixtures = require('./foodTraceability.fixtures.json')
const { parseTraceSearch, parseTraceLots, parseTraceDetail, traceProductMatches, traceCompanyMatches, traceIngredientsMatch } = load('src/lib/server/foodTraceability.ts')
const { draftFromProduct, refreshProductProvenance } = load('src/lib/formulaDesign/fromProduct.ts')
const { validateSheet } = load('src/lib/formulaDesign/validate.ts')
const { provenanceForIngredient, provenanceToText } = load('src/lib/ingredientProvenance.ts')

test('public HTML tables preserve production identity and raw countries, never finished factory country', () => {
  const results = parseTraceSearch(fixtures.search)
  assert.ok(results.some(row => row.registrationNo === '10659923' && row.manufacturer === '주식회사 노바렉스'))
  const lots = parseTraceLots(fixtures.lots)
  assert.equal(lots[0].traceabilityNo, '106599232603')
  const lot = parseTraceDetail(fixtures.detail)
  assert.equal(lot.productionDate, '2026-06-15')
  assert.equal(lot.expirationDate, '2028-06-14')
  assert.equal(lot.ingredients.find(row => row.name === '비타민 C(고시형)').country, '폴란드')
  assert.equal(lot.ingredients.find(row => row.name === '이산화티타늄').country, '중국')
  assert.equal(lot.ingredients.length, 9)
  assert.ok(traceIngredientsMatch([...fixtures.product.mainIngredients, ...fixtures.product.subIngredients], lot.ingredients))
  assert.throws(() => parseTraceDetail(fixtures.detail.replace('>제조공장<', '>알 수 없는 항목<')), /TRACE_FORMAT/)
  for (const parse of [parseTraceSearch, parseTraceLots, parseTraceDetail]) assert.throws(() => parse('<html>일시 점검</html>'), /TRACE_FORMAT/)
})

test('only package suffix and corporate spacing normalize; recipe, export and factory differences reject', () => {
  assert.ok(traceProductMatches('아임비타 리포좀 비타민C', '아임비타 리포좀 비타민C(30정)'))
  assert.ok(traceProductMatches('아임비타 멀티비타민 이뮨샷', '아임비타 멀티비타민 이뮨샷, [(액상20ml+정제700mg+정제600mg) * 10병]'))
  for (const suffix of ['(일본수출용)', '플러스', '40', '(30정 수출용)', '(원료변경)']) assert.equal(traceProductMatches('비타민C', '비타민C' + suffix), false)
  assert.ok(traceCompanyMatches('주식회사 노바렉스', '노바렉스(주)'))
  assert.equal(traceCompanyMatches('네추럴웨이 포천 제2공장', '네추럴웨이'), false)
  assert.equal(traceIngredientsMatch(['비타민C'], [{ name: '비타민C혼합제제', country: '영국' }]), false)
  assert.equal(traceIngredientsMatch(['비타민C', '부원료A'], [{ name: '비타민C', country: '영국' }]), false)
})

test('live lookup validates the whole recipe, caches successful reads and distinguishes missing matches from failures', async () => {
  const original = global.fetch
  try {
    let calls = 0
    global.fetch = async url => {
      calls++
      return new Response(url.includes('nhq201Detail') ? fixtures.detail : url.includes('nhq201ListDataP') ? fixtures.lots : fixtures.search)
    }
    const lookup = createLoader()('src/lib/server/foodTraceability.ts').lookupFoodTraceability
    const matched = await lookup(fixtures.product)
    assert.equal(matched.status, 'matched')
    assert.equal(matched.lot.traceabilityNo, '106599232603')
    const firstCalls = calls
    await lookup(fixtures.product)
    assert.equal(calls, firstCalls)
    assert.equal((await lookup({ ...fixtures.product, subIngredients: ['변경 원료'] })).status, 'needs_review')
    assert.equal((await lookup({ ...fixtures.product, manufacturer: '다른 공장' })).status, 'not_found')
    const retry = createLoader()('src/lib/server/foodTraceability.ts').lookupFoodTraceability
    global.fetch = async () => { throw new Error('network offline') }
    await assert.rejects(() => retry(fixtures.product))
    global.fetch = async () => new Response('기업명 제품명 결과 없음')
    assert.equal((await retry(fixtures.product)).status, 'not_found')
  } finally { global.fetch = original }
})

test('independent package histories start together while every lot still requires a full recipe match', async () => {
  const original = global.fetch
  const ids = ['10000001', '10000002', '10000003']
  let release
  const gate = new Promise(resolve => { release = resolve })
  const started = []
  const search = ids.map((id, i) => `<td><input name="regNum${i}" value="${id}"><strong>기업명:</strong><span>${fixtures.product.manufacturer}</span><strong>제품명:</strong><span>${fixtures.product.name}</span></td>`).join('')
  try {
    global.fetch = async url => {
      const parsed = new URL(url), id = parsed.searchParams.get('regNum')
      if (!id) return new Response(search)
      if (url.includes('nhq201ListDataP')) {
        started.push(id)
        await gate
        return new Response(fixtures.lots.replaceAll('10659923', id))
      }
      return new Response(fixtures.detail.replaceAll('10659923', id))
    }
    const lookup = createLoader()('src/lib/server/foodTraceability.ts').lookupFoodTraceability
    const pending = lookup(fixtures.product)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(started, ids)
    release()
    assert.equal((await pending).status, 'matched')
  } finally { release(); global.fetch = original }
})

test('production snapshot survives formula import and JSON validation, including multiple source countries', () => {
  const lot = parseTraceDetail(fixtures.detail)
  lot.ingredients.push({ name: '비타민C', country: '영국' }, { name: '비타민 C', country: '' })
  const product = { ...fixtures.product, traceability: { status: 'matched', lot, checkedAt: '2026-09-12', candidates: [] } }
  const sheet = draftFromProduct(product).sheet
  const restored = validateSheet(JSON.parse(JSON.stringify(sheet)))
  assert.deepEqual(restored.materials[0].provenance, sheet.materials[0].provenance)
  const copied = provenanceToText(restored.materials, product.name)
  assert.match(copied, /폴란드 · 영국 · 일부 미기재/)
  assert.match(copied, /2026-06-15/)
  assert.match(copied, /106599232603/)
  assert.match(copied, /추가 근거:/)
  assert.match(copied, /tfood.go.kr/)
  const unverified = { ...product, traceability: { ...product.traceability, status: 'needs_review' } }
  assert.equal(provenanceForIngredient(unverified, '비타민C').country, '')
  for (const patch of [{ productionDate: '2026-02-30' }, { traceabilityNo: 'bad' }, { additionalSources: [{sourceUrl:'javascript:alert(1)'}] }]) {
    const invalid = structuredClone(sheet)
    Object.assign(invalid.materials[0].provenance, patch)
    assert.throws(() => validateSheet(invalid))
  }
})

test('separate supplier evidence is retained even when other ingredient rows follow it in copied text', () => {
  const product = { ...fixtures.product, name: '아임비타 멀티비타민 이뮨샷', manufacturer: '주식회사 네추럴웨이 포천 제2공장', reportNo: '20190004553319',
    traceability: { status: 'matched', checkedAt: '2026-09-12', lot: { ...parseTraceDetail(fixtures.detail), ingredients: [{ name: '비타민C', country: '영국' }, { name: '결정셀룰로스', country: '대만' }] } } }
  const rows = ['비타민C', '결정셀룰로스'].map(name => ({ name, provenance: provenanceForIngredient(product, name) }))
  assert.equal(rows[0].provenance.supplier, 'DSM')
  assert.equal(rows[1].provenance.supplier, '')
  const text = provenanceToText(rows, product.name)
  assert.match(text, /DSM/)
  assert.match(text, /추가 근거:/)
  assert.match(text, /원료사: 공식 제품 설명/)
})

test('returning to the same quote updates sources while preserving prices, ratios and edited ingredient names', () => {
  const sheet = draftFromProduct(fixtures.product).sheet
  sheet.materials[0].ratio = '35'
  sheet.materials[0].unitPrice = '12345'
  sheet.materials[1].name = '교체 원료'
  sheet.materials[1].provenance = undefined
  const product = { ...fixtures.product, traceability: {status:'matched', checkedAt:'2026-09-12', lot:parseTraceDetail(fixtures.detail)} }
  const updated = refreshProductProvenance(sheet, product)
  assert.equal(updated.materials[0].ratio, '35')
  assert.equal(updated.materials[0].unitPrice, '12345')
  assert.equal(updated.materials[0].provenance.country, '폴란드')
  assert.equal(updated.materials[1].provenance, undefined)
  assert.equal(updated.memo, sheet.memo)
  assert.equal(refreshProductProvenance(updated, product), updated)
  assert.equal(refreshProductProvenance(updated, {...product,traceability:{status:'not_found'}}), updated)
})

test('PDF pages retain production dates, traceability numbers and supplementary evidence', async () => {
  const original = global.document
  const drawn = []
  global.document = { createElement: () => ({ getContext: () => new Proxy({ measureText: text => ({ width: [...String(text)].length * 7 }), fillText: text => drawn.push(String(text)) }, { get: (target, key) => key in target ? target[key] : () => {} }) }) }
  try {
    const product = {...fixtures.product,traceability:{status:'matched',checkedAt:'2026-09-12',lot:parseTraceDetail(fixtures.detail)}}
    const sheet = validateSheet(draftFromProduct(product).sheet)
    const { renderFormulaSheetPages, DEFAULT_SHEET_EXPORT } = load('src/lib/export/renderFormulaSheet.ts')
    const { calculate } = load('src/lib/formulaDesign/calc.ts')
    await renderFormulaSheetPages(sheet, calculate(sheet), [], DEFAULT_SHEET_EXPORT)
    const text = drawn.join('\n')
    assert.match(text, /2026-06-15/)
    assert.match(text, /106599232603/)
    assert.match(text, /폴란드/)
    assert.match(text, /추가 근거:/)
  } finally { global.document = original }
})

test('read-only API validates inputs, blocks cross-site calls, and returns safe failures without upstream details', async () => {
  let calls = 0
  const POST = createLoader({ [path.resolve(__dirname, '../src/lib/server/traceabilityCache.ts')]: {
    cachedFoodTraceability: async () => { calls++; throw new Error('private upstream detail') },
  } })('src/app/api/ingredient-provenance/route.ts').POST
  const request = (body, headers = {}) => new Request('http://localhost/api/ingredient-provenance', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  assert.equal((await POST(request(fixtures.product, { 'sec-fetch-site': 'cross-site' }))).status, 403)
  assert.equal((await POST(request({ name: 'valid', manufacturer: 'company', mainIngredients: [], subIngredients: [] }))).status, 400)
  assert.equal((await POST(request({ ...fixtures.product, subIngredients: ['x'.repeat(501)] }))).status, 400)
  assert.equal(calls, 0)
  const response = await POST(request(fixtures.product))
  assert.equal(response.status, 502)
  assert.doesNotMatch(await response.text(), /private upstream/)
  assert.equal(calls, 1)
})
