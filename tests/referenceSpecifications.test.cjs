const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { referenceSpecifications: specs } = load('src/lib/referenceSpecifications.ts')
const { draftFromProduct } = load('src/lib/formulaDesign/fromProduct.ts')
const { parseC003 } = load('src/lib/server/mfdsC003.ts')
const { mapHeaders, rowToProduct } = load('src/lib/csvSchema.ts')
const { packSnapshot, unpackSnapshot } = load('src/lib/datasetSnapshot.ts')
const product = { id: 'r1', name: '참고 정제', manufacturer: '시험 공장', form: '정제', formRaw: '정제', weightLabel: '800mg', weightMg: 800, unitWeightMg: null, mainIngredients: ['비타민C'], subIngredients: ['셀룰로스'], mainDetail: '비타민C 100mg/800mg', markers: [], intakeMethod: '1일 2회, 1회 2정' }

const esther = { ...product, name: '여에스더 초임계 알티지 오메가3', manufacturer: '주식회사 노바렉스 2공장', reportNo: '200600200081211', form: '연질캡슐', weightLabel: '1020mg', weightMg: 1020,
  mainIngredients: ['비타민 E(고시형)', 'EPA 및 DHA 함유 유지(고시형)'], subIngredients: ['비타민 D3(고시형)', '변성전분', '글리세린', '스테아린산마그네슘'],
  markers: [{ name: 'EPA와 DHA의 합', mgValue: 600 }, { name: '비타민E', mgValue: 3.3 }, { name: '비타민D', mgValue: 0.025 }], intakeMethod: '1일 1회, 1회 1캡슐을 물과 함께 섭취하십시오.' }

test('실제 여에스더 규격: 동일 품목·공장·성분이 일치할 때 공식몰의 1020mg/30캡슐/PTP를 전달한다', () => {
  const info = specs(esther)
  assert.equal(info.unitWeightMg, 1020)
  assert.equal(info.unitsPerSet, '30')
  assert.equal(info.packaging, 'PTP 개별 포장')
  assert.equal(info.shelfLife, '') // 판매 로트의 만료 날짜를 새 견적에 복사하지 않는다.
  const sheet = draftFromProduct(esther).sheet
  assert.equal(sheet.spec.unitWeightMg, '1020')
  assert.equal(sheet.spec.unitsPerSet, '30')
  for (const patch of [{ name: esther.name + ' Daily' }, { manufacturer: '주식회사 노바렉스 1공장' }, { reportNo: 'other' }, { sourceUpdatedAt: '2026-10-01' }, { markers: [] }]) assert.equal(specs({ ...esther, ...patch }).officialSource, undefined)
})

test('비타민D 표시량이 있는 원본의 D3 원료를 기본 체크하고 부형제는 제외한다', () => {
  const sheet = draftFromProduct(esther).sheet
  assert.deepEqual(sheet.materials.map(row => row.functional), [true, true, true, false, false, false])
  const withoutD = { ...esther, markers: esther.markers.filter(m => m.name !== '비타민D') }
  assert.equal(draftFromProduct(withoutD).sheet.materials[2].functional, false)
  const magnesium = { ...esther, markers: [{ name: '마그네슘', mgValue: 100 }] }
  assert.equal(draftFromProduct(magnesium).sheet.materials.at(-1).functional, false)
})

test('명시된 내용량과 포장 규격·소비기한을 상세·견적·스냅샷에서 동일하게 보존한다', () => {
  const p = { ...product, referenceDetails: { declaredWeight: '48g (800mg × 60정)', packaging: 'PE병 / PTP 포장', shelfLife: '제조일로부터 24개월', storageGuide: '직사광선을 피하여 보관', appearance: '흰 정제', intakeCaution: '알레르기 확인' } }
  const info = specs(p)
  assert.equal(info.unitWeightMg, 800)
  assert.equal(info.unitsPerSet, '60')
  assert.deepEqual(info.missing, [])
  const { sheet } = draftFromProduct(p)
  for (const key of ['unitsPerSet', 'packaging', 'shelfLife']) assert.equal(sheet.spec[key], info[key])
  assert.equal(sheet.spec.setCount, '')
  assert.equal(sheet.spec.unitWeightMg, '800')
  assert.match(sheet.memo, /직사광선/)
  assert.match(sheet.memo, /알레르기 확인/)
  const meta = { generation: 'one', imported_rows: 1 }
  const snapshot = packSnapshot(meta, [p])
  assert.deepEqual(unpackSnapshot(JSON.parse(JSON.stringify(snapshot)), meta), [p])
})

test('표시 성분 함량·일일섭취량·섭취 횟수를 1정 중량 또는 포장 개수로 추정하지 않는다', () => {
  const info = specs(product)
  assert.equal(info.unitWeightMg, null)
  assert.equal(info.unitsPerSet, '')
  const liquid = specs({ ...product, form: '액상', weightLabel: '80ml', intakeMethod: '1일 1회 1포(80ml)' })
  assert.equal(liquid.unitWeightMg, null)
  assert.equal(liquid.unitsPerSet, '')
  const powder = specs({ ...product, form: '분말', weightLabel: '3g × 30포', intakeMethod: '1일 1회 1포(3g)' })
  assert.equal(powder.unitWeightMg, 3000)
  assert.equal(powder.unitsPerSet, '30')
})

