/**
 * 어떤 원료가 '영양원으로 신고된 것'인지 '부형제로 넣은 것'인지 공개 데이터로 가릴 수
 * 있는지 실측한다. 원료 이름 패턴과 영양성분 이름을 받아, 그 원료를 쓴 제품의
 * 기준규격(STDR_STND)에 그 영양성분 함량이 질량으로 잡히는지 세어 본다.
 *
 * 원재료명 안에서의 위치도 함께 본다 - 원재료명은 대체로 배합비 내림차순이라
 * 끝자락에 있으면 부형제 용도라는 신호다.
 *
 *   node scripts/probe-declared-nutrient.mjs '인산.{0,3}칼슘' 칼슘
 *   node scripts/probe-declared-nutrient.mjs 탄산칼슘 칼슘
 */
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import readline from 'node:readline'
import ts from 'typescript'

const ROOT = path.resolve(import.meta.dirname, '..')

function loadTs(relativePath) {
  const filename = path.resolve(ROOT, relativePath)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = new Module(filename, null)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const native = loaded.require.bind(loaded)
  loaded.require = (name) =>
    name.startsWith('.')
      ? loadTs(path.relative(ROOT, path.resolve(path.dirname(filename), `${name}.ts`)))
      : native(name)
  loaded._compile(compiled, filename)
  return loaded.exports
}

const { splitIngredients, parseSpecification, parseMarkers } = loadTs('src/lib/normalize.ts')

function parseLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

const [patternArg, nutrientArg] = process.argv.slice(2)
if (!patternArg || !nutrientArg) {
  console.error("사용법: node scripts/probe-declared-nutrient.mjs '<원료 이름 패턴>' <영양성분 이름>")
  process.exit(1)
}
const INGREDIENT_RE = new RegExp(patternArg)
const NUTRIENT_RE = new RegExp(nutrientArg)
const tokens = new Map()
// 제품 단위: 인산칼슘을 쓴 제품이 칼슘을 지표성분(질량)으로 선언했는가
const buckets = new Map()
const positions = { declared: [], undeclared: [] }
const samples = { declared: [], undeclared: [] }

const rl = readline.createInterface({
  input: fs.createReadStream(path.join(ROOT, 'DB ADD PLUS/C003.csv'), 'utf8'),
  crlfDelay: Infinity,
})

let header = null
let buf = ''
let rows = 0
for await (const line of rl) {
  buf = buf ? buf + '\n' + line : line
  if (((buf.match(/"/g) || []).length) % 2 === 1) continue
  const cols = parseLine(buf)
  buf = ''
  if (!header) { header = cols.map((h) => h.replace(/^﻿/, '')); continue }
  rows++
  const rec = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']))
  const names = splitIngredients(rec.RAWMTRL_NM || '')

  const hits = names
    .map((name, index) => ({ name: name.trim().replace(/\s+/g, ' '), index }))
    .filter(({ name }) => INGREDIENT_RE.test(name.replace(/\s/g, '')))
  if (hits.length === 0) continue

  for (const { name } of hits) tokens.set(name, (tokens.get(name) || 0) + 1)

  // 기준규격에서 칼슘 표시량(질량 단위)을 찾는다.
  const spec = parseSpecification(rec.STDR_STND || '')
  const markers = spec.markers.length > 0 ? spec.markers : parseMarkers(rec.STDR_STND || '')
  const declaredMarker = markers.find((m) => NUTRIENT_RE.test(m.name) && m.mgValue !== null)

  const key = declaredMarker ? 'declared' : 'undeclared'
  buckets.set(key, (buckets.get(key) || 0) + 1)
  // 원재료명 안에서의 위치 비율(0=맨 앞, 1=맨 끝)
  for (const { index } of hits) {
    positions[key].push(names.length > 1 ? index / (names.length - 1) : 0)
  }
  if (samples[key].length < 4) {
    samples[key].push({
      nm: rec.PRDLST_NM.trim(),
      tokens: hits.map((h) => h.name).join(' / '),
      slot: `${hits[0].index + 1}/${names.length}`,
      spec: (rec.STDR_STND || '').replace(/\s+/g, ' ').slice(0, 160),
    })
  }
}

const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

console.log(`행 ${rows.toLocaleString()}\n`)
console.log(`=== '${patternArg}' 에 걸린 원료 표기 (토큰 등장 수) ===`)
for (const [name, count] of [...tokens.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ${String(count).padStart(5)}  ${name}`)
}

console.log('\n=== 기준규격에 칼슘 표시량이 있는가 (제품 수) ===')
console.log(`  ${nutrientArg} 표시 있음: ${(buckets.get('declared') || 0).toLocaleString()}`)
console.log(`  ${nutrientArg} 표시 없음: ${(buckets.get('undeclared') || 0).toLocaleString()}`)
console.log(`  원재료명 내 평균 위치 - 표시 있음 ${avg(positions.declared).toFixed(2)} · 표시 없음 ${avg(positions.undeclared).toFixed(2)}  (0=맨앞, 1=맨끝)`)

for (const key of ['declared', 'undeclared']) {
  console.log(`\n--- ${key === 'declared' ? '칼슘 표시량 있음' : '칼슘 표시량 없음'} 예시 ---`)
  for (const s of samples[key]) {
    console.log(`  * ${s.nm}  [${s.slot}번째]  ${s.tokens}`)
    console.log(`      규격: ${s.spec}`)
  }
}
