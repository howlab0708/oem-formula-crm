const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { calculate, calculateTiers, formatMaterialQuantity, unitNoun } = load('src/lib/formulaDesign/calc.ts')
const { emptySheet, newMaterialRow, newLineRow, newTierRow, tabletSheet, compactSheet } = load('src/lib/formulaDesign/preset.ts')
const { sheetReducer: reduce } = load('src/lib/formulaDesign/reducer.ts')
const { validateSheet } = load('src/lib/formulaDesign/validate.ts')
const { duplicateFormulaDraft, newFormulaDraft } = load('src/lib/formulaDesign/workspace.ts')
const { materialSheetToText } = load('src/lib/formulaDesign/materialExport.ts')

function example() {
  const sheet = emptySheet()
  Object.assign(sheet.spec, { unitWeightMg: '800', unitsPerSet: '60', setCount: '1000', lossPercent: '10' })
  sheet.materials = [400, 240, 160].map((mg, index) => newMaterialRow({ name: `원료 ${index + 1}`, unitAmountMg: String(mg), unitPrice: '10000' }))
  return sheet
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-15, Math.abs(expected) * 1e-12), `${actual} != ${expected}`)
const edit = (sheet, index, patch) => reduce(sheet, { type: 'material', id: sheet.materials[index].id, patch })

test('구성표 포함 체크는 mg·kg·원가 계산에서 원료를 제외하지 않는다', () => {
  const sheet = example()
  const before = calculate(sheet)
  sheet.materials.forEach(row => { row.functional = false })
  const after = calculate(sheet)
  for (const key of ['unitAmountSumMg', 'ratioSum', 'batchSumKg', 'materialCost', 'supplyTotal']) assert.equal(after[key], before[key])
  assert.deepEqual(after.materials.map(x => [x.mgPerUnit, x.batchKg, x.amount]), before.materials.map(x => [x.mgPerUnit, x.batchKg, x.amount]))
})

test('800mg/정 × 60정 × 1,000set: 원료별 mg, 비율, 순 kg, Loss 포함 kg, 원가', () => {
  const t = calculate(example())
  assert.equal(t.totalUnits, 60000)
  assert.equal(t.unitAmountSumMg, 800)
  assert.equal(t.unitAmountGapMg, 0)
  assert.equal(t.ratioSum, 100)
  assert.deepEqual(t.materials.map(x => x.mgPerUnit), [400, 240, 160])
  assert.deepEqual(t.materials.map(x => x.ratio), [50, 30, 20])
  t.materials.forEach((x, i) => {
    near(x.netKg, [24, 14.4, 9.6][i])
    near(x.batchKg, [26.4, 15.84, 10.56][i])
  })
  near(t.batchSumKg, 52.8)
  near(t.materialCost, 528000)
})

test('제작 수량 변경과 수량별 견적은 mg를 유지하며 kg·원가만 비례 변경한다', () => {
  const sheet = example()
  const changed = reduce(sheet, { type: 'spec', key: 'setCount', value: '2000' })
  const t = calculate(changed)
  assert.deepEqual(changed.materials, sheet.materials)
  assert.deepEqual(t.materials.map(x => x.mgPerUnit), [400, 240, 160])
  near(t.batchSumKg, 105.6)
  near(t.materialCost, 1056000)
  near(calculate(sheet, 2000).batchSumKg, t.batchSumKg)
  sheet.quote.tiers = [newTierRow({ setCount: '1000' }), newTierRow({ setCount: '2000', materialDiscount: '10' })]
  const tiers = calculateTiers(sheet)
  near(tiers[0].supplyPerSet, 528)
  near(tiers[1].supplyPerSet, 475.2)
})

test('마지막 편집 단위가 기준이고 목표 중량 변경 시 mg 기준 원료의 중량은 유지된다', () => {
  let sheet = example()
  sheet = edit(sheet, 0, { ratio: '25' })
  assert.equal(sheet.materials[0].unitAmountMg, '')
  assert.equal(calculate(sheet).materials[0].mgPerUnit, 200)
  sheet = edit(sheet, 0, { unitAmountMg: '320' })
  assert.equal(sheet.materials[0].ratio, '')
  assert.equal(calculate(sheet).materials[0].ratio, 40)
  sheet = edit(sheet, 1, { ratio: '30' })
  sheet = reduce(sheet, { type: 'spec', key: 'unitWeightMg', value: '1000' })
  assert.equal(calculate(sheet).materials[0].mgPerUnit, 320)
  assert.equal(calculate(sheet).materials[0].ratio, 32)
  assert.equal(calculate(sheet).materials[1].mgPerUnit, 300)
  assert.equal(calculate(sheet).materials[1].ratio, 30)
})

