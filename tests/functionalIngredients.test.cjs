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
const { functionalIngredients: entries, ingredientSourceRows: source, ingredientAudit: audit, findFunctionalIngredients: search, ingredientStandardsForQuery } = loaded.exports
const from = (number) => entries.find((entry) => entry.sourceIds.includes(`csv-${String(number).padStart(2, '0')}`))

test('accounts for every supplied CSV row once, including unresolved identities and merged duplicates', () => {
  assert.equal(source.length, 1298)
  const ids = entries.flatMap((entry) => entry.sourceIds)
  assert.equal(ids.length, 1298)
  assert.equal(new Set(ids).size, 1298)
  assert.deepEqual([...ids].sort(), source.map((row) => row.id).sort())
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length)
  assert.equal(entries.length, 621)
  assert.equal(source.filter(row => row.sourceFile === 'I-0040.csv').length, 773)
  assert.equal(source.filter(row => row.sourceFile === 'I-0050.csv').length, 447)
  assert.equal(audit.uniqueProductReports, 45996)
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
      assert.ok(['various.foodsafetykorea.go.kr', 'www.foodsafetykorea.go.kr', 'www.mfds.go.kr'].includes(new URL(standard.sourceUrl).hostname))
      assert.ok(standard.name && standard.functionality && standard.sourceLabel)
      if (entry.evidenceStatus === 'registry') assert.equal(standard.intakes.length, 0)
      else assert.ok(standard.intakes.length)
      for (const intake of standard.intakes) assert.ok(intake.amount && intake.purpose && intake.basis)
      if (entry.category === 'recognized') assert.ok(standard.recognition && standard.holder)
    }
  }
  assert.equal(entries.filter((entry) => entry.category === 'unresolved').length, 7)
})

test('expands to the current 96 codex entries without reusing historical approval doses', () => {
  const notified = entries.filter(entry => entry.category === 'notified')
  assert.equal(notified.length, 96)
  assert.equal(new Set(notified.map(entry => entry.codexSection)).size, 96)
  assert.equal(entries.find(entry => entry.codexSection === '1-26').standards[0].intakes[0].amount, '식이섬유로서 5 g 이상')
  const casein = entries.find(entry => entry.codexSection === '2-64')
  assert.equal(casein.standards[0].intakes.length, 2)
  assert.match(casein.standards[0].intakes[1].amount, /5\.4 ∼ 8\.2 mg/)
  assert.match(casein.standards[0].intakes[1].basis, /카제인/)
  const reishi = entries.find(entry => entry.codexSection === '2-48')
  assert.equal(reishi.upcoming[0].effectiveOn, '2027-01-01')
  assert.match(reishi.upcoming[0].text, /삭제/)
  assert.equal(from(72).category, 'recognized')
})

test('repairs missing identities from official evidence while preserving the original CSV cells', () => {
  const appleSource = source.find(row => row.id === 'i-0040-0540')
  assert.equal(appleSource.raw.HF_FNCLTY_MTRAL_RCOGN_NO, '')
  const apple = entries.find(entry => entry.sourceIds.includes(appleSource.id))
  assert.match(apple.standards[0].recognition, /2024-4/)
  assert.match(apple.standards[0].holder, /한국씨엔에스팜/)
  const sardine = entries.find(entry => entry.sourceIds.includes('i-0040-0630'))
  assert.equal(sardine.name, '정어리펩타이드SP100N')
  assert.equal(source.find(row => row.id === 'i-0040-0630').raw.APLC_RAWMTRL_NM, '')
  const unknown = search('2017-23', 'unresolved')
  assert.equal(unknown.length, 1)
  assert.deepEqual(unknown[0].standards, [])
})

test('does not join reused approval numbers or extract/powder doses across different identities', () => {
  const oldGlucosamine = source.find(row => row.raw.HF_FNCLTY_MTRAL_RCOGN_NO === '2007-10' && row.name === '글루코사민')
  const glucosamine = entries.find(entry => entry.sourceIds.includes(oldGlucosamine.id))
  assert.equal(glucosamine.category, 'notified')
  assert.equal(glucosamine.codexSection, '2-30')
  const bean = entries.find(entry => entry.id === 'recognized-2007-10')
  assert.equal(bean.name, '콩발효추출물')
  assert.ok(!bean.sourceIds.includes(oldGlucosamine.id))
  assert.match(bean.standards[0].intakes[0].amount, /900 mg/)
  const powder = entries.find(entry => entry.id === 'registry-2013-5-powder')
  const extract = entries.find(entry => entry.id === 'recognized-2013-5')
  assert.equal(powder.standards[0].intakes.length, 0)
  assert.match(extract.standards[0].intakes[0].amount, /300 mg/)
  assert.ok(audit.productEvidenceExcludedNumbers.includes('2013-5'))
})

test('preserves scientific notation, raw rounded/zero bounds and traceable product evidence', () => {
  const bbr = entries.find(entry => entry.id === 'recognized-2021-5')
  assert.match(bbr.standards[0].intakes[0].amount, /10\^10.*10\^11 cells/)
  assert.equal(bbr.sourceIds.filter(id => id.startsWith('i-0050')).length, 2)
  const flax = entries.find(entry => entry.id === 'registry-2007-4')
  assert.equal(flax.standards[0].intakes.length, 0, 'zero lower bounds are not a confirmed daily range')
  assert.ok(source.some(row => row.raw.DAY_INTK_LOWLIMIT === '0 (mg)'))
  for (const entry of entries) {
    assert.ok(Number.isInteger(entry.productEvidence.count) && entry.productEvidence.count >= 0)
    assert.ok(entry.productEvidence.examples.length <= Math.min(3, entry.productEvidence.count))
  }
  assert.ok(entries.some(entry => entry.productEvidence.count > 100))
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
