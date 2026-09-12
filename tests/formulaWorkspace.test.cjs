const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { createFormulaWorkspace, formulaWorkspaceReducer: reduce, newFormulaDraft, recordFormulaDraft, duplicateFormulaDraft, formulaReferenceKey } = load('src/lib/formulaDesign/workspace.ts')
const { sheetReducer } = load('src/lib/formulaDesign/reducer.ts')
const { calculate } = load('src/lib/formulaDesign/calc.ts')

const product = { id: 'csv-10', name: '검토 제품 A', manufacturer: '제조사 2공장', reportNo: '20260010',
  form: '정제', formRaw: '정제', unitWeightMg: 800, weightLabel: '', weightMg: null,
  mainIngredients: ['비타민C'], subIngredients: [], markers: [], mainDetail: '' }

test('서로 다른 레퍼런스가 새 시트로 열리고 원본 시트와 공장 정보가 유지된다', () => {
  let workspace = createFormulaWorkspace(newFormulaDraft(product))
  const first = workspace.tabs[0]
  workspace = reduce(workspace, { type: 'open', draft: newFormulaDraft({ ...product, id: 'csv-11', name: '검토 제품 B', manufacturer: '제조사 3공장', reportNo: '20260011' }) })
  assert.equal(workspace.tabs.length, 2)
  assert.equal(workspace.activeId, workspace.tabs[1].id)
  assert.equal(workspace.tabs[0], first)
  assert.equal(workspace.tabs[0].initialDraft.reference.manufacturer, '제조사 2공장')
  workspace = reduce(workspace, { type: 'activate', id: first.id })
  assert.equal(workspace.activeId, first.id)
  assert.equal(workspace.tabs[1].initialDraft.sheet.spec.productName, '검토 제품 B')
})

test('사본의 배합비·수량·계산·메모를 바꿔도 원본과 서버 저장 id에는 영향이 없다', () => {
  const original = newFormulaDraft(product)
  original.company = '검토 회사'
  original.noteId = 'note-1'
  original.exportOptions = { title: '원본 제안서', showPrice: true, showExtras: true, showTiers: false, showIssuer: true }
  original.saved = { id: 'formula-original', version: 3, updatedAt: '2026-09-12' }
  original.sheet = sheetReducer(original.sheet, { type: 'spec', key: 'unitsPerSet', value: '60' })
  original.sheet = sheetReducer(original.sheet, { type: 'spec', key: 'setCount', value: '1000' })
  original.sheet = sheetReducer(original.sheet, { type: 'material', id: original.sheet.materials[0].id, patch: { ratio: '100', unitPrice: '10000' } })
  const before = JSON.stringify(original)
  const beforeTotal = calculate(original.sheet).supplyTotal
  const copy = duplicateFormulaDraft(original)
  assert.deepEqual(copy.exportOptions, original.exportOptions)
  copy.exportOptions.title = '사본 제안서'
  copy.exportOptions.showPrice = false
  copy.sheet = sheetReducer(copy.sheet, { type: 'spec', key: 'setCount', value: '2000' })
  copy.sheet = sheetReducer(copy.sheet, { type: 'material', id: copy.sheet.materials[0].id, patch: { unitPrice: '5000' } })
  copy.sheet = sheetReducer(copy.sheet, { type: 'memo', value: '사본 메모' })
  copy.reference.name = '사본의 참고 이름'
  assert.equal(JSON.stringify(original), before)
  assert.equal(calculate(original.sheet).supplyTotal, beforeTotal)
  assert.equal(copy.saved, null)
  assert.equal(copy.dirty, true)
  assert.equal(copy.company, original.company)
  assert.equal(copy.noteId, original.noteId)
  assert.equal(copy.sheet.memo, '사본 메모')
  assert.notEqual(calculate(copy.sheet).unitPrice, calculate(original.sheet).unitPrice)
})

test('같은 저장 배합비는 열린 시트로 이동하여 편집 내용과 버전을 보존한다', () => {
  const record = { id: 'formula-1', version: 2, company: '검토', title: '저장된 견적', noteId: null,
    sheet: newFormulaDraft(product).sheet, createdAt: '2026-09-12', updatedAt: '2026-09-12' }
  let workspace = createFormulaWorkspace(recordFormulaDraft(record))
  const first = workspace.tabs[0]
  workspace = reduce(workspace, { type: 'open', draft: newFormulaDraft() })
  workspace = reduce(workspace, { type: 'metadata', id: first.id, meta: { ...first.meta, title: '편집한 견적', dirty: true } })
  workspace = reduce(workspace, { type: 'open', draft: recordFormulaDraft(record) })
  assert.equal(workspace.tabs.length, 2)
  assert.equal(workspace.activeId, first.id)
  assert.equal(workspace.tabs[0].meta.title, '편집한 견적')
  assert.equal(workspace.tabs[0].meta.dirty, true)
  assert.equal(workspace.tabs[0].initialDraft.saved.version, 2)
})

test('시트별 비동기 저장 완료가 다른 활성 시트의 저장 상태를 바꾸지 않는다', () => {
  let workspace = createFormulaWorkspace(newFormulaDraft(product))
  workspace = reduce(workspace, { type: 'open', draft: newFormulaDraft() })
  const first = workspace.tabs[0]
  const second = workspace.tabs[1]
  workspace = reduce(workspace, { type: 'metadata', id: first.id, meta: { ...first.meta, dirty: false, savedId: 'saved-a' } })
  assert.equal(workspace.activeId, second.id)
  assert.equal(workspace.tabs[1], second)
  assert.equal(workspace.tabs[1].meta.savedId, null)
  assert.equal(workspace.tabs[0].meta.savedId, 'saved-a')
})

test('닫기는 다른 시트를 보존하고 마지막 시트는 새로운 빈 시트로 바뀐다', () => {
  let workspace = createFormulaWorkspace(newFormulaDraft())
  workspace = reduce(workspace, { type: 'open', draft: newFormulaDraft(product) })
  const first = workspace.tabs[0]
  workspace = reduce(workspace, { type: 'close', id: workspace.activeId, emptyDraft: newFormulaDraft() })
  assert.equal(workspace.activeId, first.id)
  assert.equal(workspace.tabs[0], first)
  workspace = reduce(workspace, { type: 'close', id: first.id, emptyDraft: newFormulaDraft() })
  assert.equal(workspace.tabs.length, 1)
  assert.notEqual(workspace.activeId, first.id)
  assert.equal(workspace.tabs[0].initialDraft.reference, null)
  assert.equal(workspace.tabs[0].initialDraft.dirty, false)
})

test('데이터를 교체해 CSV 행 id가 재사용돼도 다른 신고 제품은 기존 탭과 구별한다', () => {
  assert.notEqual(formulaReferenceKey(product), formulaReferenceKey({ ...product, reportNo: '20260099' }))
  assert.notEqual(formulaReferenceKey(product), formulaReferenceKey({ ...product, manufacturer: '제조사 3공장' }))
  assert.equal(formulaReferenceKey(product), formulaReferenceKey({ ...product }))
})
