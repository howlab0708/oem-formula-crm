/* eslint-disable @typescript-eslint/no-require-imports -- Existing Node test runner uses CommonJS. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const loader = require('./helpers/loadTs.cjs')
const load = loader()
const { parseBriefingText, validateNoteInput, companyKey } = load('src/lib/formulaNotes.ts')
const { buildBriefing, briefingToText } = load('src/lib/export/briefing.ts')
const { EMPTY_FILTERS } = load('src/lib/filters.ts')
const { SEED_PRODUCTS } = load('src/lib/seed.ts')
const text = briefingToText(buildBriefing(SEED_PRODUCTS, { ...EMPTY_FILTERS, mains: ['비타민C'], forms: ['젤리/구미'], subExclude: ['설탕'] }, SEED_PRODUCTS.length))

test('copied briefing round trips into separate conditions, statistics and ingredient charts', () => {
  const parsed = parseBriefingText(text)
  assert.deepEqual(parsed.conditions, [{ group: '주원료', label: '비타민C' }, { group: '제형', label: '젤리/구미' }, { group: '부원료 제외', label: '설탕' }])
  assert.ok(parsed.mainIngredients.length)
  assert.ok(parsed.subIngredients.length)
  assert.ok(parsed.metrics.some((item) => item.label === '시장 레퍼런스'))
  assert.ok(parsed.date)
})

test('legacy text, CRLF, comma ingredient names and nested parentheses are preserved', () => {
  const legacy = '[OEM 배합 설계 브리핑]\r\n· 검토 조건: 조건 미지정(전체)\r\n· 시장 레퍼런스: 1,000건 (전체 1,000건 중)\r\n· 다빈도 부원료: 혼합물(A, B)(40%), 원료C(10.5%)\r\n· 다빈도 조합: A + B 1,000건'
  const result = parseBriefingText(legacy)
  assert.deepEqual(result.subIngredients, [{ name: '혼합물(A, B)', percent: 40 }, { name: '원료C', percent: 10.5 }])
  assert.deepEqual(result.subCombos, [{ label: 'A + B', count: '1,000' }])
  assert.deepEqual(result.mainIngredients, [])
  assert.equal(parseBriefingText('일반 메모'), null)
  assert.equal(parseBriefingText('[OEM 배합 설계 브리핑]'), null)
})

test('notes validate required fields and limits and company matching only normalizes typography', () => {
  const input = { company: ' 한빛  헬스 ', title: '상담', sourceText: text, memo: '' }
  assert.equal(validateNoteInput(input).company, '한빛 헬스')
  assert.equal(companyKey(' ＡＢＣ  회사 '), companyKey('abc 회사'))
  assert.notEqual(companyKey('한빛'), companyKey('한빛바이오'))
  assert.throws(() => validateNoteInput({ ...input, company: '' }))
  assert.throws(() => validateNoteInput({ ...input, sourceText: '임의 문자열' }))
  assert.throws(() => validateNoteInput({ ...input, title: 'a'.repeat(151) }))
  assert.throws(() => validateNoteInput({ ...input, sourceText: text + 'a'.repeat(30_000) }))
})

test('notes API rejects invalid writes, cross-origin writes and reports edit conflicts', async () => {
  let configured = true
  let calls = 0
  const route = loader({
    [path.resolve('src/lib/db.ts')]: { isDatabaseConfigured: () => configured },
    [path.resolve('src/lib/server/formulaNotes.ts')]: {
      createNote: async (id, input) => { calls++; return { id, ...input, version: 1 } },
      updateNote: async () => { throw new Error('NOTE_CONFLICT') },
    },
  })('src/app/api/notes/route.ts')
  const data = { id: 'a0000000-0000-4000-8000-000000000001', company: '회사', title: '노트', sourceText: text, memo: '' }
  const request = (body, method = 'POST', origin = 'http://localhost') => new Request('http://localhost/api/notes', { method, headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) })
  assert.equal((await route.POST(request(data, 'POST', 'https://elsewhere.test'))).status, 403)
  assert.equal((await route.POST(request({ ...data, id: 'broken' }))).status, 400)
  assert.equal((await route.POST(request({ ...data, sourceText: '' }))).status, 400)
  assert.equal(calls, 0)
  assert.equal((await route.POST(request(data))).status, 201)
  assert.equal((await route.PUT(request({ ...data, version: 1 }, 'PUT'))).status, 409)
  configured = false
  assert.equal((await route.POST(request(data))).status, 503)
})
