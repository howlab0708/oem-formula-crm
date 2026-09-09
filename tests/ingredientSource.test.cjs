const { test } = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./helpers/loadTs.cjs')

const loadTs = createLoader()
const { classifySources, productSources, sourceFormOptions, originOfForm } = loadTs('src/lib/ingredientSource.ts')
const { applyFilters, EMPTY_FILTERS, activeFilterCount } = loadTs('src/lib/filters.ts')

/** 한 원료 이름의 판정을 "영양성분/형태/기원" 문자열로 납작하게 만든다. */
const read = (name) => classifySources(name).map((m) => `${m.nutrient ?? '-'}/${m.form}/${m.origin}`)

test('부형제는 영양성분 원료로 세지 않는다', () => {
  // 스테아린산마그네슘 15,161건·카복시메틸셀룰로스칼슘 5,919건. 이게 새면 통계가 무의미해진다.
  assert.deepEqual(read('스테아린산마그네슘'), [])
  assert.deepEqual(read('스테아린산마그네슘(고시형)'), [])
  assert.deepEqual(read('카복시메틸셀룰로스칼슘'), [])
  assert.deepEqual(read('카르복시메틸셀룰로오스칼슘'), [])
  assert.deepEqual(read('스테아린산칼슘'), [])
  assert.deepEqual(read('결정셀룰로오스'), [])
})

test('다른 영양성분의 염은 그 영양성분으로 센다', () => {
  // 판토텐산칼슘은 판토텐산의 안정성을 높이려 칼슘염을 붙인 원료다. 칼슘 비중이 8%대이고
  // 품목제조신고서에도 판토텐산 함량만 기능성분으로 잡힌다.
  assert.deepEqual(read('판토텐산칼슘'), ['판토텐산(비타민B5)/판토텐산칼슘/synthetic'])
  assert.deepEqual(read('L-아스코브산칼슘(고시형)'), ['비타민C/아스코르브산칼슘/synthetic'])
  // NMN 은 나이아신 영양원으로 신고된 원료가 아니다.
  assert.deepEqual(read('니코틴산아미드 모노뉴클레오타이드'), [])
})

test('제1인산칼슘·피로인산칼슘은 칼슘 영양원이 아니다', () => {
  // 산도조절제·팽창제로 쓰인다. 공전 칼슘 기원이 아니다.
  assert.deepEqual(read('제일인산칼슘'), [])
  assert.deepEqual(read('제1인산칼슘'), [])
  assert.deepEqual(read('피로인산칼슘'), [])
})

test('같은 형태의 표기 흔들림을 하나로 모은다', () => {
  const d3 = '비타민D/비타민D3(콜레칼시페롤) · 혼합제제/synthetic'
  assert.deepEqual(read('비타민D3혼합제제'), [d3])
  assert.deepEqual(read('비타민 D3 혼합제제분말'), [d3])
  assert.deepEqual(read('분말비타민D3혼합제제'), [d3])
  assert.deepEqual(read('비타민 D3 혼합제제유지'), [d3])

  const yeast = '셀레늄/건조효모(셀레늄)/yeast'
  assert.deepEqual(read('건조효모(셀렌함유)'), [yeast])
  assert.deepEqual(read('셀레늄함유건조효모'), [yeast])
  assert.deepEqual(read('식용건조효모(셀렌으로서 0.1%)'), [yeast])
  assert.deepEqual(read('효모((셀렌))'), [yeast])
  // 원본에 괄호가 HTML 엔티티로 남은 행이 있다.
  assert.deepEqual(read('건조효모&#40;아연함유&#41;'), ['아연/건조효모(아연)/yeast'])
})

test('비타민E 는 천연형과 합성형을 가른다', () => {
  assert.deepEqual(read('d-α-토코페롤'), ['비타민E/d-α-토코페롤 (천연형)/natural'])
  assert.deepEqual(read('D-알파-토코페롤(고시형)'), ['비타민E/d-α-토코페롤 (천연형)/natural'])
  assert.deepEqual(read('DL-알파-토코페롤'), ['비타민E/dl-α-토코페롤 (합성형)/synthetic'])
  assert.deepEqual(read('DL-알파-토코페릴초산염 혼합제제'), [
    '비타민E/dl-α-토코페릴 에스테르 (합성형) · 혼합제제/synthetic',
  ])
})

