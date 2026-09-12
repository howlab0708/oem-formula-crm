const { test } = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./helpers/loadTs.cjs')

const loadTs = createLoader()
const { canonicalManufacturer, manufacturerGroup, buildManufacturerTiers, TIER } = loadTs('src/lib/manufacturerRank.ts')
const { prepareReferences } = loadTs('src/lib/referenceOrder.ts')
const { referenceProductPriority } = loadTs('src/lib/referencePriority.ts')

const base = {
  name: '테스트 제품', manufacturer: '(주)테스트', form: '정제', formRaw: '정제',
  weightLabel: '1g', weightMg: 1000, unitWeightMg: 500,
  mainIngredients: [], mainDetail: '', markers: [], subIngredients: [],
}
const product = (id, manufacturer, name, reportedAt) => ({ ...base, id, manufacturer, name, reportedAt })

test('공장 표기는 원문 그대로 두고 깨진 법인격 표기만 바로잡는다', () => {
  // 괄호가 깨졌거나 법인격이 이름에 붙어 있는 경우
  assert.equal(canonicalManufacturer('주)팜크로스'), '(주)팜크로스')
  assert.equal(canonicalManufacturer('㈜글로벌피앤피'), '(주)글로벌피앤피')
  assert.equal(canonicalManufacturer('주식회사케이지이'), '주식회사 케이지이')
  assert.equal(canonicalManufacturer('콜마비앤에이치(주)음성공장'), '콜마비앤에이치(주) 음성공장')
  assert.equal(canonicalManufacturer('(주) 에치와이 논산공장'), '(주)에치와이 논산공장')
  // 법인명에 공장 번호가 바로 붙은 경우만 띄운다.
  assert.equal(canonicalManufacturer('주식회사 노바렉스2공장'), '주식회사 노바렉스 2공장')
  // 공장 이름 자체는 건드리지 않는다 - 없던 이름을 만들어 내면 안 된다.
  assert.equal(canonicalManufacturer('(주)서흥 오송2공장'), '(주)서흥 오송2공장')
  assert.equal(canonicalManufacturer('주식회사 네추럴웨이 포천 제2공장'), '주식회사 네추럴웨이 포천 제2공장')
  assert.equal(canonicalManufacturer('경북과학대학식품공장'), '경북과학대학식품공장')
})

test('공식 상호가 확인된 법인만 교정하고 미확인 상호는 보존한다', () => {
  // 원본에 `주식회사한미양행`과 `(주)한미양행 선유공장`이 함께 있다.
  assert.equal(canonicalManufacturer('주식회사한미양행'), '(주)한미양행')
  assert.equal(canonicalManufacturer('(주)한미양행 선유공장'), '(주)한미양행 선유공장')
  assert.equal(canonicalManufacturer('고려인삼과학주식회사'), '고려인삼과학주식회사')
  assert.equal(canonicalManufacturer('고려은단 헬스케어(주)'), '고려은단 헬스케어(주)')
  assert.equal(canonicalManufacturer('(주)종근당건강'), '종근당건강(주)')
  // 등기 상호가 확인된 표기는 손대지 않는다.
  assert.equal(canonicalManufacturer('주식회사 노바렉스'), '주식회사 노바렉스')
  assert.equal(canonicalManufacturer('종근당건강(주)'), '종근당건강(주)')
})

test('공장은 별개 항목으로 남되 등급은 모기업 기준으로 함께 움직인다', () => {
  assert.notEqual(canonicalManufacturer('주식회사 노바렉스'), canonicalManufacturer('주식회사 노바렉스2공장'))
  assert.equal(manufacturerGroup('주식회사 노바렉스'), manufacturerGroup('주식회사 노바렉스2공장'))
  assert.equal(manufacturerGroup('(주)서흥'), manufacturerGroup('(주)서흥 오송2공장'))
  assert.equal(manufacturerGroup('(주)쎌바이오텍'), manufacturerGroup('(주)쎌바이오텍 1공장, 2공장'))
  assert.equal(manufacturerGroup('콜마비앤에이치(주)'), manufacturerGroup('콜마비앤에이치(주)세종3공장'))
})

test('메이저는 건수와 무관하게 1등급, 나머지는 건수 상위가 2등급', () => {
  const tiers = buildManufacturerTiers(new Map([
    ['종근당건강(주)', 3],
    ['(주)이름모를제조소', 900],
    ['(주)더작은곳', 1],
  ]))
  assert.equal(tiers.get('종근당건강(주)'), TIER.MAJOR)
  assert.equal(tiers.get('(주)이름모를제조소'), TIER.LARGE)
})

test('메이저를 페이지마다 분산시키고, 같은 제조소 안에서는 대표 브랜드와 최신 품목을 먼저 보여준다', () => {
  const products = [
    product('a1', '(주)이름모를제조소', '무명 제품 1', '20260101'),
    product('a2', '(주)이름모를제조소', '무명 제품 2', '20260102'),
    product('b1', '종근당건강(주)', '오래된 품목', '20150101'),
    product('b2', '종근당건강(주)', '락토핏 생유산균', '20200101'),
    product('b3', '종근당건강(주)', '최신 품목', '20260301'),
    product('c1', '(주)한국인삼공사', '홍삼 일반 품목', '20240101'),
  ]
  const ordered = prepareReferences(products).map((p) => p.id)

  // 1등급(종근당건강·한국인삼공사)이 무명 제조소보다 먼저 나온다.
  assert.ok(ordered.indexOf('a1') > ordered.indexOf('c1'))
  // 두 메이저가 번갈아 나온다 - 한 회사가 연속으로 쏟아지지 않는다.
  assert.equal(ordered[0], 'b2')
  assert.ok(ordered.indexOf('c1') < ordered.indexOf('b1'))
  // 같은 제조소 안에서는 대표 브랜드 → 최신 허가일자 순.
  assert.ok(ordered.indexOf('b2') < ordered.indexOf('b3'), '대표 브랜드가 최신 품목보다 먼저')
  assert.ok(ordered.indexOf('b3') < ordered.indexOf('b1'), '최신 품목이 오래된 품목보다 먼저')
  // 건수는 그대로다.
  assert.equal(ordered.length, products.length)
})

