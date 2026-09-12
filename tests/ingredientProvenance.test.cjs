const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { provenanceForIngredient, originLabel, hasProvenance, provenanceToText } = load('src/lib/ingredientProvenance.ts')
const { draftFromProduct } = load('src/lib/formulaDesign/fromProduct.ts')
const { sheetReducer } = load('src/lib/formulaDesign/reducer.ts')
const { validateSheet } = load('src/lib/formulaDesign/validate.ts')
const { calculate } = load('src/lib/formulaDesign/calc.ts')
const { renderFormulaSheetPages, DEFAULT_SHEET_EXPORT } = load('src/lib/export/renderFormulaSheet.ts')

const immune = {
  id: 'immune', name: '아임비타 멀티비타민 이뮨샷', reportNo: '20190004553319',
  manufacturer: '주식회사 네추럴웨이 포천 제2공장', form: '정제', formRaw: '', weightLabel: '',
  mainIngredients: ['비타민C', '비오틴', '산화아연'], subIngredients: ['결정셀룰로스'], markers: [],
}
const liposomal = { ...immune, name: '아임비타 리포좀 비타민C', reportNo: '200400200082822', manufacturer: '주식회사 노바렉스' }
const eundan = { ...immune, name: '고려은단비타민C1000', reportNo: '202100108172', manufacturer: '고려은단(주)', mainIngredients: ['비타민C혼합제제'] }

test('actual product vitamins retain partial country knowledge without extending claims to minerals or premixes', () => {
  const source = provenanceForIngredient(immune, '비타민C')
  assert.equal(source.supplier, 'DSM')
  assert.equal(source.country, '')
  assert.equal(originLabel(source), '유럽 (국가 미확인)')
  for (const name of ['산화아연', '결정셀룰로스', '비타민C혼합제제', '비타민C(새 원료)']) {
    const unknown = provenanceForIngredient(immune, name)
    assert.equal(hasProvenance(unknown), false)
    assert.equal(unknown.supplier, '')
    assert.equal(originLabel(unknown), '미확인')
  }
})

test('report number, full product name and manufacturer must all match; export variants do not inherit', () => {
  for (const patch of [{ reportNo: '' }, { reportNo: '20190004553324' }, { name: immune.name + '(일본수출용)' }, { manufacturer: '다른 공장' }, { name: '종근당 비타민C' }]) {
    assert.equal(hasProvenance(provenanceForIngredient({ ...immune, ...patch }, '비타민C')), false)
  }
  assert.equal(hasProvenance(provenanceForIngredient({ ...immune, name: '아임비타멀티비타민이뮨샷' }, '비타민 C')), true)
})

test('Europe does not imply DSM, while a premix claim retains its narrower vitamin-only scope', () => {
  const partial = provenanceForIngredient(liposomal, '비타민 C(고시형)')
  assert.equal(partial.supplier, '')
  assert.equal(partial.country, '')
  assert.equal(partial.region, '유럽')
  const scoped = provenanceForIngredient(eundan, '비타민C혼합제제')
  assert.equal(scoped.supplier, 'DSM')
  assert.equal(originLabel(scoped), '영국')
  assert.match(scoped.scope, /혼합제제 중 비타민C/)
  assert.equal(hasProvenance(provenanceForIngredient(eundan, '스테아린산칼슘')), false)
})

test('formula import and JSON save/load preserve sources and unknowns without inventing costs or ratios', () => {
  const first = draftFromProduct(immune).sheet
  const second = draftFromProduct(immune).sheet
  const restored = validateSheet(JSON.parse(JSON.stringify(first)))
  assert.deepEqual(restored.materials[0].provenance, first.materials[0].provenance)
  assert.equal(restored.materials[2].provenance.supplier, '')
  assert.equal(restored.materials[0].ratio, '')
  assert.equal(restored.materials[0].unitPrice, '')
  first.materials[0].provenance.supplier = 'changed'
  assert.equal(second.materials[0].provenance.supplier, 'DSM')
  const old = JSON.parse(JSON.stringify(second))
  old.materials.forEach(row => delete row.provenance)
  assert.equal(validateSheet(old).materials[0].provenance, undefined)
})

