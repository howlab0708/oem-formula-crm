/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const catalog = require('../src/data/dashboardReferences.json')
const load = require('./helpers/loadTs.cjs')({ [path.resolve(__dirname, '../src/data/dashboardReferences.json.ts')]: catalog })
const { dailyWeightMg, dailyMarkerValue, buildDashboardSummary, includesRecognizedIngredient } = load('src/lib/dashboardSummary.ts')
const { rowToProduct, mapHeaders } = load('src/lib/csvSchema.ts')
const { EMPTY_FILTERS, applyFilters } = load('src/lib/filters.ts')
const mapping = mapHeaders(['PRDLST_NM', 'BSSH_NM', 'PRDT_SHAP_CD_NM', 'NTK_MTHD', 'STDR_STND', '주원료'])
const product = (intake, detail = '비타민C: 표시량(500mg/1000mg)의 80~150%', extra = {}) => ({
  ...rowToProduct(['테스트', '회사 A', '정제', intake, detail, '비타민C'], mapping, 0), ...extra,
})

test('daily mass distinguishes a pill, a serving, and a full day, including packets', () => {
  for (const [intake, form, expected] of [
    ['1일 3회, 1회2캡슐(250mg/1캡슐)', '경질캡슐', 1500],
    ['1일 2회, 1회 2정(1,000mg)', '정제', 2000],
    ['하루 2정(1,000mg)', '정제', 1000],
    ['1일 2회, 1회 1포(3g)', '분말', 6000],
    ['1일 2회, 1회 2포(3g/1포)', '분말', 12000],
    ['1일 2회, 1회 1g을 물과 함께 섭취', '분말', 2000],
    ['1일 섭취량: 2g', '분말', 2000],
  ]) assert.equal(dailyWeightMg(product(intake, undefined, { form })), expected, intake)
})

test('daily mass excludes missing, variable, volume-only, conflicting and age-specific data', () => {
  for (const intake of ['', '1회 1정(500mg)', '1일 1~2회, 1회 1정(500mg)', '1일 1회 1~2정(500mg)',
    '성인 1일 2회 1회 1정(500mg), 어린이 1일 1회 1정(500mg)',
    '1일 1회 1정(2ml)', '1일 1회 1정(500mg), 1정당 600mg',
    '1일 1회 2정(500mg, 600mg)', '1일 0회 1회 1정(500mg)', '1일 1회 0정(500mg)',
    '1일 1회, 1회 1정(500mg) 및 1캡슐(500mg)', '1일 1회, 1회 1정(500mg), 1캡슐(500mg)',
  ]) assert.equal(dailyWeightMg(product(intake, undefined, { unitWeightMg: null })), null, intake)
  assert.equal(dailyWeightMg(product('1일 1회 1포(20ml)', undefined, { form: '액상' })), null)
  assert.equal(dailyWeightMg(product('1일 1회 1정 비타민C 500mg')), null)
})

test('each nutrient uses its own denominator; units are converted before daily scaling', () => {
  const p = product('1일 3회, 1회2캡슐(250mg/1캡슐)', '칼슘: 표시량(285.9mg/1500mg)의 80~150%\n비타민C: 표시량(0.1g/0.5g)의 80~150%', { form: '캡슐' })
  const weight = dailyWeightMg(p)
  assert.equal(weight, 1500)
  assert.equal(dailyMarkerValue(p, p.markers[0], weight), 285.9)
  assert.ok(Math.abs(dailyMarkerValue(p, p.markers[1], weight) - .3) < 1e-9)
  const missing = product('1일 1회 2정(1000mg)', '비타민C: 표시량(500mg)의 80~150%\n칼슘: 표시량(100mg/1000mg)의 80~150%')
  assert.equal(dailyMarkerValue(missing, missing.markers[0], 1000), null)
})

test('no guessed daily values from legacy fields; explicit daily marker basis is supported', () => {
  const p = product('', '비타민C: 500mg (1일 섭취량 당)')
  assert.equal(dailyMarkerValue(p, p.markers[0], null), 500)
  const missing = product('', '비타민C: 표시량(500mg/1000mg)의 80~150%', { weightMg: 1000 })
  assert.equal(dailyMarkerValue(missing, missing.markers[0], null), null)
  const variable = product('', '비타민C: 250~500mg (1일 섭취량 당)')
  assert.equal(dailyMarkerValue(variable, variable.markers[0], null), null)
})

