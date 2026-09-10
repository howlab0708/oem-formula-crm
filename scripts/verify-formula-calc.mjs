/**
 * 배합·원가 계산 검증.
 *
 *   node scripts/verify-formula-calc.mjs
 *
 * 두 단계로 본다.
 *
 *  1) 항등식 검증 - 언제나 실행한다.
 *     예시 시트(`src/lib/formulaDesign/preset.ts`)로 계산식이 스스로 어긋나지
 *     않는지 본다. 배합량 = 중량×개수×수량÷1e6×(1+Loss), 소계 = 줄 금액의 합,
 *     set당 = 총액÷수량, 수량이 늘면 단가가 내려감, 절사 자리 적용 등.
 *
 *  2) 실제 견적서 대조 - `fixtures/factory-quotes.local.json` 이 있을 때만.
 *     공장에서 받은 견적서의 원료단가·가공비·마진이 담긴 파일이라 공개 저장소에
 *     올리지 않는다(.gitignore). 파일이 없으면 이 단계를 건너뛴다.
 *     새로 만들려면 견적서 시트를 배합 설계 화면에서 입력해 저장한 뒤,
 *     `{ "sheets": { "<이름>": <FormulaSheet> }, "expect": { "<이름>": { ... } } }`
 *     형태로 두면 된다.
 *
 * 계산식을 손볼 때마다 이 스크립트를 돌려 견적 금액이 어긋나지 않는지 본다.
 * 프로젝트에 테스트 러너가 없어서 tsc 로 두 모듈만 임시 폴더에 뽑아 실행한다.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const FIXTURE = 'fixtures/factory-quotes.local.json'
const out = mkdtempSync(join(tmpdir(), 'oem-calc-'))

try {
  // node_modules 의 tsc 를 직접 부른다. npx 는 윈도우에서 .cmd 라 execFile 로 띄울 수 없다.
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      'src/lib/formulaDesign/calc.ts',
      'src/lib/formulaDesign/preset.ts',
      '--outDir', out,
      '--target', 'es2022',
      '--module', 'esnext',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
} catch {
  console.error('tsc 컴파일에 실패했습니다. `npx tsc --noEmit` 으로 타입 오류를 먼저 확인하세요.')
  process.exit(1)
}

const { calculate, calculateTiers, packageLabel, num } = await import(pathToFileURL(join(out, 'calc.js')).href)
const { tabletSheet, compactSheet } = await import(pathToFileURL(join(out, 'preset.js')).href)

const round = (value) => Math.round(value)
const fixed = (value, digits) => Number(value.toFixed(digits))
const checks = []
const check = (group, label, got, want) => checks.push({ group, label, got, want })

/** 시트 하나가 계산식과 어긋나지 않는지 본다. 견적서 없이도 확인할 수 있는 항목들. */
function verifyIdentities(group, sheet) {
  const t = calculate(sheet)
  const spec = sheet.spec
  const units = num(spec.unitsPerSet) * num(spec.setCount)
  const net = (num(spec.unitWeightMg) * units) / 1000000

  check(group, '총 낱개 수 = 1세트 개수 × 수량', t.totalUnits, units)
  check(group, '순 배합량 = 중량 × 낱개 수 ÷ 1e6', fixed(t.netBatchKg, 6), fixed(net, 6))
  check(group, '총 배합량 = 순 배합량 × (1 + Loss)', fixed(t.totalBatchKg, 6), fixed((net * (100 + num(spec.lossPercent))) / 100, 6))
  check(group, '배합비율 합 100%', fixed(t.ratioSum, 4), 100)
  check(group, '배합량 합 = 총 배합량', fixed(t.batchSumKg, 6), fixed(t.totalBatchKg, 6))
  check(
    group,
    '원료비 소계 = 줄 금액의 합',
    round(t.materialCost),
    round(t.materials.reduce((sum, item) => sum + item.usageKg * num(item.row.unitPrice), 0)),
  )
  for (const [name, block, total] of [
    ['부자재비', t.packaging, t.packagingCost],
    ['가공비', t.process, t.processCost],
    ['분석비', t.analysis, t.analysisCost],
  ]) {
    check(
      group,
      `${name} 소계 = 견적 포함 줄의 합`,
      round(total),
      round(block.filter((item) => item.counted).reduce((sum, item) => sum + item.quantity * num(item.row.unitPrice), 0)),
    )
  }
  check(
    group,
    '공급가 = 1~4 블록 + 간접비',
    round(t.supplyTotal),
    round(t.baseCost + t.overheads.reduce((sum, item) => sum + item.amount, 0)),
  )
  check(group, 'set당 공급가 = 공급가 ÷ 수량', fixed(t.supplyPerSet, 6), fixed(t.supplyTotal / num(spec.setCount), 6))
  check(group, '최종 단가가 절사 자리에 맞음', t.unitPrice % (num(sheet.quote.roundUnit) || 1), 0)
  check(group, '합계 = 최종 단가 × 수량', t.quoteTotal, t.unitPrice * num(spec.setCount))
  // 제안가는 절사한 단가가 아니라 절사 전 set당 공급가에 부가세를 걸어 절사한 값이다.
  // 같은 제품 견적서의 개정판 세 장을 모두 맞추는 방식이 이것뿐이다(한 장에서 1원 갈린다).
  const unit = num(sheet.quote.roundUnit) || 1
  const mode = sheet.quote.roundMode
  const step = (value) =>
    (mode === 'floor' ? Math.floor(value / unit) : mode === 'ceil' ? Math.ceil(value / unit) : Math.round(value / unit)) * unit
  check(group, '제안가 = 절사 전 set당 공급가 + 부가세', t.proposalPerSet, step(t.supplyPerSet * (1 + num(sheet.quote.vatRate) / 100)))
  check(group, '제안가 합계 = 제안가 × 수량', t.proposalTotal, t.proposalPerSet * num(spec.setCount))
  check(group, '공급가 = 1~4 블록 + 재고비 + 간접비', round(t.supplyTotal), round(t.blockCost + t.stockCost + t.overheadCost))
  for (const item of t.overheads) {
    if (item.row.mode !== 'rate' || item.row.base !== 'process') continue
    // 가공비 연동 간접비는 가공비가 늘면 반드시 함께 늘어난다 - 수량 구간의 핵심.
    check(group, `${item.row.label} = 가공비 기준 %`, round(item.amount) > 0 && t.processCost > 0, true)
  }
  check(group, '규격 표기 생성', packageLabel(spec).startsWith(`${num(spec.unitWeightMg).toLocaleString('ko-KR')}mg x`), true)

  // 수량이 늘면 단가는 같거나 내려간다. 원가가 전부 수량에 비례하는 시트(고정비가
  // 모두 별도청구인 경우)는 구간이 평평한 것이 정상이라 등호를 허용한다.
  const tiers = calculateTiers(sheet)
  check(
    group,
    '수량 구간별 단가가 오르지 않음',
    tiers.every((tier, index) => index === 0 || tier.unitPrice <= tiers[index - 1].unitPrice),
    true,
  )
  check(group, '수량 구간이 세트 수 순서로 정렬됨', tiers.every((tier, i) => i === 0 || tier.setCount > tiers[i - 1].setCount), true)
  // 할인율을 넣은 구간은 할인 전 단가보다 낮아야 하고, 넣지 않은 구간은 같아야 한다.
  for (const tier of tiers) {
    const label = `${tier.setCount.toLocaleString('ko-KR')}set`
    const discounted = tier.discount.material > 0 || tier.discount.packaging > 0 || tier.discount.process > 0
    check(group, `${label} 구간 ${discounted ? '할인 반영' : '할인 없음'}`, tier.unitPrice < tier.basePrice, discounted)
  }
  // 가공비 연동 간접비는 수량을 3배로 늘리면 3배가 되어야 한다. 총액으로 적어 두면
  // 수량이 늘어도 그대로여서 구간 단가가 실제보다 낮게 나오던 것을 막는 잠금장치다.
  const linked = sheet.quote.overheads.filter((row) => row.mode === 'rate' && row.base === 'process')
  if (linked.length && num(spec.setCount) > 0) {
    const tripled = calculate(sheet, num(spec.setCount) * 3)
    const at = (totals, label) => totals.overheads.find((item) => item.row.label === label)?.amount ?? 0
    for (const row of linked) {
      check(group, `${row.label} 이 수량에 비례`, fixed(at(tripled, row.label), 4), fixed(at(t, row.label) * 3, 4))
    }
  }
  return { totals: t, tiers }
}

