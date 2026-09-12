const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { draftFromProduct } = load('src/lib/formulaDesign/fromProduct.ts')
const { sheetReducer } = load('src/lib/formulaDesign/reducer.ts')
const { calculate } = load('src/lib/formulaDesign/calc.ts')
const { filterHistoryReducer, INITIAL_FILTER_HISTORY } = load('src/lib/filterHistory.ts')
const { EMPTY_FILTERS, filterChips } = load('src/lib/filters.ts')

const product = {
  id: 'reference-1', name: '영양 정제', manufacturer: '원본 제조사', form: '정제',
  formRaw: '정제', weightLabel: '48g (800mg × 60정)', weightMg: 48000,
  unitWeightMg: 800, intakeMethod: '1일 1회 1정',
  mainIngredients: ['비타민C(함량 100%)', '산화아연'],
  subIngredients: ['산화아연', '결정셀룰로스', '비타민 C(함량 100%)'],
  markers: [{ name: '비타민C', value: 100, unit: 'mg', mgValue: 100, raw: '1일 100mg' }],
  mainDetail: '비타민C 표시량 100mg', reportNo: '202600001',
}

test('reference import preserves raw ingredients and confirmed specification without inventing ratios or prices', () => {
  const { sheet, title } = draftFromProduct(product)
  assert.equal(title, '영양 정제 · 견적')
  assert.equal(sheet.spec.productName, product.name)
  assert.equal(sheet.spec.form, '정제')
  assert.equal(sheet.spec.unitWeightMg, '800')
  assert.equal(sheet.spec.intakeGuide, product.intakeMethod)
  assert.equal(sheet.spec.customer, '')
  assert.equal(sheet.spec.setCount, '')
  assert.deepEqual(sheet.materials.map(r => r.name), ['비타민C(함량 100%)', '산화아연', '결정셀룰로스'])
  assert.deepEqual(sheet.materials.map(r => r.functional), [true, true, false])
  for (const row of sheet.materials) {
    assert.equal(row.ratio, '')
    assert.equal(row.unitPrice, '')
    assert.equal(row.potency, '')
    assert.equal(row.labelAmount, '')
  }
  assert.match(sheet.memo, /원본 제조사/)
  assert.match(sheet.memo, /202600001/)
  assert.match(sheet.memo, /비타민C 표시량 100mg/)
})

test('unknown single-unit mass never falls back to package or daily mass; liquid has no tablet process', () => {
  for (const unitWeightMg of [null, undefined, 0, NaN, Infinity, -1]) {
    const { sheet } = draftFromProduct({ ...product, unitWeightMg, form: '액상' })
    assert.equal(sheet.spec.unitWeightMg, '')
    assert.equal(sheet.processItems[0].unit, '개')
    assert.doesNotMatch(sheet.processItems[0].label, /타정/)
  }
})

test('independent product drafts and normal edits feed the existing quote calculation', () => {
  const first = draftFromProduct({ ...product, mainIngredients: ['비타민C'], subIngredients: [] })
  const second = draftFromProduct(product)
  let sheet = first.sheet
  for (const [key, value] of [['unitsPerSet', '60'], ['setCount', '1000'], ['lossPercent', '0']]) {
    sheet = sheetReducer(sheet, { type: 'spec', key, value })
  }
  sheet = sheetReducer(sheet, { type: 'material', id: sheet.materials[0].id, patch: { ratio: '100', unitPrice: '10000' } })
  assert.equal(calculate(sheet).materialCost, 480000)
  assert.equal(second.sheet.materials[0].ratio, '')
  assert.equal(first.sheet.materials[0].ratio, '')
})

test('unchecking and reset can be undone step-by-step without alternating between the same two states', () => {
  let state = filterHistoryReducer(INITIAL_FILTER_HISTORY, { type: 'change', update: { ...EMPTY_FILTERS, mains: ['비타민C'], forms: ['정제'] } })
  const selected = state.current
  const main = filterChips(state.current).find(chip => chip.group === '주원료')
  state = filterHistoryReducer(state, { type: 'change', update: main.remove(state.current) })
  assert.deepEqual(state.current.mains, [])
  assert.deepEqual(state.current.forms, ['정제'])
  state = filterHistoryReducer(state, { type: 'change', update: EMPTY_FILTERS })
  state = filterHistoryReducer(state, { type: 'undo' })
  assert.deepEqual(state.current.forms, ['정제'])
  state = filterHistoryReducer(state, { type: 'undo' })
  assert.deepEqual(state.current, selected)
  state = filterHistoryReducer(state, { type: 'undo' })
  assert.deepEqual(state.current, EMPTY_FILTERS)
  assert.equal(state.previous.length, 0)
  assert.equal(filterHistoryReducer(state, { type: 'undo' }), state)
})
