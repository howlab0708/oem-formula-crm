/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/loadTs.cjs')()
const { EMPTY_FILTERS } = load('src/lib/filters.ts')
const { validateSavedSearch } = load('src/lib/savedSearches.ts')
const { buildProvenance, validateProvenance, sourceDate, freshnessLabel } = load('src/lib/datasetProvenance.ts')
const { customerBriefing, DEFAULT_EXPORT_VISIBILITY } = load('src/lib/export/customerView.ts')
const { buildBriefing, briefingToText } = load('src/lib/export/briefing.ts')

test('saved searches preserve every filter and profile; client cannot inject ownership or SQL', () => {
  const filters = { ...EMPTY_FILTERS, query: "O'Reilly", mains: ['비타민C','철'], mainMode: 'any', forms: ['정제'], manufacturers: ['제조사'], subInclude: ['원료 A'], subExclude: ['원료 B'], weightMin: 400, weightMax: 900, marker: { name: '비타민C', unit: 'mg', min: 50, max: 100 } }
  const input = { name: '팀 검색', scope: 'team', filters, rdaProfile: 'female-2', generation: 'gen-1', resultCount: 42 }
  assert.deepEqual(validateSavedSearch({ ...input, owner_key: 'someone-else' }), input)
  assert.deepEqual(validateSavedSearch(JSON.parse(JSON.stringify(input))), input)
  for (const invalid of [{ ...input, scope: 'public' }, { ...input, rdaProfile: 'child' }, { ...input, filters: { ...filters, weightMin: '500' } }, { ...input, name: '' }, { ...input, filters: { ...filters, forms: ['UNKNOWN'] } }]) assert.throws(() => validateSavedSearch(invalid))
})

test('customer export has no default redaction; selected fields removed before all renderers without altering stats', () => {
  const briefing = { ...buildBriefing([], EMPTY_FILTERS, 100), referenceCount: 27,
    conditions: [{ group: '제조원', label: 'INTERNAL_MAKER' }, { group: '부원료 제외', label: 'INTERNAL_BANNED' }, { group: '주원료', label: '비타민C' }],
    topManufacturers: [{ label: 'INTERNAL_MAKER', count: 27, share: 1 }] }
  const original = JSON.stringify(briefing)
  assert.equal(customerBriefing(briefing, false, { manufacturers: true }), briefing)
  assert.deepEqual(customerBriefing(briefing, true, DEFAULT_EXPORT_VISIBILITY), briefing)
  const cleaned = customerBriefing(briefing, true, { manufacturerCondition: true, manufacturers: true, subExclude: true })
  assert.doesNotMatch(JSON.stringify(cleaned), /INTERNAL_/)
  assert.doesNotMatch(briefingToText(cleaned), /INTERNAL_/)
  assert.match(briefingToText(cleaned), /비타민C/)
  assert.equal(cleaned.referenceCount, 27)
  assert.equal(JSON.stringify(briefing), original)
  const allHidden = customerBriefing({ ...briefing, conditions: briefing.conditions.slice(0,2) }, true, { manufacturerCondition: true, subExclude: true })
  assert.match(allHidden.conditions[0].label, /결과에는 적용됨/)
})

test('source freshness derives only from accepted source update dates, not report dates, filename or today', () => {
  const headers = ['PRDLST_REPORT_NO','NTK_MTHD','STDR_STND','LAST_UPDT_DTM','PRMS_DT']
  const provenance = buildProvenance(headers, [['id','','','20260904120310','20260906'],['id2','','','2026-09-01 10:20:30',''],['id3','','','20260230','']])
  assert.deepEqual(provenance, { source: 'mfds-c003', updatedThrough: '2026-09-04', datedRows: 2 })
  assert.deepEqual(validateProvenance(provenance, 3), provenance)
  assert.throws(() => validateProvenance({ ...provenance, datedRows: 4 }, 3))
  assert.equal(sourceDate('20260230'), null)
  assert.equal(sourceDate('20240229'), '2024-02-29')
  assert.match(freshnessLabel(provenance, '2026-09-06T00:00:00Z').date, /2026-09-04/)
  assert.match(freshnessLabel(null, '2026-09-06T00:00:00Z').date, /서버 반영일 기준/)
  assert.match(freshnessLabel(null, null).date, /확인 필요/)
  assert.equal(buildProvenance(['제품명','신고일자'], [['name','20260906']]).updatedThrough, null)
  assert.equal(freshnessLabel(provenance, null, true).url, null)
})
