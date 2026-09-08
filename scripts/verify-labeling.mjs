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
 *  2) 기준치 표가 견적서에 적힌 비율을 재현하는지.
 *     받은 견적서에 `나이아신 50mg(333%)` 처럼 함량과 비율이 함께 적혀 있어
 *     기준치를 역산할 수 있었다. 그 비율이 다시 나오는지 확인한다.
 *     근거를 확인하지 못한 영양소는 계산하지 않고 '확인 필요' 로 남아야 한다.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const out = 'node_modules/.cache/oem-labeling-verify'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

try {
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', 'src/lib/formulaDesign/labeling.ts',
     '--outDir', out, '--target', 'es2022', '--module', 'commonjs',
     '--moduleResolution', 'node', '--skipLibCheck', '--esModuleInterop'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
} catch {
  console.error('tsc 컴파일 실패. `npx tsc --noEmit` 을 먼저 확인하세요.')
  process.exit(1)
}

const requireOut = createRequire(import.meta.url)
const m = requireOut(resolve(out, 'labeling.js'))

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

// ── 2) 일일영양성분 기준치 ───────────────────────────────────────────────────
console.log('\n[일일영양성분 기준치 · 견적서에 적힌 비율 재현]')

/** [기준 성분, 견적서 표시량, 견적서에 적힌 비율%] */
const nrvCases = [
  ['나이아신', '50mg', 333],
  ['판토텐산', '50mg', 1000],
  ['비오틴', '50㎍', 167],
  ['비타민 B12', '50㎍', 2083],
  ['비타민 B6', '50mg', 3333],
  ['비타민 B1', '50mg', 4167],
  ['비타민 B2', '40mg', 2857],
  ['엽산', '980㎍ DFE', 245],
]
for (const [basis, label, expected] of nrvCases) {
  const r = m.dailyValuePercent(basis, label)
  const got = r.state === 'ok' ? Math.round(r.percent) : r.state
  check(got === expected, `${basis} ${label}`, `→ ${got}%  견적서 ${expected}%`)
}

console.log('\n[100% 설계로 추정한 값]')
for (const [basis, label] of [['셀레늄', '55㎍'], ['망간', '3mg'], ['비타민 E', '11mg α-TE']]) {
  const r = m.dailyValuePercent(basis, label)
  check(r.state === 'ok' && Math.round(r.percent) === 100, `${basis} ${label} → 100%`,
    r.state === 'ok' ? `(출처 ${r.entry.source})` : r.state)
}

console.log('\n[근거 없는 값은 계산하지 않는다]')
for (const basis of ['비타민 A', '비타민 C', '칼슘', '철', '아연']) {
  const r = m.dailyValuePercent(basis, '100mg')
  check(r.state === 'needs-check', `${basis} → 확인 필요(계산 안 함)`, r.state)
}
check(m.dailyValuePercent('밀크씨슬 추출물', '130mg').state === 'no-basis', '기준치가 없는 원료 → no-basis')
check(m.dailyValuePercent('비타민 B1', '').state === 'unreadable', '표시량이 비면 unreadable')

const counts = m.DAILY_VALUES.reduce((acc, e) => ({ ...acc, [e.source]: (acc[e.source] ?? 0) + 1 }), {})
console.log(`\n기준치 표 ${m.DAILY_VALUES.length}개 · 견적서 확인 ${counts.quote ?? 0} · 설계 추정 ${counts.design ?? 0} · 확인 필요 ${counts.unknown ?? 0}`)

rmSync(out, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '전부 통과' : `${failed}건 실패`}`)
process.exit(failed ? 1 : 0)
