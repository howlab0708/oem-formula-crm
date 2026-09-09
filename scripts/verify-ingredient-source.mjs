/**
 * 원료 기원 판정을 원본 CSV 45,996건 전체에 돌려 본다.
 *
 * 앱과 같은 경로를 쓴다 - `mapHeaders` + `rowToProduct` 로 Product 를 만들고
 * `productSources` 로 판정한다. 그래야 기준규격(지표성분) 문맥을 함께 보는
 * 조건부 판정(인산칼슘)까지 화면과 같은 결과가 나온다.
 *
 * 뽑는 것
 *   1) 오분류 방지 · 표기 흔들림 흡수 확인
 *   2) 영양성분별 원료 형태 분포(제품 수)
 *   3) 부형제로 판정해 영양원 집계에서 뺀 건수
 *   4) 놓친 토큰(영양성분 이름은 보이는데 판정 안 된 원료)
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

const { classifySources, productSources } = loadTs('src/lib/ingredientSource.ts')
const { mapHeaders, rowToProduct } = loadTs('src/lib/csvSchema.ts')

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

const byNutrient = new Map()
// 성분별 '제품 수' 는 형태별 건수의 합이 아니다. 한 제품이 해조칼슘과 탄산칼슘을
// 함께 쓰면 형태로는 2건이지만 제품은 1건이다. 화면 목록(sourceNutrientOptions)이
// 세는 값과 맞추려면 제품을 따로 세야 한다.
const nutrientProducts = new Map()
const excipients = new Map()
const missed = new Map()
const NUTRIENT_HINT = /아연|셀레늄|셀렌|크롬|마그네슘|칼슘|비타민|엽산|비오틴|나이아신|판토텐|니코틴산|몰리브|망간|요오드|토코페롤|토코페릴|카로틴|헴철|제일철|제이철/
const prepCount = new Map()
const originCount = new Map()
let rows = 0
let tokens = 0
let droppedFromCalcium = 0

const rl = readline.createInterface({
  input: fs.createReadStream(path.join(ROOT, 'DB ADD PLUS/C003.csv'), 'utf8'),
  crlfDelay: Infinity,
})

let mapping = null
let buf = ''
for await (const line of rl) {
  buf = buf ? buf + '\n' + line : line
  if (((buf.match(/"/g) || []).length) % 2 === 1) continue
  const cols = parseLine(buf)
  buf = ''
  if (!mapping) { mapping = mapHeaders(cols.map((h) => h.replace(/^﻿/, ''))); continue }

  const product = rowToProduct(cols, mapping, rows)
  if (!product) continue
  rows++

  const sources = productSources(product)
  for (const [nutrient, forms] of sources.forms) {
    nutrientProducts.set(nutrient, (nutrientProducts.get(nutrient) || 0) + 1)
    const bucket = byNutrient.get(nutrient) ?? new Map()
    for (const form of forms) bucket.set(form, (bucket.get(form) || 0) + 1)
    byNutrient.set(nutrient, bucket)
  }
  for (const form of sources.excipientForms) excipients.set(form, (excipients.get(form) || 0) + 1)
  // 조건부 판정이 실제로 몇 제품을 빼냈는지. 다른 칼슘 원료가 함께 있어 그대로
  // 남은 제품은 빠진 게 아니므로 세지 않는다.
  if (sources.excipientForms.size > 0 && !sources.forms.has('칼슘')) droppedFromCalcium++
  for (const prep of sources.preps) prepCount.set(prep, (prepCount.get(prep) || 0) + 1)
  for (const origin of sources.origins) originCount.set(origin, (originCount.get(origin) || 0) + 1)

  for (const name of [...product.mainIngredients, ...product.subIngredients]) {
    tokens++
    const matches = classifySources(name)
    if ((matches.length === 0 || matches.every((m) => !m.nutrient)) && NUTRIENT_HINT.test(name)) {
      missed.set(name, (missed.get(name) || 0) + 1)
    }
  }
}

console.log(`행 ${rows.toLocaleString()} · 원료 토큰 ${tokens.toLocaleString()}\n`)

console.log('=== 오분류 방지 확인 (nutrient 가 나오면 안 되는 것) ===')
for (const name of [
  '스테아린산마그네슘', '카복시메틸셀룰로스칼슘', '판토텐산칼슘', 'L-아스코브산칼슘(고시형)',
  '사철쑥추출물분말', '니코틴산아미드 모노뉴클레오타이드', '결정셀룰로오스',
  '제일인산칼슘', '피로인산칼슘',
]) {
  const got = classifySources(name).map((m) => `${m.nutrient ?? '-'} / ${m.form} / ${m.origin} / ${m.prep}`)
  console.log(`  ${name}  ->  ${got.length ? got.join(' + ') : '(판정 없음)'}`)
}

console.log('\n=== 조건부 판정 확인 (제품의 기준규격에 칼슘 함량이 있어야 영양원) ===')
for (const name of ['제삼인산칼슘', '제이인산칼슘(고시형)', '제3인산칼슘']) {
  const [match] = classifySources(name)
  console.log(`  ${name}  ->  ${match.nutrient} / ${match.form}`)
  console.log(`      칼슘 함량 표시 없으면 -> ${match.excipientForm}`)
}

console.log('\n=== 표기 흔들림 흡수 확인 (같은 형태로 모여야 하는 것) ===')
for (const name of [
  '비타민D3혼합제제', '비타민 D3 혼합제제분말', '분말비타민D3혼합제제', '비타민 D3 혼합제제유지',
  '건조효모(비타민D)', '건조효모(셀렌함유)', '셀레늄함유건조효모', '식용건조효모(셀렌으로서 0.1%)',
  '건조효모&#40;아연함유&#41;', 'd-α-토코페롤', 'D-알파-토코페롤(고시형)',
  'DL-알파-토코페릴초산염 혼합제제', '비타민 B12 혼합제제(비타민B12 1%, 제이인산칼슘 99%)',
]) {
  const got = classifySources(name).map((m) => `${m.nutrient ?? '-'} / ${m.form} / ${m.origin} / ${m.prep}`)
  console.log(`  ${name}\n      -> ${got.length ? got.join('\n      -> ') : '(판정 없음)'}`)
}

console.log('\n=== 영양성분별 원료 형태 (제품 수) ===')
const order = [...nutrientProducts.entries()].sort((a, b) => b[1] - a[1])
for (const [nutrient, products] of order) {
  const bucket = byNutrient.get(nutrient)
  const formSum = [...bucket.values()].reduce((x, y) => x + y, 0)
  const overlap = formSum > products ? ` · 형태 표기 ${formSum.toLocaleString()}건(두 형태 이상 쓴 제품이 있다)` : ''
  console.log(`\n■ ${nutrient}  (이 성분의 원료를 쓴 제품 ${products.toLocaleString()}건${overlap})`)
  for (const [form, count] of [...bucket.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(6)}  ${((count / products) * 100).toFixed(1).padStart(5)}%  ${form}`)
  }
}

const calciumProducts = nutrientProducts.get('칼슘') ?? 0
console.log('\n=== 부형제로 판정해 영양원 집계에서 뺀 건 (제품 수) ===')
console.log(
  `  이 판정으로 칼슘 제품 수 ${(calciumProducts + droppedFromCalcium).toLocaleString()} -> ${calciumProducts.toLocaleString()}건`,
)
if (excipients.size === 0) console.log('  없음')
for (const [form, count] of [...excipients.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(6)}  ${form}`)
}

console.log('\n=== 제제 형태별 제품 수 ===')
for (const [prep, count] of [...prepCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(6)}  ${prep}`)
console.log('=== 기원별 제품 수 ===')
for (const [origin, count] of [...originCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(6)}  ${origin}`)

console.log('\n=== 놓친 토큰 상위 30 (영양성분 이름은 보이는데 판정 안 됨) ===')
for (const [name, count] of [...missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ${String(count).padStart(6)}  ${name}`)
}
