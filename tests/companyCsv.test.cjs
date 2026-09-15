const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { previewCompanyCsv, validateCompanyImport, companyProducts, mergeCompanyProducts } = load('src/lib/companyCsv.ts')
const { quoteFromCsv } = load('src/lib/companyQuoteCsv.ts')
const { traceabilityPayload } = load('src/lib/traceabilityClient.ts')
const { draftFromProduct } = load('src/lib/formulaDesign/fromProduct.ts')
const buffer = text => new TextEncoder().encode(text).buffer
const csv = '제품명,제조원,제형,규격,주원료,포장 개수,포장 형태\r\n테스트 정제,예시 공장,정제,800mg × 60정,비타민C,60,PTP 포장\r\n'
test('company CSV decodes Korean BOM, maps named fields and preserves quoted newlines', () => {
  const p = previewCompanyCsv(buffer('\uFEFF' + csv))
  assert.equal(p.quote, false)
  const result = validateCompanyImport({ name: 'sample.csv', text: p.text, mapping: p.mapping })
  assert.equal(result.products[0].referenceDetails.unitsPerSet, '60')
  assert.equal(result.products[0].manufacturer, '예시 공장')
  const quoted = previewCompanyCsv(buffer('제품명,주원료\n"제품, A","비타민C\n비타민D"'))
  assert.equal(quoted.rows[0][0], '제품, A')
  assert.match(quoted.rows[0][1], /\n/)
})
test('unknown headers never silently adopt the old positional mapping', () => {
  const p = previewCompanyCsv(buffer('a,b,c,d,e,f,g\n하우,공장,정제,800mg,C,,D'))
  assert.deepEqual(p.mapping, {})
  assert.throws(() => validateCompanyImport({ name: 'x.csv', text: p.text, mapping: p.mapping }), /제품명/)
  assert.equal(validateCompanyImport({ name: 'x.csv', text: p.text, mapping: { name: 0 } }).products[0].name, '하우')
})
test('rejects corrupt quoted data, oversize rows and duplicate/out-of-range column mappings', () => {
  assert.throws(() => previewCompanyCsv(buffer('제품명,제조원\n"미완성,회사')), /따옴표/)
  for (const mapping of [{ name: 0, manufacturer: 0 }, { name: 99 }, { name: 0, unknown: 1 }]) {
    assert.throws(() => validateCompanyImport({ name: 'x.csv', text: csv, mapping }), /열/)
  }
  assert.throws(() => previewCompanyCsv(buffer('제품명,제조원\n' + 'a,b\n'.repeat(2001))), /2,000/)
})
test('reports missing names, deduplicates exact products, preserves different recipes', () => {
  const p = previewCompanyCsv(buffer('제품명,제조원,주원료\nA,공장,C\nA,공장,C\n,공장,D\nA,공장,D'))
  const r = companyProducts(p.rows, p.mapping)
  assert.equal(r.products.length, 2); assert.equal(r.duplicates, 1); assert.deepEqual(r.skipped, [4])
  const one = { ...r.products[0], id: 'company-one' }
  assert.equal(mergeCompanyProducts([[one], [one, { ...one, id: 'company-two' }]]).length, 2)
})
const quoteRows = [
  ['시험용 견적 정제'], ['포 장 단 위', '800mg x 60정 (48g)', '수량', '1,000set', '2026.09.15'],
  ['1. 원 료 비', '배합비율(%)', '배합량(kg)', '사용량(kg)', '원료단가(원)', '금액(원)', '비 고'],
  ['비타민C', '20', '10.56', '10.56', '1,000', '10560', ''],
  ['부형제', '80', '42.24', '42.24', '0', '0', '발주처제공'],
  ['소 계', '100', '52.8', '', '', '10560', 'Loss 10% UP'],
  ['2. 부 자 재 비', '기준단위', '수 량', '단가(원)', '금액(원)', '비 고'],
  ['병용기', '개', '1000', '100', '100000', ''], ['라벨', '개', '1000', '50', '50000', '발주처제공'], ['소 계', '', '', '', '100000'],
  ['3. 가공비', '기준단위', '단가(원)', '수량(정/회)', '가공금액(원)', '비 고'],
  ['포장', '정', '10', '60000', '600000'], ['가공비 소계', '', '', '', '600000'],
  ['4. 분석비', '기준단위', '단가(원)', '수량(정/회)', '가공금액(원)', '비 고'],
  ['초도분석', '회', '10000', '1', '', '별도청구'], ['품질검사', '회', '20000', '1', '20000'], ['분석비 소계', '', '', '', '20000'],
  ['5)일반관리비', '5000'], ['6)기업이윤', '3000'], ['공급가(VAT 별도)', '738560'],
  ['구성 및 포장지', '800mg*60정', '1일 1회, 1회 1정'], ['**물류비별도청구'],
]
test('factory quote blocks retain ratios/prices, fixed quantities, exclusions and original totals', () => {
  const q = quoteFromCsv(quoteRows, 'sample.csv')
  const s = q.product.companyFormula
  assert.equal(s.spec.productName, '시험용 견적 정제')
  assert.equal(s.spec.unitWeightMg, '800'); assert.equal(s.spec.unitsPerSet, '60'); assert.equal(s.spec.setCount, '1000')
  assert.equal(s.spec.lossPercent, '10'); assert.equal(s.spec.shelfLife, '')
  assert.equal(s.materials.length, 2); assert.equal(s.materials[0].unitPrice, '1000')
  assert.equal(s.packagingItems[1].included, false); assert.equal(s.analysisItems[0].included, false)
  assert.equal(s.processItems[0].quantity, '60000'); assert.equal(s.processItems[0].basis, 'fixed')
  assert.equal(q.totals.supplyTotal, 738560)
  assert.match(s.memo, /738560/)
  const p = { ...q.product, companySource: { fileId: 'f', fileName: 'sample.csv', importedAt: '' } }
  assert.equal(traceabilityPayload(p), '')
  const draft = draftFromProduct(p).sheet
  assert.deepEqual(draft, s)
  draft.materials[0].unitPrice = '999'
  assert.equal(s.materials[0].unitPrice, '1000')
})
test('CSV exported from quotation sheets detects blocks despite sparse merged-cell rows', () => {
  const text = quoteRows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const preview = previewCompanyCsv(buffer(text))
  assert.equal(preview.quote, true)
  const { products } = validateCompanyImport({ name: 'quote.csv', text, mapping: {} })
  assert.equal(products.length, 1); assert.equal(products[0].companyFormula.materials.length, 2)
  assert.throws(() => quoteFromCsv(quoteRows.map(row => row[0] === '비타민C' ? [...row.slice(0, 4), '=1+1', ...row.slice(5)] : row), 'x.csv'), /계산된 단가/)
})