test('mg 소수 입력·0·빈칸을 구분하고 미량 성분을 % 반올림으로 소실하지 않는다', () => {
  let sheet = edit(example(), 0, { unitAmountMg: '0.' })
  assert.equal(sheet.materials[0].unitAmountMg, '0.')
  sheet = edit(sheet, 0, { unitAmountMg: '0.000001' })
  near(calculate(sheet).materials[0].mgPerUnit, 0.000001)
  near(calculate(sheet).materials[0].batchKg, 0.000000066)
  assert.equal(formatMaterialQuantity(0.000000066), '0.000000066')
  sheet = edit(sheet, 0, { unitAmountMg: '0' })
  assert.equal(calculate(sheet).materials[0].mgPerUnit, 0)
  sheet = edit(sheet, 0, { unitAmountMg: '' })
  assert.equal(sheet.materials[0].ratio, '')
  assert.equal(calculate(sheet).materials[0].mgPerUnit, 0)
})

test('mg와 %가 섞인 시트의 잔량 채우기·중량 부족·초과를 정확히 계산한다', () => {
  let sheet = edit(example(), 1, { ratio: '25' })
  assert.equal(calculate(sheet).unitAmountGapMg, 40)
  sheet = reduce(sheet, { type: 'fill-remainder', id: sheet.materials[2].id })
  assert.equal(sheet.materials[2].unitAmountMg, '200')
  assert.equal(calculate(sheet).unitAmountGapMg, 0)
  assert.equal(calculate(sheet).ratioSum, 100)
  sheet = edit(sheet, 0, { unitAmountMg: '900' })
  assert.equal(calculate(sheet).unitAmountGapMg, -500)
  sheet = reduce(sheet, { type: 'fill-remainder', id: sheet.materials[2].id })
  assert.equal(sheet.materials[2].unitAmountMg, '0')
  assert.equal(calculate(sheet).unitAmountGapMg, -300)
})

test('kg 사용량 직접 입력·팩 청구는 mg 배합을 변경하지 않으며 자동으로 되돌릴 수 있다', () => {
  let sheet = edit(example(), 0, { packKg: '25', packBilled: true })
  let t = calculate(sheet)
  assert.equal(t.materials[0].usageKg, 50)
  assert.equal(t.materials[0].mgPerUnit, 400)
  sheet = edit(sheet, 0, { usage: '30' })
  t = calculate(sheet)
  assert.equal(t.materials[0].overridden, true)
  assert.equal(t.materials[0].usageKg, 30)
  assert.equal(t.materials[0].mgPerUnit, 400)
  assert.equal(calculate(sheet, 2000).materials[0].usageKg, 75)
  sheet = edit(sheet, 0, { usage: '', packBilled: false })
  near(calculate(sheet).materials[0].usageKg, 26.4)
})

test('제작 수량이 비어 있어도 mg 배합 가능, 낱개 제작과 제형 단위 지원', () => {
  let sheet = example()
  sheet.spec.setCount = ''
  assert.equal(calculate(sheet).unitAmountSumMg, 800)
  assert.equal(calculate(sheet).batchSumKg, 0)
  Object.assign(sheet.spec, { unitsPerSet: '1', setCount: '60000', lossPercent: '0' })
  near(calculate(sheet).batchSumKg, 48)
  sheet.spec.unitWeightMg = ''
  assert.equal(calculate(sheet).materials[0].mgPerUnit, 400)
  assert.equal(calculate(sheet).materials[0].ratio, 0)
  assert.equal(unitNoun('캡슐'), '캡슐')
  assert.equal(unitNoun('분말'), '포')
})

test('기존 % 저장 시트는 이전 kg·금액 계산 순서를 그대로 보존한다', () => {
  for (const make of [tabletSheet, compactSheet]) {
    const sheet = make()
    sheet.materials.forEach(row => delete row.unitAmountMg)
    const restored = validateSheet(JSON.parse(JSON.stringify(sheet)))
    const t = calculate(restored)
    t.materials.forEach(item => {
      assert.equal(item.batchKg, t.totalBatchKg * Number(item.row.ratio) / 100)
      assert.equal(item.mgPerUnit, Number(restored.spec.unitWeightMg) * Number(item.row.ratio) / 100)
    })
    assert.equal(t.supplyTotal, calculate(sheet).supplyTotal)
  }
})

test('mg 저장 검증·JSON 복원·시트 사본에서도 정밀도와 입력 기준을 보존한다', () => {
  const sheet = edit(example(), 0, { unitAmountMg: '0.000123456789' })
  const restored = validateSheet(JSON.parse(JSON.stringify(sheet)))
  assert.equal(restored.materials[0].unitAmountMg, '0.000123456789')
  assert.equal(calculate(restored).materialCost, calculate(sheet).materialCost)
  const draft = newFormulaDraft()
  draft.sheet = restored
  const copy = duplicateFormulaDraft(draft)
  copy.sheet = edit(copy.sheet, 0, { unitAmountMg: '500' })
  assert.equal(draft.sheet.materials[0].unitAmountMg, '0.000123456789')
  assert.equal(copy.sheet.materials[0].unitAmountMg, '500')
  assert.throws(() => validateSheet(edit(sheet, 0, { unitAmountMg: '잘못된 값' })), /숫자로/)
})

