/**
 * 표시량 ↔ 배합비율 환산과 일일영양성분 기준치 검증.
 *
 *   node scripts/verify-labeling.mjs
 *
 * 고객 문서에 나가는 함량이라 틀리면 안 되는 계산이다. 두 가지를 본다.
 *
 *  1) 역산이 실제 공장 견적서의 배합비율을 재현하는지.
 *     기준은 받은 견적서의 표시량과 배합비율이다. 역가는 분자량 비(이론값),
 *     오버차지는 그 두 값에서 역산되는 값을 쓴다. 여기 쓰는 숫자는 화학 상수와
 *     일반적인 과량 투입률이라 회사 기밀이 아니다.
 *
 *  2) 1일 영양성분 기준치 표가 고시값과 같은지, 그리고 그 값으로 계산한 비율이
 *     실제 견적서에 적힌 비율과 맞는지.
 *     기준은 「식품등의 표시기준」 고시값 26개다. 여기서 벗어나면 고객 문서의 %가
 *     틀어지므로 한 항목이라도 어긋나면 실패한다. 받은 견적서에
 *     `나이아신 50mg(333%)` 처럼 함량과 비율이 함께 적혀 있어, 고시값으로 계산해도
 *     같은 비율이 나오는지 교차 확인한다.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const out = 'node_modules/.cache/oem-labeling-verify'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// labeling.ts 가 `rda.ts` 의 별칭표를 쓰므로 tsc 가 그 파일들까지 함께 내보낸다.
// 공통 뿌리가 옮겨 다니지 않게 rootDir 을 못 박아, 출력 경로를 고정한다.
try {
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', 'src/lib/formulaDesign/labeling.ts',
     '--outDir', out, '--rootDir', 'src/lib', '--target', 'es2022', '--module', 'commonjs',
     '--moduleResolution', 'node', '--skipLibCheck', '--esModuleInterop'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
} catch {
  console.error('tsc 컴파일 실패. `npx tsc --noEmit` 을 먼저 확인하세요.')
  process.exit(1)
}

const requireOut = createRequire(import.meta.url)
const m = requireOut(resolve(out, 'formulaDesign/labeling.js'))

let failed = 0
const check = (ok, label, detail = '') => {
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}
const round = (value, digits) => Number(value.toFixed(digits))

// ── 1) 표시량 → 배합비율 역산 ────────────────────────────────────────────────
console.log('[표시량 → 배합비율 역산 · 공장 견적서 재현]')

/** [기준 성분, 표시량, 역가%, 오버차지%, 1회분 중량, 기대 배합비율%] */
const cases = [
  ['비타민 B1', '1.2mg', 78.7, 20, 800, 0.23],
  ['비타민 B6', '1.5mg', 82.3, 24, 800, 0.283],
  ['비타민 B2', '1.4mg', 100, 17.7, 800, 0.206],
  ['엽산', '400㎍ DFE', 100, 25, 800, 0.0368],
]
for (const [basis, label, potency, overage, unitWeight, expected] of cases) {
  const d = m.deriveFromLabel({ labelAmount: label, potency: String(potency), overage: String(overage), unitWeightMg: unitWeight })
  const got = d ? round(d.ratio, 4) : null
  // 견적서 배합비율은 소수 두세 자리로 끊어 적히므로 그 자리까지 맞으면 통과로 본다.
  const digits = String(expected).split('.')[1]?.length ?? 0
  const ok = got !== null && round(d.ratio, digits) === expected
  check(ok, `${basis} ${label} · 역가 ${potency}% · 오버차지 ${overage}%`, `→ ${got}%  견적서 ${expected}%`)
}

console.log('\n[단위 환산]')
check(m.equivalentFactor('㎍ DFE').factor === 1.7, '엽산 DFE 환산계수 1.7')
check(m.equivalentFactor('mg').factor === 1, 'mg 은 환산 없음')
check(m.toMilligrams(400, '㎍') === 0.4, '400㎍ = 0.4mg')
check(m.toMilligrams(2.4, 'ug') === 0.0024, '2.4ug = 0.0024mg')
check(m.toMilligrams(11, 'mg α-TE') === 11, 'mg α-TE 는 mg 으로 읽음')
check(m.toMilligrams(100, 'IU') === null, 'IU 는 환산하지 않음(원료마다 다름)')