test('일치 확인된 동일 공장의 생산 이력 규격만 가져오고 개별 로트 만료일은 소비기한 조건으로 쓰지 않는다', () => {
  const lot = { productName: '참고 정제(800mg×60정)', manufacturer: '시험 공장', productionDate: '2026-01-01', expirationDate: '2028-01-01', ingredients: [] }
  const p = { ...product, traceability: { status: 'matched', lot } }
  assert.equal(specs(p).unitWeightMg, 800)
  assert.equal(specs(p).unitsPerSet, '60')
  assert.equal(specs(p).shelfLife, '')
  for (const status of ['needs_review', 'not_found']) assert.equal(specs({ ...p, traceability: { status, lot } }).unitWeightMg, null)
  assert.equal(specs({ ...p, traceability: { status: 'matched', lot: { ...lot, manufacturer: '시험 2공장' } } }).unitWeightMg, null)
})

test('혼합 세트·상이한 포장 개수는 하나의 포장으로 임의 확정하지 않는다', () => {
  for (const weightLabel of ['800mg × 60정 × 2병', '800mg × 30정 + 500mg × 30캡슐', '800mg × 30정 또는 60정']) assert.equal(specs({ ...product, weightLabel }).unitsPerSet, '')
  assert.equal(specs({ ...product, weightLabel: '800mg × 60정', referenceDetails: { unitsPerSet: '30' } }).unitsPerSet, '')
})

test('C003에서 누락됐던 소비기한·성상·보관방법·주의사항을 적재한다', () => {
  const source = structuredClone(require('./fixtures/mfds-c003-sample.json'))
  source.C003.row[0].CSTDY_MTHD = '서늘한 곳'
  const p = parseC003(source, 1, source.C003.row.length).products[0]
  assert.equal(p.referenceDetails.shelfLife, source.C003.row[0].POG_DAYCNT)
  assert.equal(p.referenceDetails.appearance, source.C003.row[0].DISPOS)
  assert.equal(p.referenceDetails.storageGuide, '서늘한 곳')
  assert.equal(draftFromProduct(p).sheet.spec.shelfLife, source.C003.row[0].POG_DAYCNT)
})

test('명시된 CSV 포장 정보가 중량·섭취방법 열과 혼동되지 않는다', () => {
  const headers = ['제품명', '제형', '규격', '포장 개수', '포장 형태', '소비기한', '보관방법']
  const p = rowToProduct(['가상 제품', '정제', '800mg × 60정', '60', '병', '24개월', '실온'], mapHeaders(headers), 0)
  assert.equal(specs(p).unitsPerSet, '60')
  assert.equal(specs(p).unitWeightMg, 800)
  assert.equal(specs(p).packaging, '병')
})

test('분말의 낱개 중량·포장 개수와 명시된 포장형태를 함께 자동 입력한다', () => {
  for (const declaredWeight of ['1포 중량: 2g, 30포입, 스틱포 포장', '2g/포, 30포/박스, 스틱포 포장', '1포 중량: 2g, 1박스: 30포, 스틱포 포장']) {
    const p = { ...product, form: '분말', intakeMethod: '1일 1회, 1회 1포를 섭취하십시오.', referenceDetails: { declaredWeight } }
    const { sheet } = draftFromProduct(p)
    assert.equal(sheet.spec.unitWeightMg, '2000', declaredWeight)
    assert.equal(sheet.spec.unitsPerSet, '30', declaredWeight)
    assert.equal(sheet.spec.packaging, '스틱포 포장', declaredWeight)
    assert.equal(sheet.spec.intakeGuide, p.intakeMethod)
    assert.equal(sheet.spec.setCount, '')
  }
})

test('정제의 명시된 1정 규격과 PTP 포장을 읽고 포장 선택지는 확정하지 않는다', () => {
  const p = { ...product, intakeMethod: '', referenceDetails: { declaredWeight: '800mg/정, 60정입, PTP 포장' } }
  assert.equal(specs(p).unitWeightMg, 800)
  assert.equal(specs(p).unitsPerSet, '60')
  assert.equal(specs(p).packaging, 'PTP 포장')
  assert.equal(specs({ ...p, referenceDetails: { declaredWeight: '800mg/정, PTP 또는 PE병 선택' } }).packaging, '')
})

test('분말이라는 제형·제품명·섭취 횟수에서 포장 규격을 만들어 내지 않는다', () => {
  const p = { ...product, form: '분말', name: '유산균 스틱', weightLabel: '2,000mg', intakeMethod: '1일 1회 1포' }
  assert.equal(specs(p).unitWeightMg, null)
  assert.equal(specs(p).unitsPerSet, '')
  assert.equal(specs(p).packaging, '')
  assert.ok(specs({ ...p, intakeMethod: '' }).missing.includes('섭취방법'))
})