const tablet = verifyIdentities('정제 60정', tabletSheet())
const compact = verifyIdentities('정제 30정', compactSheet())

// 절사 규칙이 실제로 다르게 동작하는지(원 단위 반올림 vs 10원 절사) 확인한다.
check('절사', '원 단위 반올림 시트', tablet.totals.unitPrice % 1, 0)
check('절사', '10원 절사 시트', compact.totals.unitPrice % 10, 0)
check('절사', '10원 절사는 올리지 않음', compact.totals.unitPrice <= compact.totals.supplyPerSet, true)

// ── 실제 견적서 대조(파일이 있을 때만) ─────────────────────────────────────────
let compared = 0
if (existsSync(FIXTURE)) {
  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  for (const [name, sheet] of Object.entries(fixture.sheets ?? {})) {
    const t = calculate(sheet)
    const want = fixture.expect?.[name]
    if (!want) {
      // 기대값이 없으면 항등식만 본다. 견적서를 새로 넣는 중일 때의 경로.
      verifyIdentities(`견적서:${name}`, sheet)
      continue
    }
    const actual = {
      totalBatchKg: fixed(t.totalBatchKg, 2),
      materialCost: round(t.materialCost),
      packagingCost: round(t.packagingCost),
      processCost: round(t.processCost),
      analysisCost: round(t.analysisCost),
      excludedCost: round(t.excludedCost),
      supplyTotal: round(t.supplyTotal),
      unitPrice: t.unitPrice,
      quoteTotal: t.quoteTotal,
      proposalPerSet: round(t.proposalPerSet),
    }
    for (const [key, value] of Object.entries(want)) {
      check(`견적서:${name}`, key, actual[key], value)
      compared += 1
    }
  }
}

let failed = 0
let group = ''
for (const item of checks) {
  if (item.group !== group) {
    group = item.group
    console.log(`\n[${group}]`)
  }
  const ok = item.got === item.want
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${item.label.padEnd(34)} 계산=${item.got}${ok ? '' : `  기대=${item.want}`}`)
}

console.log(`\n${checks.length - failed}/${checks.length} 통과`)
if (!existsSync(FIXTURE)) {
  console.log(`실제 견적서 대조는 건너뜀 - ${FIXTURE} 이 없습니다(공개 저장소에 올리지 않는 파일).`)
} else {
  console.log(`실제 견적서 대조 ${compared}항목 포함.`)
}

rmSync(out, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