console.log('\n[읽을 수 없으면 계산하지 않는다]')
// 0 을 돌려주면 화면에 0% 가 채워져 잘못된 배합이 된다. null 이어야 한다.
check(m.deriveFromLabel({ labelAmount: '', potency: '80', overage: '20', unitWeightMg: 800 }) === null, '표시량이 비면 null')
check(m.deriveFromLabel({ labelAmount: '1.2mg', potency: '', overage: '20', unitWeightMg: 800 }) === null, '역가가 비면 null')
check(m.deriveFromLabel({ labelAmount: '1.2mg', potency: '80', overage: '20', unitWeightMg: 0 }) === null, '1회분 중량이 없으면 null')
check(m.deriveFromLabel({ labelAmount: '100 IU', potency: '80', overage: '0', unitWeightMg: 800 }) === null, 'IU 표시는 null')

console.log('\n[투입량 → 표시량 (역방향 확인)]')
const back = m.labelFromInput(1.83, '78.7', '20', 'mg')
check(back !== null && round(back, 1) === 1.2, '1.83mg 투입 · 역가 78.7% · 오버차지 20% → 표시 1.2mg', `→ ${back && round(back, 3)}mg`)

console.log('\n[이론 역가 힌트]')
check(m.potencyHint('비타민B1염산염')?.percent === 78.7, '비타민B1염산염 → 78.7%')
check(m.potencyHint('피리독신염산염')?.percent === 82.3, '피리독신염산염 → 82.3%')
check(m.potencyHint('산화아연')?.percent === 80.3, '산화아연 → 80.3%')
check(m.potencyHint('결정셀룰로오스') === null, '부형제는 힌트 없음')

// ── 2) 1일 영양성분 기준치 ───────────────────────────────────────────────────
console.log('\n[1일 영양성분 기준치 · 표시기준 고시값과 대조]')

/**
 * 식품의약품안전처 「식품등의 표시기준」 1일 영양성분 기준치.
 * 표에 든 값이 여기서 벗어나면 실패한다 - 고객 문서의 % 가 이 숫자에서 나온다.
 */
const OFFICIAL = [
  ['비타민 A', 700, '㎍ RAE'], ['비타민 D', 10, '㎍'], ['비타민 E', 11, 'mg α-TE'],
  ['비타민 K', 70, '㎍'], ['비타민 B1', 1.2, 'mg'], ['비타민 B2', 1.4, 'mg'],
  ['나이아신', 15, 'mg NE'], ['판토텐산', 5, 'mg'], ['비타민 B6', 1.5, 'mg'],
  ['비오틴', 30, '㎍'], ['엽산', 400, '㎍'], ['비타민 B12', 2.4, '㎍'],
  ['비타민 C', 100, 'mg'],
  ['칼슘', 700, 'mg'], ['철', 12, 'mg'], ['마그네슘', 315, 'mg'], ['인', 700, 'mg'],
  ['아연', 8.5, 'mg'], ['셀레늄', 55, '㎍'], ['망간', 3.0, 'mg'], ['구리', 0.8, 'mg'],
  ['요오드', 150, '㎍'], ['몰리브덴', 25, '㎍'], ['크롬', 30, '㎍'],
  ['칼륨', 3500, 'mg'], ['나트륨', 2000, 'mg'],
]
for (const [basis, amount, unit] of OFFICIAL) {
  const entry = m.dailyValueFor(basis)
  const ok = entry !== null && entry.amount === amount && entry.unit === unit && entry.source === 'official'
  check(ok, `${basis} = ${amount}${unit}`, entry ? `표: ${entry.amount}${entry.unit} (${entry.source})` : '표에 없음')
}
check(m.DAILY_VALUES.length === OFFICIAL.length, `표 항목 수 ${OFFICIAL.length}개`, `현재 ${m.DAILY_VALUES.length}개`)
check(m.DAILY_VALUES.every((e) => e.source === 'official' && e.amount > 0), '모든 항목이 고시값이고 0 이 아님')

