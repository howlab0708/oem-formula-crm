const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/functionalIngredients.ts')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(path.dirname(filename))
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename)
const { functionalIngredients: entries, ingredientSourceRows: source, findFunctionalIngredients: search, ingredientStandardsForQuery } = loaded.exports
const from = (number) => entries.find((entry) => entry.sourceIds.includes(`csv-${String(number).padStart(2, '0')}`))

test('accounts for every supplied CSV row once, including unresolved identities and merged duplicates', () => {
  assert.equal(source.length, 78)
  const ids = entries.flatMap((entry) => entry.sourceIds)
  assert.equal(ids.length, 78)
  assert.equal(new Set(ids).size, 78)
  assert.deepEqual([...ids].sort(), source.map((row) => row.id).sort())
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length)
  assert.equal(entries.length, 70)
  assert.equal(from(11), from(12))
  assert.equal(from(12), from(13))
})

test('confirmed amounts carry a standard, basis and official source; unknown identities have no claimed amount', () => {
  for (const entry of entries) {
    if (entry.category === 'unresolved') {
      assert.deepEqual(entry.standards, [])
      assert.ok(entry.note)
      continue
    }
    assert.ok(entry.standards.length)
    for (const standard of entry.standards) {
      assert.equal(new URL(standard.sourceUrl).protocol, 'https:')
      assert.ok(['various.foodsafetykorea.go.kr', 'www.foodsafetykorea.go.kr'].includes(new URL(standard.sourceUrl).hostname))
      assert.ok(standard.name && standard.functionality && standard.sourceLabel)
      assert.ok(standard.intakes.length)
      for (const intake of standard.intakes) assert.ok(intake.amount && intake.purpose && intake.basis)
      if (entry.category === 'recognized') assert.ok(standard.recognition && standard.holder)
    }
  }
  assert.equal(entries.filter((entry) => entry.category === 'unresolved').length, 6)
})

test('search supports spacing, full-width text, CSV aliases, purpose, recognition number and holder', () => {
  assert.deepEqual(search('비타민 Ｃ', 'all').map((entry) => entry.id), [from(1).id])
  assert.ok(search('아슈와간다', 'all').includes(from(47)))
  assert.ok(search('실리마린', 'notified').includes(from(18)))
  assert.ok(search('MBP', 'recognized').includes(from(63)))
  assert.deepEqual(search('제2025-14호', 'all').map((entry) => entry.id), [from(35).id])
  assert.ok(search('프롬바이오', 'recognized').includes(from(35)))
  assert.ok(search('보스웰리아 관절', 'recognized').includes(from(35)))
  assert.equal(search('없는원료명123', 'all').length, 0)
  assert.equal(search('보스웰리아', 'notified').length, 0)
  assert.equal(search('수면', 'recognized').includes(from(48)), false, 'CSV의 사프란 수면 문구를 공식 기능성으로 검색하지 않는다')
  assert.equal(search('갑상선', 'notified').includes(from(9)), false, '검증되지 않은 CSV 기능성을 검색에 재사용하지 않는다')
  assert.equal(search('   ', 'all').length, entries.length)
})

test('preserves function-specific and recognition-specific intake rather than a universal range', () => {
  assert.deepEqual(from(11).standards[0].intakes.map((intake) => intake.amount), ['500~2,000 mg', '900~2,000 mg', '600~2,240 mg'])
  assert.deepEqual(from(22).standards[0].intakes.map((intake) => intake.amount), ['3~80 mg', '2.4~80 mg', '25~80 mg'])
  assert.deepEqual(from(35).standards.map((standard) => standard.intakes[0].amount), ['800 mg', '500 mg', '400 mg', '1,000 mg'])
  assert.equal(from(23).standards[0].intakes[0].amount, '1억~100억 CFU')
  assert.notEqual(from(49).standards[0].intakes[0].basis, from(49).standards[1].intakes[0].basis)
  assert.equal(from(28).standards[0].intakes[1].amount, '섭취량 적용하지 않음')
})

test('searching a recognition number, holder or purpose selects the matching dosage for the group preview', () => {
  assert.equal(ingredientStandardsForQuery(from(35), '제2024-32호')[0].intakes[0].amount, '500 mg')
  assert.equal(ingredientStandardsForQuery(from(35), '보스웰리아 코스맥스')[0].intakes[0].amount, '500 mg')
  assert.equal(ingredientStandardsForQuery(from(47), '수면')[0].intakes[0].amount, '120 mg')
  assert.equal(ingredientStandardsForQuery(from(35), '').length, 4)
})

test('keeps current standards separate from 2027 effective changes and corrects CSV classification', () => {
  for (const [number, amount] of [[31, '24~27 mg'], [32, '4~12 mg'], [33, '1,200~18,000 mg'], [34, '1,200~1,500 mg']]) {
    const entry = from(number)
    assert.equal(entry.standards[0].intakes[0].amount, amount)
    assert.equal(entry.upcoming[0].effectiveOn, '2027-01-01')
    assert.ok(entry.upcoming[0].effectiveOn > entry.reviewedOn)
  }
  assert.equal(from(20).category, 'recognized')
  for (const number of [44, 53, 64]) assert.equal(from(number).category, 'notified')
  assert.equal(from(2).standards[0].intakes[0].amount, '3~10 μg')
  assert.equal(from(14).standards[0].intakes[0].amount, '1,500 mg')
  assert.equal(from(29).standards[0].intakes[0].amount, '110~420 mg')
  assert.equal(from(62).standards[0].intakes[0].amount, '6,000 mg')
})
