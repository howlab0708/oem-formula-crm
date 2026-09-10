/**
 * 배합·원가 계산. 공장 견적서의 수식을 그대로 옮긴 순수 함수 모음이다.
 *
 * 계산 순서
 *   총 배합량 = 1회분 중량 × 1세트 개수 × 수량 ÷ 1e6 × (1 + Loss율)
 *   줄 배합량 = 총 배합량 × 배합비율 ÷ 100        (사용량을 직접 적으면 그 값을 쓴다)
 *   줄 금액   = 사용량 × 원료단가
 *   공급가    = 원료비 + 부자재비 + 가공비 + 분석비 + 재고비 + 간접비
 *   최종 단가 = 공급가 ÷ 수량 을 절사 자리에 맞춘 값
 *   제안가    = (공급가 ÷ 수량) × (1 + 부가세율) 을 절사 자리에 맞춘 값
 *
 * 제안가는 최종 단가가 아니라 절사 전 값에 부가세를 걸어 구한다. 같은 제품 견적서의
 * 개정판 세 장을 모두 맞추는 방식이 이것뿐이다 - 자세한 이유는 아래 주석에 적었다.
 *
 * 반올림 규칙: 엑셀 셀과 같이 값은 전부 원래 정밀도로 들고 다니고, 표시할 때만
 * 반올림한다. 그래서 화면에 8.004kg 으로 보이는 줄의 금액은 8.00448kg 기준이고,
 * 소계도 각 줄의 표시값이 아니라 반올림 전 값의 합이다 - 실제 공장 견적서의 소계가
 * 줄 표시값을 더한 값과 1원 어긋나는 이유가 이것이다. 엑셀과 같은 숫자를 내려면
 * 이 순서를 지켜야 한다.
 *
 * 실제 견적서와의 대조는 `scripts/verify-formula-calc.mjs` 가 한다. 공장에서 받은
 * 단가·마진은 이 저장소가 공개라 담지 않고, git 에서 제외한 로컬 파일로 둔다.
 */

import type {
  FormulaSheet,
  LineRow,
  MaterialRow,
  OverheadBase,
  OverheadRow,
  PackagingSpec,
  QuoteSettings,
  QuoteTier,
  RoundMode,
} from './types'