test('RDA 100% is inclusive, uses 100mg vitamin C and counts each product once', () => {
  const ps = [30, 99, 100, 500].map(v => product('1일 1회 2정(1000mg)', `비타민C: 표시량(${v}mg/1000mg)의 80~150%`))
  const result = buildDashboardSummary(ps, EMPTY_FILTERS)
  assert.equal(result.content.comparableCount, 4)
  assert.equal(result.content.highCount, 2)
  assert.equal(result.content.highShare, .5)
})

test('mixed mass units compare correctly; AI-only and non-RDA ingredients excluded', () => {
  const p = product('1일 1회 2정(1000mg)', '비타민C: 표시량(30mg/1000mg)의 80~150%\n비타민D: 표시량(0.003mg/1000mg)의 80~150%')
  const q = product('1일 1회 2정(1000mg)', '비타민C: 표시량(0.1g/1g)의 80~150%\n칼슘: 표시량(800mg/1000mg)의 80~150%')
  const r = product('1일 1회 2정(1000mg)', '실리마린: 표시량(130mg/1000mg)의 80~150%')
  const result = buildDashboardSummary([p,q,r], EMPTY_FILTERS)
  assert.equal(result.content.productCount, 3)
  assert.equal(result.content.comparableCount, 2)
  assert.equal(result.content.highCount, 1)
  assert.equal(result.content.highShare, .5)
  assert.equal(buildDashboardSummary([r], EMPTY_FILTERS).content.highShare, null)
  // 표는 비타민·무기질만 담는다. 권장섭취량이 없는 영양소는 충분섭취량을 그렇다고 밝히고 쓴다.
  assert.equal(result.content.rows.some(row => row.name === '실리마린'), false)
  const vitaminD = result.content.rows.find(row => row.name === '비타민D')
  assert.deepEqual({ basis: vitaminD.basis, amount: vitaminD.amount, unit: vitaminD.unit }, { basis: 'AI', amount: 10, unit: 'μg' })
  assert.deepEqual({ common: vitaminD.common, commonCount: vitaminD.commonCount }, { common: 3, commonCount: 1 })
  const vitaminC = result.content.rows.find(row => row.name === '비타민C')
  // 30mg 과 100mg 이 한 건씩이라 동수다. 이때는 작은 값을 쓴다.
  assert.deepEqual({ basis: vitaminC.basis, amount: vitaminC.amount, count: vitaminC.count, common: vitaminC.common },
    { basis: 'RNI', amount: 100, count: 2, common: 30 })
})

test('marker name decorations and vitamer spellings collapse into one nutrient row', () => {
  const spec = value => `1일 1회 2정(1000mg)`
  const of = (marker, value) => product(spec(), `${marker}: 표시량(${value}mg/1000mg)의 80~150%`)
  const rows = buildDashboardSummary(
    [of('- 아연', 5), of('아연(%)', 5), of('아연 함량', 5), of('(다)아연', 3), of('■ 아연', 7), of('아연(정제2)', 800)],
    EMPTY_FILTERS).content.rows
  assert.equal(rows.length, 1)
  // 여섯 표기가 한 줄로 합쳐지고, 800mg 같은 튀는 표본이 있어도 최빈값은 흔들리지 않는다.
  assert.deepEqual({ name: rows[0].name, count: rows[0].count, common: rows[0].common, commonCount: rows[0].commonCount },
    { name: '아연', count: 6, common: 5, commonCount: 3 })
  // 비타민 동족체는 합치고, 무기질의 염 이름은 합치지 않는다.
  const vitamers = buildDashboardSummary([of('티아민', 1), of('비타민B1', 2)], EMPTY_FILTERS).content.rows
  assert.deepEqual(vitamers.map(r => r.name), ['비타민B1'])
  assert.equal(buildDashboardSummary([of('산화아연', 5)], EMPTY_FILTERS).content.rows.length, 0)
})

test('sex/age profile changes the RNI and equivalent-unit evidence is required', () => {
  const { compareRda } = load('src/lib/rda.ts')
  assert.equal(compareRda('철', 8, '', 'male-0').ratio, 1)
  assert.equal(compareRda('철', 8, '', 'female-0').ratio, 8/12)
  assert.equal(compareRda('철', 7, '', 'male-4').ratio, 1)
  assert.equal(compareRda('엽산', .4, '400μg', 'male-0').ratio, null)
  assert.equal(compareRda('엽산', .4, '400μg DFE', 'male-0').ratio, 1)
  assert.equal(compareRda('비타민A', .8, '800μg RE', 'male-0').ratio, null)
  assert.equal(compareRda('비타민A', .8, '800μg RAE', 'male-0').ratio, 1)
  for (const name of ['비타민D','비타민E','비타민K','비오틴','판토텐산','망간','크롬']) assert.equal(compareRda(name, 999, '', 'male-0').ratio, null)
})

