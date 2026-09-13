const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { calculate, calculateTiers } = load('src/lib/formulaDesign/calc.ts')
const { emptySheet, tabletSheet, compactSheet, newLineRow, newTierRow } = load('src/lib/formulaDesign/preset.ts')
const { validateSheet } = load('src/lib/formulaDesign/validate.ts')
const { sheetReducer } = load('src/lib/formulaDesign/reducer.ts')
const { exportConditions } = load('src/lib/formulaDesign/vat.ts')
const { renderFormulaSheetPages, DEFAULT_SHEET_EXPORT } = load('src/lib/export/renderFormulaSheet.ts')

function quoteFixture() {
  const sheet = emptySheet()
  Object.assign(sheet.spec, { productName: 'VAT 검토 제품', setCount: '3', unitsPerSet: '1', unitWeightMg: '800', lossPercent: '0' })
  sheet.materials[0].name = '비타민C'
  sheet.materials[0].functional = true
  sheet.packagingItems = []
  sheet.processItems = [newLineRow({ label: '가공비', basis: 'fixed', quantity: '1', unitPrice: '12345.67', included: true })]
  sheet.analysisItems = [newLineRow({ label: '검사비', basis: 'fixed', quantity: '1', unitPrice: '99.99', included: false })]
  sheet.quote.overheads = []
  sheet.quote.tiers = [newTierRow({ setCount: '3' }), newTierRow({ setCount: '6' })]
  sheet.quote.conditions = '부가세 별도입니다.\n납기는 협의합니다.'
  return sheet
}

test('새 견적의 기본 처리 방식은 내림이고 저장된 반올림·올림은 유지한다', () => {
  for (const make of [emptySheet, tabletSheet, compactSheet]) assert.equal(make().quote.roundMode, 'floor')
  for (const mode of ['round', 'ceil', 'floor']) {
    const sheet = emptySheet()
    sheet.quote.roundMode = mode
    assert.equal(validateSheet(sheet).quote.roundMode, mode)
    assert.equal(sheetReducer(emptySheet(), { type: 'load', sheet }).quote.roundMode, mode)
  }
})

test('과거 부가세율이 0 또는 다른 값이어도 계산·불러오기·저장은 10%를 적용한다', () => {
  const standard = calculate(quoteFixture())
  for (const oldRate of ['0', '20', '']) {
    const sheet = quoteFixture()
    sheet.quote.vatRate = oldRate
    const totals = calculate(sheet)
    assert.equal(totals.vatTotal, standard.vatTotal)
    assert.equal(totals.proposalTotal, standard.proposalTotal)
    assert.equal(validateSheet(sheet).quote.vatRate, '10')
    assert.equal(sheetReducer(emptySheet(), { type: 'load', sheet }).quote.vatRate, '10')
    assert.equal(sheet.quote.vatRate, oldRate)
  }
  assert.equal(standard.unitPrice, 4115)
  assert.equal(standard.proposalPerSet, 4526)
  assert.equal(standard.proposalTotal, 13578)
  assert.equal(sheetReducer(quoteFixture(), { type: 'quote', key: 'vatRate', value: '0' }).quote.vatRate, '10')
})

test('과거 기본 VAT 조건만 교체하고 납기 등 기타 조건과 원본은 유지한다', () => {
  const original = '부가세 별도입니다.\n납기는 협의합니다.\nVAT 신고 자료는 별도 전달합니다.'
  const included = exportConditions(original, 'included', true)
  assert.match(included[0], /10% 포함/)
  assert.ok(included.includes('납기는 협의합니다.'))
  assert.ok(included.includes('VAT 신고 자료는 별도 전달합니다.'))
  assert.ok(!included.includes('부가세 별도입니다.'))
  assert.deepEqual(exportConditions('부가세(VAT) 포함입니다.\n납기 30일', 'excluded', false), ['납기 30일'])
})

test('VAT 포함·미포함 PDF가 금액·수량별 단가·별도 청구·조건을 일관되게 출력한다', async () => {
  const previous = global.document
  const drawn = []
  global.document = { createElement: () => ({ getContext: () => new Proxy({
    measureText: value => ({ width: [...String(value)].length * 7 }),
    fillText: (value, x, y) => drawn.push({ text: String(value), x, y }),
  }, { get: (target, key) => key in target ? target[key] : () => {} }) }) }
  try {
    const sheet = quoteFixture()
    const before = JSON.stringify(sheet)
    const totals = calculate(sheet)
    const tiers = calculateTiers(sheet)
    for (const mode of ['excluded', 'included']) {
      drawn.length = 0
      await renderFormulaSheetPages(sheet, totals, tiers, { ...DEFAULT_SHEET_EXPORT, vatDisplay: mode, showIssuer: false })
      const text = drawn.map(x => x.text).join('\n')
      assert.match(text, /제품구성/)
      assert.doesNotMatch(text, /구성 및 포장지/)
      const price = text.split('견적 금액 · ')[1].split('수량 구간별 단가')[0]
      const tierText = text.split('수량 구간별 단가 · ')[1].split('별도 청구 항목')[0]
      const extras = text.split('별도 청구 항목 (초도 1회성 비용) · ')[1].split('견적 조건')[0]
      const conditions = text.split('견적 조건')[1]
      if (mode === 'included') {
        assert.match(price, /부가세\(VAT\) 포함/)
        assert.match(price, /4,526/)
        assert.match(price, /13,578/)
        assert.doesNotMatch(price, /12,345/)
        assert.match(tierText, /2,263/)
        assert.match(extras, /110/)
        assert.match(conditions, /10% 포함/)
        assert.doesNotMatch(text, /부가세 별도입니다|금액 \(VAT 별도\)/)
      } else {
        assert.match(price, /부가세\(VAT\) 미포함/)
        assert.match(price, /4,115/)
        assert.match(price, /12,345/)
        assert.doesNotMatch(price, /13,578/)
        assert.match(tierText, /2,057/)
        assert.match(extras, /100/)
        assert.match(conditions, /부가세 10%가 별도로 추가/)
      }
      assert.ok(drawn.every(x => x.y >= 0 && x.y < 1755))
      assert.equal(JSON.stringify(sheet), before)
    }
    drawn.length = 0
    await renderFormulaSheetPages(sheet, totals, tiers, { ...DEFAULT_SHEET_EXPORT, vatDisplay: 'included', showPrice: false, showExtras: false, showIssuer: false })
    assert.doesNotMatch(drawn.map(x => x.text).join('\n'), /13,578|4,526|견적 금액 ·|수량 구간별 단가 ·|별도 청구 항목 \(/)
  } finally { global.document = previous }
})