test('괄호 안 담체·산화방지제를 영양성분 원료로 세지 않는다', () => {
  // 머리에서 성분을 찾았으면 괄호 안은 보지 않는다 - 제이인산칼슘은 담체다.
  assert.deepEqual(read('비타민 B12 혼합제제(비타민B12 1%, 제이인산칼슘 99%)'), [
    '비타민B12/비타민B12 · 혼합제제/unspecified',
  ])
  // 정제어유의 비타민E 는 산화방지 목적이다.
  assert.deepEqual(read('정제어유(정제어유 99.9%, 비타민E 0.1%)'), [])
  // 머리가 원료를 안 가리키는 순수 혼합제제는 괄호 안을 본다.
  const premix = read('혼합제제[비타민A팔미테이트 0.3456%, 비타민C 3.4992%]')
  assert.deepEqual(premix, [
    '비타민A/레티닐팔미테이트 · 혼합제제/synthetic',
    '비타민C/비타민C · 혼합제제/unspecified',
  ])
})

test('무기질 형태를 공전 기원대로 가른다', () => {
  assert.deepEqual(read('산화아연(고시형)'), ['아연/산화아연/synthetic'])
  assert.deepEqual(read('글루콘산아연'), ['아연/글루콘산아연/synthetic'])
  assert.deepEqual(read('해조칼슘'), ['칼슘/해조칼슘 (천연 유래)/natural'])
  assert.deepEqual(read('유청칼슘(칼슘함량20%이상)'), ['칼슘/유청칼슘 (유청 유래)/natural'])
  assert.deepEqual(read('헴철'), ['철/헴철 (천연 유래)/natural'])
  assert.deepEqual(read('아셀렌산나트륨(고시형)'), ['셀레늄/아셀렌산나트륨/synthetic'])
  assert.deepEqual(read('사철쑥추출물분말'), ['-/분말 · 과립/unspecified'])
})

test('형태 이름에서 기원을 되찾는다', () => {
  assert.equal(originOfForm('건조효모(아연)'), 'yeast')
  assert.equal(originOfForm('산화아연'), 'synthetic')
  assert.equal(originOfForm('해조칼슘 (천연 유래)'), 'natural')
  // 제제 꼬리표가 붙어도 기원은 같다.
  assert.equal(originOfForm('비타민D3(콜레칼시페롤) · 혼합제제'), 'synthetic')
  assert.equal(originOfForm('건조효모(셀레늄) · 혼합제제'), 'yeast')
})

const product = (id, ingredients, markers = []) => ({
  id,
  name: id,
  manufacturer: '테스트',
  form: '정제',
  formRaw: '정제',
  weightLabel: '-',
  weightMg: null,
  mainIngredients: ingredients,
  mainDetail: '',
  markers,
  subIngredients: [],
})

const mg = (name, value) => ({ name, value, unit: 'mg', mgValue: value, raw: `${value}mg` })

const yeastZinc = product('yeast-zinc', ['건조효모(아연함유)', '스테아린산마그네슘'])
const oxideZinc = product('oxide-zinc', ['산화아연(고시형)'])
const premixD = product('premix-d', ['비타민D3혼합제제'])

test('제품 단위 판정은 부형제를 걸러낸 성분만 남긴다', () => {
  const sources = productSources(yeastZinc)
  assert.deepEqual([...sources.forms.keys()], ['아연'])
  assert.deepEqual([...sources.forms.get('아연')], ['건조효모(아연)'])
})