test('엑셀 전체 행 붙여넣기는 계산 열을 건너뛰고 mg 원값·단가·팩·비고를 맞춘다', () => {
  const sheet = reduce(example(), { type: 'paste-materials', row: 0, column: 0,
    matrix: [['새 원료', '0.000001', '0.0000', '777', '', '12,000', '999', '25', '새 비고']] })
  const row = sheet.materials[0]
  assert.equal(row.name, '새 원료')
  assert.equal(row.unitAmountMg, '0.000001')
  assert.equal(row.ratio, '')
  assert.equal(row.unitPrice, '12,000')
  assert.equal(row.usage, '')
  assert.equal(row.packKg, '25')
  assert.equal(row.note, '새 비고')
  near(calculate(sheet).materials[0].batchKg, 0.000000066)
  const ratioOnly = reduce(sheet, { type: 'paste-materials', row: 0, column: 2, matrix: [['25']] })
  assert.equal(ratioOnly.materials[0].unitAmountMg, '')
  assert.equal(calculate(ratioOnly).materials[0].mgPerUnit, 200)
  const noteOnly = reduce(sheet, { type: 'paste-materials', row: 0, column: 8, matrix: [['메모만']] })
  assert.equal(noteOnly.materials[0].unitAmountMg, '0.000001')
})

test('배합표 복사 후 다시 붙여넣어도 소량 mg·자동 kg·금액이 일치한다', () => {
  const sheet = edit(example(), 0, { unitAmountMg: '0.000001' })
  const before = calculate(sheet)
  const text = materialSheetToText(sheet.spec, before)
  assert.match(text, /1정당 배합량\(mg\)/)
  assert.match(text, /원료단가\(원\/kg\)/)
  const matrix = text.split('\n').slice(2, 5).map(line => line.split('\t'))
  const restored = reduce(example(), { type: 'paste-materials', row: 0, column: 0, matrix })
  restored.materials.forEach(row => assert.equal(row.usage, ''))
  assert.equal(calculate(restored).materialCost, before.materialCost)
  assert.deepEqual(calculate(restored).materials.map(x => x.mgPerUnit), before.materials.map(x => x.mgPerUnit))
})

test('Loss 10% 추가와 수율 90%는 별개의 계산이며 mg와 % 입력에서 모두 일치한다', () => {
  const sheet = example()
  near(calculate(sheet).batchSumKg, 52.8)
  sheet.spec.lossMode = 'yield'
  sheet.spec.yieldPercent = '90'
  const t = calculate(sheet)
  near(t.batchSumKg, 53.33333333333333)
  near(t.materials[0].batchKg, 26.666666666666668)
  assert.deepEqual(t.materials.map(x => x.mgPerUnit), [400, 240, 160])
  const ratioSheet = edit(sheet, 0, { ratio: '50' })
  near(calculate(ratioSheet).materials[0].batchKg, t.materials[0].batchKg)
  near(calculate(sheet, 2000).batchSumKg, 106.66666666666666)
  assert.match(materialSheetToText(ratioSheet.spec, calculate(ratioSheet)), /수율 90% 적용/)
  sheet.spec.lossMode = 'additive'
  near(calculate(sheet).batchSumKg, 52.8)
})

test('수율 0·음수·100 초과·빈칸은 저장할 수 없고 무한 kg를 만들지 않는다', () => {
  for (const value of ['', '0', '-1', '101']) {
    const sheet = example()
    Object.assign(sheet.spec, { lossMode: 'yield', yieldPercent: value })
    assert.throws(() => validateSheet(sheet), /수율/)
    assert.equal(calculate(sheet).batchSumKg, 0)
  }
  const sheet = example()
  Object.assign(sheet.spec, { lossMode: 'yield', yieldPercent: '100' })
  near(calculate(validateSheet(sheet)).batchSumKg, 48)
  sheet.spec.lossMode = 'unknown'
  assert.throws(() => validateSheet(sheet), /계산 방식/)
})

test('배합 kg당 혼합비는 소수 kg를 올림하지 않고 수량·수율에 따라 변한다', () => {
  const sheet = example()
  sheet.processItems = [newLineRow({ label: '혼합', basis: 'batchKg', unit: 'kg', packSize: '25', unitPrice: '100' })]
  const t = calculate(sheet)
  near(t.process[0].quantity, 52.8)
  near(t.processCost, 5280)
  near(calculate(sheet, 2000).processCost, 10560)
  Object.assign(sheet.spec, { lossMode: 'yield', yieldPercent: '90' })
  near(calculate(sheet).processCost, 5333.333333333333)
  // 원료의 팩 청구량·고정 사용량이 실제 혼합 배합량을 바꾸면 안 된다.
  const manual = edit(sheet, 0, { usage: '100', packKg: '200', packBilled: true })
  near(calculate(manual).processCost, calculate(sheet).processCost)
  const restored = validateSheet(JSON.parse(JSON.stringify(sheet)))
  assert.equal(restored.spec.lossMode, 'yield')
  assert.equal(restored.spec.yieldPercent, '90')
  assert.equal(restored.processItems[0].basis, 'batchKg')
  near(calculate(restored).processCost, calculate(sheet).processCost)
})
