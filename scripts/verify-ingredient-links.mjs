/**
 * 원료명 → 건강기능식품 공전 원료 연결 검증.
 *
 *   node scripts/verify-ingredient-links.mjs
 *
 * 두 가지를 본다.
 *
 *  1) 연결·비연결 표 - 언제나 실행한다.
 *     `산화아연` 은 아연으로 연결되어야 하고, `카복시메틸셀룰로스칼슘`(CMC-Ca)은
 *     이름에 칼슘이 들어 있어도 연결되지 않아야 한다. 후자가 더 중요하다 -
 *     잘못 연결되면 고객용 구성 및 포장지 표에 없는 기능성이 올라간다.
 *
 *  2) 실제 품목제조보고 연결률 - `public/dataset.json` 이 있을 때만.
 *     이 파일은 용량이 커서 저장소에 올리지 않는다(.gitignore). 연결 규칙을
 *     손볼 때 연결률이 떨어지지 않는지 확인하는 용도다.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DATASET = 'public/dataset.json'
/** 이 아래로 떨어지면 규칙이 퇴행한 것으로 본다. 측정 당시 94.0%. */
const MIN_COVERAGE = 90

const out = mkdtempSync(join(tmpdir(), 'oem-link-'))

try {
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      'src/lib/formulaDesign/suggest.ts',
      '--outDir', out,
      '--target', 'es2022',
      '--module', 'commonjs',
      '--moduleResolution', 'node',
      '--skipLibCheck',
      '--resolveJsonModule',
      '--esModuleInterop',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
} catch {
  console.error('tsc 컴파일에 실패했습니다. `npx tsc --noEmit` 으로 타입 오류를 먼저 확인하세요.')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { buildSuggestionIndex, exactSuggestion } = require(join(out, 'lib/formulaDesign/suggest.js'))
const index = buildSuggestionIndex([], [])

/** 공전 원료로 연결되면 그 이름, 아니면 null. */
const linkOf = (name) => {
  const found = exactSuggestion(index, name)
  return found && found.source === 'ingredient' ? found.name : null
}

/** [배합비에 적는 이름, 연결되어야 하는 공전 원료] */
const SHOULD_LINK = [
  ['산화아연', '아연'],
  ['글루콘산아연', '아연'],
  ['산화마그네슘', '마그네슘'],
  ['해조칼슘', '칼슘'],
  ['탄산칼슘', '칼슘'],
  ['황산망간', '망간'],
  ['푸마르산제일철', '철'],
  ['요오드칼륨', '요오드'],
  ['글루콘산동', '구리'],
  ['아셀렌산나트륨', '셀레늄(셀렌)'],
  ['아셀렌산나트륨혼합제제', '셀레늄(셀렌)'],
  ['건조효모(셀렌함유)', '셀레늄(셀렌)'],
  ['셀렌', '셀레늄(셀렌)'],
  ['비타민B1염산염', '비타민 B1'],
  ['비타민B1질산염', '비타민 B1'],
  ['티아민염산염', '비타민 B1'],
  ['비타민B6염산염', '비타민 B6'],
  ['피리독신염산염', '비타민 B6'],
  ['비타민c혼합제제', '비타민 C'],
  ['비타민e혼합제제', '비타민 E'],
  ['D-알파-토코페롤', '비타민 E'],
  ['비타민 D3', '비타민 D'],
  ['건조효모(비타민D)', '비타민 D'],
  ['판토텐산칼슘', '판토텐산'],
  ['니코틴산아미드', '나이아신'],
  ['엽산(고시형)', '엽산'],
  ['홍삼농축액', '홍삼'],
  ['홍삼농축액분말', '홍삼'],
  ['정제어유', 'EPA 및 DHA 함유 유지(오메가3)'],
  ['엠에스엠', 'MSM(식이유황)'],
  ['옥타코사놀', '옥타코사놀 함유 유지'],
  ['L-테아닌', '테아닌'],
  ['뮤코다당.단백', '뮤코다당·단백'],
  ['녹차추출물분말', '녹차추출물(카테킨)'],
  ['유산균혼합분말', '프로바이오틱스'],
  ['프로바이오틱스분말', '프로바이오틱스'],
  ['Lactobacillus acidophilus', '프로바이오틱스'],
  ['Bifidobacterium animalis ssp. lactis', '프로바이오틱스'],
  ['밀크씨슬(카르두스 마리아누스) 추출물', '밀크씨슬 추출물'],
]

/**
 * 연결되면 안 되는 이름. 대부분 부형제다.
 * 이름에 영양소가 들어 있어도(CMC-Ca, 스테아린산마그네슘) 기능성 원료가 아니다.
 */
const SHOULD_NOT_LINK = [
  '카복시메틸셀룰로스칼슘',
  'CMC칼슘',
  '스테아린산마그네슘',
  '스테아린산칼슘',
  '결정셀룰로오스',
  '히드록시프로필메틸셀룰로스',
  '이산화규소',
  '미역줄기분말',
  '정제포도당',
  '유당',
  '말토덱스트린',
  '효모추출물',
  '덱스트린',
  '탄산수소나트륨',
]

let failed = 0
console.log('[연결되어야 하는 이름]')
for (const [name, expected] of SHOULD_LINK) {
  const got = linkOf(name)
  const ok = got === expected
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} → ${got ?? '연결 안 됨'}${ok ? '' : `  (기대 ${expected})`}`)
}

console.log('\n[연결되면 안 되는 이름 - 부형제]')
for (const name of SHOULD_NOT_LINK) {
  const got = linkOf(name)
  const ok = got === null
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} → ${got ?? '연결 안 됨(정상)'}`)
}

if (existsSync(DATASET)) {
  const data = JSON.parse(readFileSync(DATASET, 'utf8'))
  const strings = data.strings
  const counts = new Map()
  for (const product of data.products) {
    for (const i of product[5] ?? []) {
      const name = strings[i]
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  let total = 0
  let linked = 0
  const misses = []
  for (const [name, count] of counts) {
    total += count
    if (linkOf(name)) linked += count
    else misses.push([name, count])
  }
  const pct = (100 * linked) / total
  const ok = pct >= MIN_COVERAGE
  if (!ok) failed += 1
  console.log(`\n[실제 품목제조보고 주원료 연결률]`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${linked.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')} = ${pct.toFixed(1)}% (기준 ${MIN_COVERAGE}% 이상)`)
  misses.sort((a, b) => b[1] - a[1])
  console.log('  미연결 상위 5:', misses.slice(0, 5).map(([n, c]) => `${n}(${c})`).join(', '))
} else {
  console.log(`\n[실제 품목제조보고 연결률] 건너뜀 - ${DATASET} 이 없습니다(저장소에 올리지 않는 파일).`)
}

console.log(`\n${failed === 0 ? '전부 통과' : `${failed}건 실패`}`)
rmSync(out, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