test('영양성분을 고르면 조건은 그 성분에만 걸린다', () => {
  const products = [yeastZinc, oxideZinc, premixD]
  const filter = (patch) => applyFilters(products, { ...EMPTY_FILTERS, ...patch }).map((p) => p.id)

  assert.deepEqual(filter({ sourceNutrient: '아연' }), ['yeast-zinc', 'oxide-zinc'])
  assert.deepEqual(filter({ sourceNutrient: '아연', sourceForms: ['건조효모(아연)'] }), ['yeast-zinc'])
  assert.deepEqual(filter({ sourceNutrient: '아연', sourceFormExclude: ['건조효모(아연)'] }), ['oxide-zinc'])
  // '아연 + 효모 유래' 는 아연을 효모로 넣은 제품이다.
  assert.deepEqual(filter({ sourceNutrient: '아연', sourceOrigins: ['yeast'] }), ['yeast-zinc'])
  assert.deepEqual(filter({ sourceNutrient: '아연', sourceOrigins: ['synthetic'] }), ['oxide-zinc'])
  // 성분을 고르지 않으면 제품 전체의 원료를 훑는다.
  assert.deepEqual(filter({ sourceOrigins: ['yeast'] }), ['yeast-zinc'])
})

test('형태별 건수는 제품 단위로 센다', () => {
  const options = sourceFormOptions([yeastZinc, oxideZinc, oxideZinc], '아연')
  assert.deepEqual(options, [
    { form: '산화아연', count: 2, origin: 'synthetic' },
    { form: '건조효모(아연)', count: 1, origin: 'yeast' },
  ])
})

test('탄산칼슘도 기준규격에 칼슘 함량이 있을 때만 칼슘 영양원으로 센다', () => {
  // 칼슘 함량이 높아 주원료로 쓰면 원재료명 최상단에 온다.
  const declared = product('declared', ['탄산칼슘', '결정셀룰로오스'], [mg('칼슘', 300)])
  assert.deepEqual([...productSources(declared).forms.get('칼슘')], ['탄산칼슘'])

  // 칼슘 표기가 없고 끝자락에 있으면 백색 필름코팅제·타정 충전제다.
  const coating = product('coating', ['루테인', '결정셀룰로오스', '탄산칼슘'], [mg('루테인', 20)])
  assert.equal(productSources(coating).forms.has('칼슘'), false)
  assert.deepEqual([...productSources(coating).excipientForms], [
    '탄산칼슘 (부형제 · 칼슘 함량 표시 없음)',
  ])
})

test('인산칼슘은 기준규격에 칼슘 함량이 있을 때만 칼슘 영양원으로 센다', () => {
  // 영양·기능정보에 칼슘 함량(mg)이 잡히면 칼슘 보충 목적으로 넣은 것이다.
  const declared = product('declared', ['제삼인산칼슘'], [mg('칼슘', 210)])
  assert.deepEqual([...productSources(declared).forms.get('칼슘')], ['인산칼슘 (제2 · 제3)'])
  assert.equal(productSources(declared).excipientForms.size, 0)

  // 칼슘 함량이 없고 원재료명 끝자락에만 적혀 있으면 고결방지제·타정 부형제다.
  const excipient = product('excipient', ['프로폴리스추출물', '제삼인산칼슘'], [mg('총 플라보노이드', 16.65)])
  assert.equal(productSources(excipient).forms.has('칼슘'), false)
  assert.deepEqual([...productSources(excipient).excipientForms], [
    '인산칼슘 (부형제 · 칼슘 함량 표시 없음)',
  ])

  // '확인' 처럼 정성 규격만 있으면 함량 표시가 아니다.
  const qualitative = product('qualitative', ['제이인산칼슘'], [
    { name: '칼슘', value: 0, unit: '%', mgValue: null, raw: '확인' },
  ])
  assert.equal(productSources(qualitative).forms.has('칼슘'), false)
})

test('부형제로 뺀 인산칼슘은 칼슘 조건에 걸리지 않는다', () => {
  const declared = product('declared', ['제삼인산칼슘'], [mg('칼슘', 210)])
  const excipient = product('excipient', ['프로폴리스추출물', '제삼인산칼슘'], [mg('총 플라보노이드', 16.65)])
  const matched = applyFilters([declared, excipient], { ...EMPTY_FILTERS, sourceNutrient: '칼슘' })
  assert.deepEqual(matched.map((p) => p.id), ['declared'])
})

test('영양성분만 고른 상태는 조건 개수로 세지 않는다', () => {
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, sourceNutrient: '아연' }), 0)
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, sourceNutrient: '아연', sourceForms: ['산화아연'] }), 1)
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, sourceFormExclude: ['산화아연'] }), 1)
})
