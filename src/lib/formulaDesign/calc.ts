/**
 * 배합·원가 계산. 공장 견적서의 수식을 그대로 옮긴 순수 함수 모음이다.
 *
 * 계산 순서
 *   총 배합량 = 1회분 중량 × 1세트 개수 × 수량 ÷ 1e6 × (1 + Loss율)
 *   줄 배합량 = 총 배합량 × 배합비율 ÷ 100        (사용량을 직접 적으면 그 값을 쓴다)
 *   줄 금액   = 사용량 × 원료단가
 *   공급가    = 원료비 + 부자재비 + 가공비 + 분석비 + 간접비
 *   최종 단가 = 공급가 ÷ 수량 을 절사 자리에 맞춘 값
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
  OverheadRow,
  PackagingSpec,
  QuoteSettings,
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
  /** 1~4 블록 합계 */
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
  setCount: number
  perSet: { label: string; total: number; perSet: number }[]
}

function lineTotals(rows: LineRow[], setCount: number, totalUnits: number) {
  let included = 0
  let excluded = 0
  const calcs = rows.map((row) => {
    const quantity = lineQuantity(row, setCount, totalUnits)
    const amount = quantity * num(row.unitPrice)
    if (row.included) included += amount
    else excluded += amount
    return { row, quantity, amount, counted: row.included }
  })
  return { calcs, included, excluded }
}

const MODE_LABEL: Record<OverheadRow['mode'], string> = {
  amount: '총액',
  rate: '원가 대비',
  perSet: 'set당',
  perUnit: '낱개당',
}

function overheadAmount(row: OverheadRow, baseCost: number, setCount: number, totalUnits: number): number {
  const value = num(row.value)
  if (row.mode === 'amount') return value
  if (row.mode === 'rate') return (baseCost * value) / 100
  if (row.mode === 'perSet') return value * setCount
  return value * totalUnits
}

export function applyRounding(value: number, unit: number, mode: RoundMode): number {
  const step = unit > 0 ? unit : 1
  const scaled = value / step
  const rounded = mode === 'floor' ? Math.floor(scaled) : mode === 'ceil' ? Math.ceil(scaled) : Math.round(scaled)
  return rounded * step
}

/** 세트 수를 바꿔 계산할 수 있다(수량 구간별 단가). 비우면 시트에 적힌 수량을 쓴다. */
export function calculate(sheet: FormulaSheet, setCountOverride?: number): Totals {
  const { spec, quote } = sheet
  const setCount = setCountOverride ?? num(spec.setCount)
  const batch = batchOf(spec, setCount)

  let ratioSum = 0
  let batchSumKg = 0
  let usageSumKg = 0
  let materialCost = 0

  const materials = sheet.materials.map((row) => {
    const ratio = num(row.ratio)
    const batchKg = (batch.totalBatchKg * ratio) / 100
    // 사용량 직접 입력은 시트에 적힌 수량 기준이라 구간 계산에서는 쓰지 않는다.
    const overridden = setCountOverride === undefined && !blank(row.usage)
    const usageKg = overridden ? num(row.usage) : batchKg
    const amount = usageKg * num(row.unitPrice)
    ratioSum += ratio
    batchSumKg += batchKg
    usageSumKg += usageKg
    materialCost += amount
    return {
      row,
      batchKg,
      usageKg,
      overridden,
      amount,
      mgPerUnit: (num(spec.unitWeightMg) * ratio) / 100,
    }
  })

  const packaging = lineTotals(sheet.packagingItems, setCount, batch.totalUnits)
  const process = lineTotals(sheet.processItems, setCount, batch.totalUnits)
  const analysis = lineTotals(sheet.analysisItems, setCount, batch.totalUnits)

  const baseCost = materialCost + packaging.included + process.included + analysis.included

  let overheadCost = 0
  const overheads = quote.overheads.map((row) => {
    const amount = overheadAmount(row, baseCost, setCount, batch.totalUnits)
    overheadCost += amount
    return { row, amount, basis: MODE_LABEL[row.mode] }
  })

  const supplyTotal = baseCost + overheadCost
  const supplyPerSet = setCount > 0 ? supplyTotal / setCount : 0
  const unitPrice = applyRounding(supplyPerSet, num(quote.roundUnit) || 1, quote.roundMode)
  const quoteTotal = unitPrice * setCount
  const vatTotal = (quoteTotal * num(quote.vatRate)) / 100

  const share = (total: number) => (setCount > 0 ? total / setCount : 0)
  const perSet = [
    { label: '원재료비', total: materialCost, perSet: share(materialCost) },
    { label: '부자재비', total: packaging.included, perSet: share(packaging.included) },
    { label: '가공비', total: process.included, perSet: share(process.included) },
    { label: '분석비', total: analysis.included, perSet: share(analysis.included) },
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
    baseCost,
    overheadCost,
    supplyTotal,
    supplyPerSet,
    unitPrice,
    quoteTotal,
    vatTotal,
    paymentTotal: quoteTotal + vatTotal,
    proposalPerSet: unitPrice + (unitPrice * num(quote.vatRate)) / 100,
    perSet,
  }
}

export type Tier = {
  setCount: number
  unitPrice: number
  quoteTotal: number
  supplyPerSet: number
  /** 시트에 적힌 수량과 같은 구간인지 */
  current: boolean
}

/**
 * 수량 구간별 단가. 세트 수만 바꿔 전체를 다시 계산한다.
 * 수량이 세트 수에 따라 늘어나는 줄(basis set·unit)은 함께 늘고, 고정비(제판·목형·
 * 분석)는 그대로여서 구간이 커질수록 단가가 내려간다 - 공장 견적서와 같은 성질이다.
 */
export function calculateTiers(sheet: FormulaSheet, settings: QuoteSettings = sheet.quote): Tier[] {
  const current = num(sheet.spec.setCount)
  const counts = [...new Set(settings.tiers.map(num).filter((value) => value > 0))].sort((a, b) => a - b)
  return counts.map((setCount) => {
    const totals = calculate(sheet, setCount)
    return {
      setCount,
      unitPrice: totals.unitPrice,
      quoteTotal: totals.quoteTotal,
      supplyPerSet: totals.supplyPerSet,
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