console.log('\n[다른 표기로 적어도 같은 기준치를 찾는다]')
/*
 * 배합비에 적히는 이름이 표시기준의 이름과 늘 같지 않다. 공전이 `셀레늄(셀렌)` 이라
 * 적어 두어 배합비에는 `셀렌` 으로 들어오고, `니아신`·`아이오딘` 같은 표기도 섞인다.
 * 이걸 못 찾으면 화면의 기준치 칸이 `-` 로 비고, 연구원이 직접 % 를 적어 넣게 된다.
 */
for (const [written, amount] of [
  ['셀렌', 55], ['니아신', 15], ['아이오딘', 150], ['티아민', 1.2],
  ['리보플라빈', 1.4], ['피리독신', 1.5], ['폴산', 400], ['비타민 B1', 1.2],
  ['비타민B1', 1.2], ['비타민 b1', 1.2],
]) {
  const entry = m.dailyValueFor(written)
  check(entry !== null && entry.amount === amount, `${written} → 기준치 ${amount}`, entry ? `표: ${entry.basis} ${entry.amount}${entry.unit}` : '표에 없음')
}
// 무기질의 염 이름은 합치지 않는다 - 표시량이 염 전체 중량인지 원소 중량인지 이름만으로
// 가릴 수 없어서, 잘못 이어 붙이면 고객 문서의 % 가 틀린다.
check(m.dailyValueFor('산화아연') === null, '산화아연은 아연으로 잇지 않는다')
check(m.dailyValueFor('탄산칼슘') === null, '탄산칼슘은 칼슘으로 잇지 않는다')

console.log('\n[견적서에 적힌 비율 재현 · 고시값으로 계산해도 같아야 한다]')

/** [기준 성분, 견적서 표시량, 견적서에 적힌 비율%] - 받은 견적서에서 그대로 옮긴 값 */
const quoted = [
  ['나이아신', '50mg', 333],
  ['판토텐산', '50mg', 1000],
  ['비오틴', '50㎍', 167],
  ['비타민 B12', '50㎍', 2083],
  ['비타민 B6', '50mg', 3333],
  ['비타민 B1', '50mg', 4167],
  ['비타민 B2', '40mg', 2857],
  // 당량 표기가 붙어도 숫자만 견준다(980 ÷ 400).
  ['엽산', '980㎍ DFE', 245],
  ['엽산', '400㎍ DFE', 100],
]
for (const [basis, label, expected] of quoted) {
  const r = m.dailyValuePercent(basis, label)
  const got = r.state === 'ok' ? Math.round(r.percent) : r.state
  check(got === expected, `${basis} ${label}`, `→ ${got}%  견적서 ${expected}%`)
}

console.log('\n[새로 채운 값 검산]')
for (const [basis, label, expected] of [
  ['비타민 C', '100mg', 100],
  ['비타민 A', '350㎍ RAE', 50],
  ['칼슘', '210mg', 30],
  ['아연', '8.5mg', 100],
  ['마그네슘', '315mg', 100],
  ['철', '6mg', 50],
  ['나트륨', '200mg', 10],
  ['칼륨', '3500mg', 100],
  ['구리', '0.4mg', 50],
]) {
  const r = m.dailyValuePercent(basis, label)
  const got = r.state === 'ok' ? Math.round(r.percent) : r.state
  check(got === expected, `${basis} ${label}`, `→ ${got}%`)
}

console.log('\n[기준치가 없는 경우]')
check(m.dailyValuePercent('밀크씨슬 추출물', '130mg').state === 'no-basis', '기준치가 없는 원료 → no-basis')
check(m.dailyValuePercent('프로바이오틱스', '1억 CFU').state === 'no-basis', '균수 표기 원료 → no-basis')
check(m.dailyValuePercent('비타민 B1', '').state === 'unreadable', '표시량이 비면 unreadable')
check(m.dailyValuePercent('비타민 B1', '100 IU').state === 'unreadable', 'IU 표시는 unreadable')

rmSync(out, { recursive: true, force: true })
console.log(`\n기준치 표 ${m.DAILY_VALUES.length}개 (전부 표시기준 고시값)`)
console.log(`${failed === 0 ? '전부 통과' : `${failed}건 실패`}`)
process.exit(failed ? 1 : 0)