test('renaming by typing or pasting clears stale provenance, while price/ratio edits retain it', () => {
  const sheet = draftFromProduct(immune).sheet
  const id = sheet.materials[0].id
  const priced = sheetReducer(sheet, { type: 'material', id, patch: { ratio: '50', unitPrice: '10000' } })
  assert.equal(priced.materials[0].provenance.supplier, 'DSM')
  const renamed = sheetReducer(sheet, { type: 'material', id, patch: { name: '다른 비타민C' } })
  assert.equal(renamed.materials[0].provenance, undefined)
  for (const enrich of [undefined, () => ({ basis: '비타민C' })]) {
    const pasted = sheetReducer(sheet, { type: 'paste-materials', row: 0, column: 0, matrix: [['다른 비타민C', '25']], enrich })
    assert.equal(pasted.materials[0].provenance, undefined)
  }
  const pastedRatio = sheetReducer(sheet, { type: 'paste-materials', row: 0, column: 1, matrix: [['30']] })
  assert.equal(pastedRatio.materials[0].provenance.supplier, 'DSM')
  assert.equal(sheet.materials[0].provenance.supplier, 'DSM')
})

test('save validation rejects unsafe or unsupported claims and drops mismatched source names', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,unsafe', 'https://user:password@example.com']) {
    const sheet = draftFromProduct(immune).sheet
    sheet.materials[0].provenance.sourceUrl = sourceUrl
    assert.throws(() => validateSheet(sheet), /출처 링크/)
  }
  const missing = draftFromProduct(immune).sheet
  missing.materials[0].provenance.checkedAt = ''
  assert.throws(() => validateSheet(missing), /확인일/)
  const mismatch = draftFromProduct(immune).sheet
  mismatch.materials[0].name = '새 원료'
  assert.equal(validateSheet(mismatch).materials[0].provenance, undefined)
})

test('copied formula includes source, date, scope and unknowns; no internal costs leak into the text', () => {
  const sheet = draftFromProduct(eundan).sheet
  sheet.materials[0].unitPrice = '987654321'
  sheet.materials[0].ratio = '99'
  const copied = provenanceToText(sheet.materials, '고객\t제품\n견적')
  assert.match(copied, /DSM\t영국\t혼합제제 중 비타민C 성분 기준/)
  assert.match(copied, /2026-09-12/)
  assert.match(copied, /https:\/\/eundan.com/)
  assert.match(copied, /미확인/)
  assert.match(copied, /실제 사용 원료는 별도 확인/)
  assert.doesNotMatch(copied, /987654321/)
  assert.equal(copied.split('\n')[0], '[고객 제품 견적 · 원료 정보]')
  const mismatched = { ...sheet.materials[0], name: '교체 원료' }
  assert.doesNotMatch(provenanceToText([mismatched], ''), /DSM|eundan.com/)
})

test('PDF rendering carries scoped references and repeated headers across pages; option excludes them', async () => {
  const originalDocument = global.document
  const drawn = []
  global.document = { createElement: () => ({ getContext: () => new Proxy({
    measureText: text => ({ width: [...String(text)].length * 7 }),
    fillText: (text, x, y) => drawn.push({ text: String(text), x, y }),
  }, { get: (target, key) => key in target ? target[key] : () => {} }) }) }
  try {
    const sheet = draftFromProduct(eundan).sheet
    const first = sheet.materials[0]
    sheet.materials = Array.from({ length: 32 }, (_, i) => ({ ...first, id: `m${i}`, unitPrice: '987654321' }))
    const options = { ...DEFAULT_SHEET_EXPORT, showPrice: false, showTiers: false, showIssuer: false, showExtras: false }
    const pages = await renderFormulaSheetPages(sheet, calculate(sheet), [], options)
    const text = drawn.map(row => row.text).join('\n')
    assert.ok(pages.length > 1)
    assert.match(text, /참고 제품의 원료사/)
    assert.match(text, /혼합제제 중 비타민C 성분 기준/)
    assert.match(text, /DSM/)
    assert.match(text, /영국/)
    assert.match(text, /eundan.com/)
    assert.doesNotMatch(text, /987654321/)
    assert.ok(drawn.every(row => row.y >= 0 && row.y < 1755))
    drawn.length = 0
    await renderFormulaSheetPages(sheet, calculate(sheet), [], { ...options, showProvenance: false })
    assert.doesNotMatch(drawn.map(row => row.text).join('\n'), /DSM|참고 제품의 원료사|eundan.com/)
  } finally { global.document = originalDocument }
})