/** 쉼표·단위·공백이 섞인 입력을 숫자로 읽는다. 읽을 수 없으면 0. */
export function num(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number(String(value).replace(/[,\s원%]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/** 입력이 비어 있는지. 0 과 빈칸을 구분해야 하는 곳(사용량 직접 입력)에서 쓴다. */
export function blank(value: string | null | undefined): boolean {
  return !value || !String(value).trim()
}

/** 제형에 맞는 낱개 단위 이름. 규격 표기와 섭취방법 문구에 쓴다. */
export function unitNoun(form: string): string {
  if (/캡슐/.test(form)) return '캡슐'
  if (/분말|과립|스틱|포/.test(form)) return '포'
  if (/액상|시럽|앰플|드링크/.test(form)) return '병'
  if (/젤리|구미/.test(form)) return '개'
  return '정'
}

/** 800mg x 60정 (48g) 형태의 포장 단위 표기를 만든다. */
export function packageLabel(spec: PackagingSpec): string {
  const weight = num(spec.unitWeightMg)
  const count = num(spec.unitsPerSet)
  if (weight <= 0 || count <= 0) return ''
  const noun = unitNoun(spec.form)
  const grams = (weight * count) / 1000
  const gramText = `${grams.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}g`
  return `${weight.toLocaleString('ko-KR')}mg x ${count.toLocaleString('ko-KR')}${noun} (${gramText})`
}

/** 배합 총량. 세트 수를 바꿔 가며 부르므로 인자로 받는다. */
export type Batch = {
  /** 총 낱개 수(정) */
  totalUnits: number
  /** Loss 를 뺀 순 배합량(kg) = 제품으로 나가는 양 */
  netBatchKg: number
  /** Loss 를 더한 총 배합량(kg) = 원료를 실제로 투입하는 양 */
  totalBatchKg: number
}

export function batchOf(spec: PackagingSpec, setCount = num(spec.setCount)): Batch {
  const totalUnits = num(spec.unitsPerSet) * setCount
  const netBatchKg = (num(spec.unitWeightMg) * totalUnits) / 1000000
  // 48 × 1.1 은 부동소수 오차로 52.800000000000004 가 된다. 나눗셈을 마지막에 둔다.
  const totalBatchKg = (netBatchKg * (100 + num(spec.lossPercent))) / 100
  return { totalUnits, netBatchKg, totalBatchKg }
}

/**
 * 부자재·가공·분석 한 줄의 수량.
 * fixed 는 직접 입력, set·unit 은 세트 수·낱개 수를 팩 크기로 나눠 올린다.
 */
export function lineQuantity(row: LineRow, setCount: number, totalUnits: number): number {
  if (row.basis === 'fixed') return num(row.quantity)
  const total = row.basis === 'set' ? setCount : totalUnits
  const pack = num(row.packSize) || 1
  if (pack <= 0) return 0
  return Math.ceil(total / pack)
}

export type MaterialCalc = {
  row: MaterialRow
  /** 배합비율로 역산한 배합량(kg) */
  batchKg: number
  /** 실제 투입·발주량(kg). 직접 입력이 있으면 그 값. */
  usageKg: number
  /** 사용량을 직접 입력해 배합량과 달라진 줄인지 */
  overridden: boolean
  /** 팩 단위 청구로 사용량이 팩 배수까지 올라간 줄인지 */
  packedUp: boolean
  amount: number
  /** 1정(1캡슐)당 투입량(mg). 표시량 검토용 참고값. */
  mgPerUnit: number
}

export type LineCalc = { row: LineRow; quantity: number; amount: number; counted: boolean }

export type OverheadCalc = { row: OverheadRow; amount: number; basis: string }

export type Totals = Batch & {
  ratioSum: number
  /** 100% 까지 남은 배합비율. 부형제로 채울 양. */
  ratioGap: number
  usageSumKg: number
  batchSumKg: number
  materials: MaterialCalc[]
  packaging: LineCalc[]
  process: LineCalc[]
  analysis: LineCalc[]
  overheads: OverheadCalc[]
  materialCost: number
  packagingCost: number
  processCost: number
  analysisCost: number
  /** 견적에서 빠진 별도청구·발주처제공 금액 합 */
  excludedCost: number
  /** 재고비. `QuoteSettings.stockRate` 가 비어 있으면 0. */
  stockCost: number
  /** 1~4 블록 합계(재고비 제외) */
  blockCost: number
  /** 간접비 `rate` 모드의 `total` 기준. 1~4 블록 합계 + 재고비. */
  baseCost: number
  overheadCost: number
  supplyTotal: number
  supplyPerSet: number
  /** 절사 규칙을 적용한 최종 단가(원/set) */
  unitPrice: number
  /** 최종 단가 × 세트 수 */
  quoteTotal: number
  vatTotal: number
  /** 부가세 포함 결제 금액 */
  paymentTotal: number
  /** 부가세를 포함한 세트당 제안가 */
  proposalPerSet: number
  /** 제안가 × 세트 수 */
  proposalTotal: number
  setCount: number
  perSet: { label: string; total: number; perSet: number }[]
}

function lineTotals(rows: LineRow[], setCount: number, totalUnits: number, factor = 1) {
  let included = 0
  let excluded = 0
  const calcs = rows.map((row) => {
    const quantity = lineQuantity(row, setCount, totalUnits)
    const amount = quantity * num(row.unitPrice) * factor
    if (row.included) included += amount
    else excluded += amount
    return { row, quantity, amount, counted: row.included }
  })
  return { calcs, included, excluded }
}

/**
 * 구간별 단가 할인율(%). **양수가 인하**다. 블록의 모든 줄 단가에 같은 비율로 걸린다.
 * 시트에 적힌 수량으로 계산할 때는 걸지 않는다 - 견적 요약은 할인 전 기준 단가다.
 */
export type TierDiscount = { material: number; packaging: number; process: number }

export const NO_DISCOUNT: TierDiscount = { material: 0, packaging: 0, process: 0 }

export function discountOf(tier: QuoteTier): TierDiscount {
  return {
    material: num(tier.materialDiscount),
    packaging: num(tier.packagingDiscount),
    process: num(tier.processDiscount),
  }
}

export const hasDiscount = (discount: TierDiscount): boolean =>
  discount.material !== 0 || discount.packaging !== 0 || discount.process !== 0

const MODE_LABEL: Record<OverheadRow['mode'], string> = {
  amount: '금액 그대로',
  rate: '원가 대비',      // rate 는 아래에서 기준 이름으로 바꿔 적는다
  perSet: '세트당 단가',
  perUnit: '낱개당 단가',
}

export const OVERHEAD_BASE_LABEL: Record<OverheadBase, string> = {
  total: '원가 합계',
  process: '가공비',
  material: '원료비',
}

/** `rate` 모드가 %를 걸 금액. 블록별 소계와 앞선 간접비 누계를 받아 고른다. */
export type OverheadBases = Record<OverheadBase, number>

export function overheadBaseOf(row: OverheadRow, bases: OverheadBases, prior: number): number {
  return bases[row.base ?? 'total'] + (row.includePrior ? prior : 0)
}

/**
 * 간접비 한 줄의 금액. `prior` 는 이 줄 위쪽 간접비의 합계다 -
 * 기업이윤을 (가공비 + 일반관리비) 대비 %로 붙이는 공장이 있어 필요하다.
 */
function overheadAmount(
  row: OverheadRow,
  bases: OverheadBases,
  prior: number,
  setCount: number,
  totalUnits: number,
): number {
  const value = num(row.value)
  if (row.mode === 'amount') return value
  if (row.mode === 'rate') return (overheadBaseOf(row, bases, prior) * value) / 100
  if (row.mode === 'perSet') return value * setCount
  return value * totalUnits
}

export function applyRounding(value: number, unit: number, mode: RoundMode): number {
  const step = unit > 0 ? unit : 1
  const scaled = value / step
  const rounded = mode === 'floor' ? Math.floor(scaled) : mode === 'ceil' ? Math.ceil(scaled) : Math.round(scaled)
  return rounded * step
}

/**
 * 세트 수를 바꿔 계산할 수 있다(수량 구간별 단가). 비우면 시트에 적힌 수량을 쓴다.
 * `discount` 는 그 구간에서 공장이 낮춰 준 단가를 블록별 할인율로 받는다(양수가 인하).
 */
export function calculate(sheet: FormulaSheet, setCountOverride?: number, discount: TierDiscount = NO_DISCOUNT): Totals {
  const { spec, quote } = sheet
  const setCount = setCountOverride ?? num(spec.setCount)
  const batch = batchOf(spec, setCount)
  // 할인율은 양수가 인하이므로 단가에 곱할 배수는 1 에서 뺀다.
  const factor = (percent: number) => 1 - percent / 100

  let ratioSum = 0
  let batchSumKg = 0
  let usageSumKg = 0
  let materialCost = 0

  const materials = sheet.materials.map((row) => {
    const ratio = num(row.ratio)
    const batchKg = (batch.totalBatchKg * ratio) / 100
    // 사용량 직접 입력은 시트에 적힌 수량 기준이라 구간 계산에서는 쓰지 않는다.
    const overridden = setCountOverride === undefined && !blank(row.usage)
    // 팩 단위 청구는 배합량에서 계산하므로 구간 계산에도 그대로 적용된다.
    const packKg = row.packBilled ? num(row.packKg) : 0
    const packedUp = !overridden && packKg > 0 && batchKg > 0
    const usageKg = overridden ? num(row.usage) : packedUp ? Math.ceil(batchKg / packKg) * packKg : batchKg
    const amount = usageKg * num(row.unitPrice) * factor(discount.material)
    ratioSum += ratio
    batchSumKg += batchKg
    usageSumKg += usageKg
    materialCost += amount
    return {
      row,
      batchKg,
      usageKg,
      overridden,
      packedUp,
      amount,
      mgPerUnit: (num(spec.unitWeightMg) * ratio) / 100,
    }
  })

  const packaging = lineTotals(sheet.packagingItems, setCount, batch.totalUnits, factor(discount.packaging))
  const process = lineTotals(sheet.processItems, setCount, batch.totalUnits, factor(discount.process))
  // 분석비는 초도 1회성이라 수량 구간의 할인 대상이 아니다.
  const analysis = lineTotals(sheet.analysisItems, setCount, batch.totalUnits)

  const blockCost = materialCost + packaging.included + process.included + analysis.included
  // 재고비는 재고로 쥐고 있는 실물(원료·부자재)에만 걸린다.
  const stockCost = ((materialCost + packaging.included) * num(quote.stockRate)) / 100
  const baseCost = blockCost + stockCost

  const bases: OverheadBases = { total: baseCost, process: process.included, material: materialCost }
  let overheadCost = 0
  const overheads = quote.overheads.map((row) => {
    const amount = overheadAmount(row, bases, overheadCost, setCount, batch.totalUnits)
    const basis =
      row.mode === 'rate'
        ? `${OVERHEAD_BASE_LABEL[row.base ?? 'total']}${row.includePrior ? '+앞선 간접비' : ''} 대비`
        : MODE_LABEL[row.mode]
    overheadCost += amount
    return { row, amount, basis }
  })

  const supplyTotal = baseCost + overheadCost
  const supplyPerSet = setCount > 0 ? supplyTotal / setCount : 0
  const roundUnit = num(quote.roundUnit) || 1
  const unitPrice = applyRounding(supplyPerSet, roundUnit, quote.roundMode)
  const quoteTotal = unitPrice * setCount
  const vatTotal = (quoteTotal * num(quote.vatRate)) / 100
  // 제안가는 절사 전 set당 공급가에 부가세를 더해 절사한다. 같은 제품 견적서의 개정판
  // 세 장을 모두 맞추는 방식이 이것뿐이다 - 절사한 최종 단가에 부가세를 곱하면 그중
  // 한 장에서 1원 어긋난다. 대조는 `scripts/verify-formula-calc.mjs` 가 한다.
  const proposalPerSet = applyRounding(
    supplyPerSet * (1 + num(quote.vatRate) / 100),
    roundUnit,
    quote.roundMode,
  )

  const share = (total: number) => (setCount > 0 ? total / setCount : 0)
  const perSet = [
    { label: '원재료비', total: materialCost, perSet: share(materialCost) },
    { label: '부자재비', total: packaging.included, perSet: share(packaging.included) },
    { label: '가공비', total: process.included, perSet: share(process.included) },
    { label: '분석비', total: analysis.included, perSet: share(analysis.included) },
    // 재고비는 값을 넣은 시트에만 줄이 생긴다. 견적서 양식에도 비어 있는 칸이다.
    ...(stockCost > 0
      ? [{ label: `재고비 (${num(quote.stockRate)}%)`, total: stockCost, perSet: share(stockCost) }]
      : []),
    ...overheads.map((item) => ({
      label: item.row.label || '간접비',
      total: item.amount,
      perSet: share(item.amount),
    })),
  ]

  return {
    ...batch,
    setCount,
    ratioSum,
    ratioGap: 100 - ratioSum,
    batchSumKg,
    usageSumKg,
    materials,
    packaging: packaging.calcs,
    process: process.calcs,
    analysis: analysis.calcs,
    overheads,
    materialCost,
    packagingCost: packaging.included,
    processCost: process.included,
    analysisCost: analysis.included,
    excludedCost: packaging.excluded + process.excluded + analysis.excluded,
    stockCost,
    blockCost,
    baseCost,
    overheadCost,
    supplyTotal,
    supplyPerSet,
    unitPrice,
    quoteTotal,
    vatTotal,
    paymentTotal: quoteTotal + vatTotal,
    proposalPerSet,
    proposalTotal: proposalPerSet * setCount,
    perSet,
  }
}

export type Tier = {
  row: QuoteTier
  setCount: number
  unitPrice: number
  quoteTotal: number
  supplyPerSet: number
  proposalPerSet: number
  /** 할인을 걸지 않았을 때의 단가. 할인 폭을 보여 주는 기준값이다. */
  basePrice: number
  discount: TierDiscount
  /** 시트에 적힌 수량과 같은 구간인지 */
  current: boolean
}

/**
 * 수량 구간별 단가. 세트 수를 바꿔 전체를 다시 계산하고, 구간에 적힌 할인율을 건다.
 *
 * 수량에 비례하는 줄(basis set·unit)은 함께 늘고 고정비(제판·목형·분석)는 그대로다.
 * 고정비가 전부 별도청구로 빠진 구조에서는 그것만으로는 단가가 내려가지 않으므로,
 * 실제 대량 할인은 구간의 할인율로 넣는다.
 */
export function calculateTiers(sheet: FormulaSheet, settings: QuoteSettings = sheet.quote): Tier[] {
  const current = num(sheet.spec.setCount)
  const seen = new Set<number>()
  return settings.tiers
    .map((row) => ({ row, setCount: num(row.setCount) }))
    .filter(({ setCount }) => {
      if (setCount <= 0 || seen.has(setCount)) return false
      seen.add(setCount)
      return true
    })
    .sort((a, b) => a.setCount - b.setCount)
    .map(({ row, setCount }) => {
      const discount = discountOf(row)
      const totals = calculate(sheet, setCount, discount)
      return {
        row,
        setCount,
        unitPrice: totals.unitPrice,
        quoteTotal: totals.quoteTotal,
        supplyPerSet: totals.supplyPerSet,
        proposalPerSet: totals.proposalPerSet,
        basePrice: hasDiscount(discount) ? calculate(sheet, setCount).unitPrice : totals.unitPrice,
        discount,
        current: setCount === current,
      }
    })
}

/** 배합비율 합이 100 이 되도록 지정한 줄에 남은 양을 넣는다. 부형제 조정용. */
export function fillRemainder(materials: MaterialRow[], rowId: string): MaterialRow[] {
  const others = materials.reduce((sum, row) => (row.id === rowId ? sum : sum + num(row.ratio)), 0)
  const remainder = Math.max(0, 100 - others)
  return materials.map((row) => (row.id === rowId ? { ...row, ratio: trimRatio(remainder) } : row))
}

/** 배합비율은 소수 네 자리까지 쓴다(엑셀의 45.5042% 와 같은 정밀도). */
export function trimRatio(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(4)))
}

/** 1정당 투입량(mg)에서 배합비율(%)을 되돌린다. 표시량부터 설계할 때 쓴다. */
export function ratioFromMgPerUnit(mgPerUnit: number, unitWeightMg: number): string {
  if (unitWeightMg <= 0 || !Number.isFinite(mgPerUnit)) return ''
  return trimRatio((mgPerUnit / unitWeightMg) * 100)
}

export function formatKg(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatWon(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return Math.round(value).toLocaleString('ko-KR')
}

export function formatWonDecimal(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}