test('minimum physical unit is independent of daily frequency and duration', () => {
  const { standardUnitWeightMg } = load('src/lib/standardUnitWeight.ts')
  for (const [text, form, expected] of [
    ['1일 3회, 1회2캡슐(250mg/1캡슐)', '캡슐', 250],
    ['1일 2회, 1회 2정(1000mg)', '정제', 500],
    ['1일 2회, 1회 2포(6g)', '분말', 3000],
    ['1일 2회, 1회 2포(3g/1포)', '분말', 3000],
    ['1회 1포(3g)', '분말', 3000],
    ['1일 섭취량 3000mg', '정제', null],
    ['1일 1회, 1회 1병(31500mg), 정제를 액상과 함께 섭취', '정제', null],
    ['1일 1회 1포(2g)', '정제', null],
    ['1일 1회, 1회 1정(500mg)을 물 200ml와 함께 섭취', '정제', 500],
    ['500mg×0정', '정제', null],
    ['1일 2회, 1회 10ml', '액상', null],
  ]) assert.equal(standardUnitWeightMg(product(text, '', { form, unitWeightMg: null })), expected, text)
  assert.equal(standardUnitWeightMg(product('', '', { weightLabel: '60g(120정)', unitWeightMg: null })), 500)
  assert.equal(standardUnitWeightMg(product('1일 1회 1.5정(500mg)', '', { unitWeightMg: null })), null)
  assert.equal(standardUnitWeightMg(product('', '', { weightLabel: '총 내용량 60g (120정)', unitWeightMg: null })), 500)
  assert.equal(standardUnitWeightMg(product('', '', { weightLabel: '총 내용량 60g (30일분)', unitWeightMg: null })), null)
  assert.equal(standardUnitWeightMg(product('', '', { weightLabel: '총 내용량 60g (0정)', unitWeightMg: null })), null)
  const result = buildDashboardSummary([product('1일 3회, 1회2캡슐(250mg/1캡슐)', '', {form:'캡슐'}), product('1일 2회 1회 2정(1000mg)')], EMPTY_FILTERS)
  assert.equal(result.unitWeight.median, 375)
  assert.equal(result.unitWeight.rangeChecks.capsule.outside, 1)
})

test('recognized share counts products once and does not classify common notified names by similarity', () => {
  const p = product('', '', { mainIngredients: ['저분자콜라겐펩타이드', '시험원료(개별인정형)'] })
  const q = product('', '', { mainIngredients: ['홍삼', '비타민C'] })
  assert.equal(includesRecognizedIngredient(p), true)
  assert.equal(includesRecognizedIngredient(q), false)
  assert.equal(includesRecognizedIngredient(product('', '', { mainIngredients: ['저분자콜라겐펩타이드 유사원료'] })), false)
  const result = buildDashboardSummary([p, q], EMPTY_FILTERS)
  assert.equal(result.recognizedCount, 1)
  assert.equal(result.recognizedShare, .5)
})

test('all metrics follow the active result set; manufacturer duplicates/unknowns and empty states', () => {
  const p = product('1일 1회 1정(1000mg)', undefined, { manufacturer: '회사 A' })
  const q = product('1일 1회 1정(2000mg)', undefined, { manufacturer: '회사A' })
  const r = product('', '', { manufacturer: '미상' })
  const result = buildDashboardSummary([p, q, r], EMPTY_FILTERS)
  assert.equal(result.manufacturerCount, 1)
  assert.equal(result.manufacturerKnownCount, 2)
  assert.equal(result.unitWeight.median, 1500)
  const filters = { ...EMPTY_FILTERS, manufacturers: ['회사 A'] }
  assert.equal(buildDashboardSummary(applyFilters([p, q, r], filters), filters).unitWeight.median, 1000)
  const empty = buildDashboardSummary([], EMPTY_FILTERS)
  assert.equal(empty.recognizedShare, null)
  assert.equal(empty.content.highShare, null)
  assert.equal(empty.unitWeight.median, null)
})

test('selected marker takes precedence over main ingredients and unrelated values stay out', () => {
  const p = product('1일 1회 1정(1000mg)', '비타민C: 표시량(500mg/1000mg)의 80~150%\n칼슘: 표시량(210mg/1000mg)의 80~150%')
  const byMain = buildDashboardSummary([p], { mains: ['칼슘'], marker: null })
  assert.equal(byMain.content.rows.length, 1)
  assert.equal(byMain.content.rows[0].name, '칼슘')
  const byMarker = buildDashboardSummary([p], { mains: ['칼슘'], marker: { name: '비타민C', unit: 'mg' } })
  assert.equal(byMarker.content.rows[0].name, '비타민C')
})