test('브랜드 판매명이 일치하면 실제 OEM 공장의 기존 등급보다 우선한다', () => {
  const ordered = prepareReferences([
    product('raw', '종근당건강(주)', '일반 품목', '20260101'),
    product('imvita', '주식회사 네추럴웨이 포천 제2공장', '아임비타 멀티비타민 이뮨샷', '20240802'),
    product('elena', '(주)빅솔 반월공장', '엘레나', '20240101'),
  ])
  assert.equal(ordered.at(-1).id, 'raw')
  assert.equal(ordered.find(p => p.id === 'elena').manufacturer, '(주)빅솔 반월공장')
})

test('같은 제품군의 OEM 공장이 여럿이어도 제품군마다 한 번씩 순환한다', () => {
  const ordered = prepareReferences([
    product('lacto', '종근당건강(주)', '락토핏 골드', '20230101'),
    product('imvita-a', '주식회사 네추럴웨이 포천 제2공장', '아임비타 멀티비타민 이뮨샷', '20260101'),
    product('imvita-b', '주식회사 노바렉스2공장', '아임비타 멀티비타민 데일리', '20250101'),
    product('elena', '(주)빅솔 반월공장', '엘레나', '20240101'),
  ])
  assert.deepEqual(ordered.map(p => p.id), ['lacto', 'imvita-a', 'elena', 'imvita-b'])
  assert.equal(new Set(ordered.map(p => p.manufacturer)).size, 4)
})

test('수출품, 일반명 유사품, 다른 제조사의 동명 상품에 판매명 우선순위를 주지 않는다', () => {
  for (const [manufacturer, name] of [
    ['종근당건강(주)', '락토핏 골드(일본수출용)'],
    ['(주)한국씨엔에스팜', '아임비타민:D'],
    ['(주)한미양행', '공스킨 활력비타민B 컴플렉스'],
    ['(주)다른공장', '엘레나'],
  ]) assert.equal(referenceProductPriority(product('x', manufacturer, name)), 2)
  assert.equal(prepareReferences([
    product('export', '종근당건강(주)', '락토핏 골드(수출용)', '20260101'),
    product('domestic', '(주)다른공장', '국내용', '20200101'),
  ])[1].id, 'export')
})

test('서로 다른 원본 제조소는 보정 상호가 같아져도 통합하지 않는다', () => {
  const names = ['주식회사 다정', '(주)다정', '고려은단 헬스케어(주)', '고려은단헬스케어(주)', '(주)종근당건강', '종근당건강(주)']
  const ordered = prepareReferences(names.map((name, i) => product(String(i), name, '제품')))
  assert.equal(new Set(ordered.map(p => p.manufacturer)).size, names.length)
  assert.deepEqual(new Set(ordered.map(p => p.id)), new Set(names.map((_, i) => String(i))))
})

test('1~3페이지에서 기업과 공장을 순환하며 제품 누락·중복·원본 변형이 없다', () => {
  const names = ['종근당건강(주)', '주식회사 노바렉스', '주식회사 노바렉스2공장', '콜마비앤에이치(주)음성공장', '콜마비앤에이치(주)세종3공장']
  const input = names.flatMap((name, i) => Array.from({length: 60}, (_, j) => product(`${i}-${j}`, name, `일반 제품 ${j}`, '20260101')))
  const snapshot = JSON.stringify(input)
  const output = prepareReferences(input)
  for (let page = 0; page < 3; page++) {
    const rows = output.slice(page * 50, page * 50 + 50)
    assert.equal(new Set(rows.map(p => p.manufacturer)).size, 5)
    const parents = rows.map(p => manufacturerGroup(p.manufacturer))
    assert.ok(parents.every((parent, i) => i === 0 || parent !== parents[i - 1]))
  }
  assert.equal(new Set(output.map(p => p.id)).size, input.length)
  assert.deepEqual(prepareReferences(output).map(p => p.id), output.map(p => p.id))
  assert.equal(JSON.stringify(input), snapshot)
})

test('날짜 표기가 달라도 최신순이며 잘못된 날짜와 동률은 안정적으로 처리한다', () => {
  const ordered = prepareReferences([
    product('old', '종근당건강(주)', '일반', '2025-12-31'),
    product('bad', '종근당건강(주)', '일반', '99999999'),
    product('new', '종근당건강(주)', '일반', '20260101'),
    product('tie', '종근당건강(주)', '일반', '2026.01.01'),
  ])
  assert.deepEqual(ordered.map(p => p.id), ['new', 'tie', 'old', 'bad'])
})

test('표기가 바뀌어도 원본 객체는 건드리지 않는다', () => {
  const products = [product('a', '주식회사한미양행', '제품', '20260101')]
  const snapshot = JSON.stringify(products)
  const ordered = prepareReferences(products)
  assert.equal(ordered[0].manufacturer, '(주)한미양행')
  assert.equal(JSON.stringify(products), snapshot)
})
