/**
 * 표시량 ↔ 배합비율 환산과 일일영양성분 기준치.
 *
 * 연구원의 실제 작업 순서는 이 방향이다.
 *
 *   표시량(목표) → 단위 환산 → 기준 성분량 → ÷ 역가 → × (1 + 오버차지) → 투입량 → 배합비율
 *
 * 공장 견적서로 검산하면 맞는다. 비타민B1을 1.2mg 표시하려면
 *   역가 78.7%(티아민염산염 337.27 → 티아민 265.35), 오버차지 20%
 *   1.2 × 1.2 ÷ 0.787 = 1.830mg 투입 → 800mg 기준 0.229% → 견적서의 0.23%
 *
 * 엽산도 같다. 400㎍ DFE 표시 → 강화식품 환산 1.7 로 나눠 235㎍ → 오버차지 25%
 *   → 294㎍ 투입 → 0.0368% (견적서 값 그대로).
 *
 * 역가는 이 파일에 기본값으로 넣지 않는다. 원료 규격서(CoA)에 적힌 값이고 공급사·로트마다
 * 다르다. 미리 채워 두면 연구원이 그대로 믿고 쓰게 되고 그게 고객 문서의 함량 오류가 된다.
 * 이론값은 힌트로만 보여주고, 넣을지는 사람이 정한다.
 */

/**
 * 표시 단위 환산 계수. 표시량 1 단위가 기준 성분 몇 mg(또는 ㎍)인지가 아니라,
 * **표시 당량 → 실제 성분량** 으로 나눌 값이다.
 *
 *   엽산 400㎍ DFE ÷ 1.7 = 235㎍ 엽산   (강화식품·보충제의 엽산은 1㎍ = 1.7㎍ DFE)
 *   비타민E 11mg α-TE ÷ 1 = 11mg       (d-α-토코페롤 기준이면 그대로)
 *
 * 표시기준에 정해진 상수만 담는다. 확신하지 못하는 계수는 넣지 않는다(1 로 두고
 * 연구원이 판단).
 */
export const EQUIVALENT_FACTORS: Record<string, { factor: number; note: string }> = {
  'μg dfe': { factor: 1.7, note: '강화식품·보충제의 엽산 1㎍ = 1.7㎍ DFE' },
  '㎍ dfe': { factor: 1.7, note: '강화식품·보충제의 엽산 1㎍ = 1.7㎍ DFE' },
  'ug dfe': { factor: 1.7, note: '강화식품·보충제의 엽산 1㎍ = 1.7㎍ DFE' },
}

/** 표시량 문자열에서 숫자·단위를 읽는다. `400㎍ DFE`, `11mg α-TE`, `2.4ug` 등. */
export function parseLabelAmount(raw: string): { value: number; unit: string } | null {
  if (!raw) return null
  const match = raw.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(.*)$/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return { value, unit: match[2].trim() }
}

/** mg 로 환산한다. ㎍·µg·ug 는 1/1000, g 는 1000. 그 밖의 단위는 그대로 둔다. */
export function toMilligrams(value: number, unit: string): number | null {
  const head = unit.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/^(?:mg\b|mg$|mg\s)/.test(head) || head === '' || head.startsWith('mg')) return value
  if (/^(?:㎍|µg|μg|ug|mcg)/.test(head)) return value / 1000
  if (/^g\b|^g$/.test(head)) return value * 1000
  return null
}

/** 표시 당량 계수(DFE 등). 모르는 단위는 1. */
export function equivalentFactor(unit: string): { factor: number; note: string } {
  const key = unit.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const [pattern, entry] of Object.entries(EQUIVALENT_FACTORS)) {
    if (key.startsWith(pattern)) return entry
  }
  return { factor: 1, note: '' }
}

export type LabelInputs = {
  /** 표시량 원문(`1.2mg`, `400㎍ DFE`) */
  labelAmount: string
  /** 역가(%). 원료 1mg 에 기준 성분이 몇 % 들어있는지. 비어 있으면 환산하지 않는다. */
  potency: string
  /** 오버차지(%). 유통 중 감소를 감안한 과량 투입. 비어 있으면 0. */
  overage: string
  /** 1회분 중량(mg) */
  unitWeightMg: number
}

const num = (value: string) => {
  const parsed = Number(String(value ?? '').replace(/[,\s%]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export type LabelDerivation = {
  /** 표시량을 mg 로 환산한 값(당량 계수 적용 후 실제 성분량) */
  basisMg: number
  /** 원료로 넣어야 하는 양(mg/1회분) */
  inputMg: number
  /** 그 투입량에 해당하는 배합비율(%) */
  ratio: number
  /** 적용된 당량 계수와 설명 */
  equivalent: { factor: number; note: string }
}

/**
 * 표시량에서 배합비율을 역산한다. 읽을 수 없으면 null -
 * 계산할 수 없을 때 0 을 돌려주면 화면에 0% 가 채워져 잘못된 배합이 된다.
 */
export function deriveFromLabel(inputs: LabelInputs): LabelDerivation | null {
  const parsed = parseLabelAmount(inputs.labelAmount)
  if (!parsed) return null
  const equivalent = equivalentFactor(parsed.unit)
  const declaredMg = toMilligrams(parsed.value, parsed.unit)
  // IU·CFU 처럼 질량이 아닌 단위는 원료마다 환산이 달라 여기서 계산하지 않는다.
  if (declaredMg === null) return null

  const potency = num(inputs.potency)
  if (potency <= 0) return null
  const overage = num(inputs.overage)
  const unitWeight = inputs.unitWeightMg
  if (unitWeight <= 0) return null

  const basisMg = declaredMg / equivalent.factor
  const inputMg = (basisMg * (100 + overage)) / potency
  return { basisMg, inputMg, ratio: (inputMg / unitWeight) * 100, equivalent }
}

/** 투입량에서 표시량을 계산한다(입력한 배합비율이 목표 표시량과 맞는지 확인용). */
export function labelFromInput(inputMg: number, potency: string, overage: string, unit: string): number | null {
  const potencyValue = num(potency)
  if (potencyValue <= 0 || !Number.isFinite(inputMg)) return null
  const basisMg = (inputMg * potencyValue) / (100 + num(overage))
  const { factor } = equivalentFactor(unit)
  return basisMg * factor
}

/**
 * 자주 쓰는 염·에스터 형태의 **이론 역가**. 분자량 비로 계산한 값이다.
 *
 * 화면에 힌트로만 보여준다. 실제 역가는 원료 규격서를 따라야 한다 - 혼합제제·희석품은
 * 이 값과 크게 다르고(예: `비타민B12 혼합제제` 는 0.1% 희석품이 흔하다), 같은 이름의
 * 원료도 공급사마다 규격이 다르다.
 */
export const THEORETICAL_POTENCY: { form: string; basis: string; percent: number; note: string }[] = [
  { form: '티아민염산염', basis: '비타민 B1', percent: 78.7, note: '337.27 → 265.35' },
  { form: '비타민B1염산염', basis: '비타민 B1', percent: 78.7, note: '337.27 → 265.35' },
  { form: '티아민질산염', basis: '비타민 B1', percent: 78.8, note: '327.36 → 265.35 (질산염)' },
  { form: '비타민B1질산염', basis: '비타민 B1', percent: 78.8, note: '327.36 → 265.35 (질산염)' },
  { form: '피리독신염산염', basis: '비타민 B6', percent: 82.3, note: '205.64 → 169.18' },
  { form: '비타민B6염산염', basis: '비타민 B6', percent: 82.3, note: '205.64 → 169.18' },
  { form: '니코틴산아미드', basis: '나이아신', percent: 100, note: '나이아신 당량으로 그대로 표시' },
  { form: '판토텐산칼슘', basis: '판토텐산', percent: 92.0, note: '476.5 → 438.5 (칼슘염)' },
  { form: '아스코르빈산나트륨', basis: '비타민 C', percent: 88.9, note: '198.11 → 176.12' },
  { form: '아스코르빈산칼슘', basis: '비타민 C', percent: 82.6, note: '426.35 → 352.24 (2수화물 제외)' },
  { form: '산화아연', basis: '아연', percent: 80.3, note: '81.38 → 65.38' },
  { form: '글루콘산아연', basis: '아연', percent: 14.3, note: '455.7 → 65.38' },
  { form: '황산아연', basis: '아연', percent: 22.7, note: '287.5(7수화물) → 65.38' },
  { form: '산화마그네슘', basis: '마그네슘', percent: 60.3, note: '40.30 → 24.31' },
  { form: '탄산칼슘', basis: '칼슘', percent: 40.0, note: '100.09 → 40.08' },
  { form: '아셀렌산나트륨', basis: '셀레늄', percent: 45.7, note: '172.94 → 78.96' },
  { form: '황산망간', basis: '망간', percent: 32.5, note: '169.02(1수화물) → 54.94' },
  { form: '푸마르산제일철', basis: '철', percent: 32.9, note: '169.9 → 55.85' },
  { form: '요오드화칼륨', basis: '요오드', percent: 76.4, note: '166.0 → 126.9' },
]

/** 원료명으로 이론 역가 힌트를 찾는다. 없으면 null. */
export function potencyHint(name: string): { percent: number; basis: string; note: string } | null {
  const key = name.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s·+()-]/g, '')
  for (const entry of THEORETICAL_POTENCY) {
    if (key === entry.form.toLocaleLowerCase('ko-KR').replace(/[\s·+()-]/g, '')) {
      return { percent: entry.percent, basis: entry.basis, note: entry.note }
    }
  }
  return null
}

/**
 * 일일영양성분 기준치(식품등의 표시기준). 표시량 옆의 `%` 를 계산하는 분모다.
 *
 * 출처를 값마다 남겼다. 고객 문서에 나가는 숫자라 제가 확신하지 못하는 값을 조용히
 * 채우면 안 된다.
 *
 *   quote    받은 OEM 견적서에 `함량(비율%)` 이 함께 적혀 있어 역산으로 확인한 값
 *            (예: `나이아신 50mg(333%)` → 15mg)
 *   design   견적서의 표시량이 기준치 100% 설계로 보여 추정한 값. 확인이 필요하다.
 *   unknown  근거가 없어 비워 둔 값. `%` 를 계산하지 않는다.
 */
export type NrvSource = 'quote' | 'design' | 'unknown'

export type NrvEntry = { basis: string; amount: number; unit: string; source: NrvSource }

export const DAILY_VALUES: NrvEntry[] = [
  // 견적서에서 역산으로 확인한 값
  { basis: '비타민 B1', amount: 1.2, unit: 'mg', source: 'quote' },
  { basis: '비타민 B2', amount: 1.4, unit: 'mg', source: 'quote' },
  { basis: '비타민 B6', amount: 1.5, unit: 'mg', source: 'quote' },
  { basis: '비타민 B12', amount: 2.4, unit: '㎍', source: 'quote' },
  { basis: '나이아신', amount: 15, unit: 'mg', source: 'quote' },
  { basis: '판토텐산', amount: 5, unit: 'mg', source: 'quote' },
  { basis: '비오틴', amount: 30, unit: '㎍', source: 'quote' },
  { basis: '엽산', amount: 400, unit: '㎍ DFE', source: 'quote' },
  // 견적서 표시량이 100% 설계로 보이는 값. 표시기준 원문 확인이 필요하다.
  { basis: '셀레늄', amount: 55, unit: '㎍', source: 'design' },
  { basis: '망간', amount: 3, unit: 'mg', source: 'design' },
  { basis: '비타민 E', amount: 11, unit: 'mg α-TE', source: 'design' },
  // 근거를 확인하지 못한 값. 채우지 않고 화면에 '확인 필요' 로 알린다.
  { basis: '비타민 A', amount: 0, unit: '㎍ RAE', source: 'unknown' },
  { basis: '비타민 C', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '비타민 D', amount: 0, unit: '㎍', source: 'unknown' },
  { basis: '비타민 K', amount: 0, unit: '㎍', source: 'unknown' },
  { basis: '칼슘', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '철', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '아연', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '마그네슘', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '요오드', amount: 0, unit: '㎍', source: 'unknown' },
  { basis: '구리', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '인', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '칼륨', amount: 0, unit: 'mg', source: 'unknown' },
  { basis: '크롬', amount: 0, unit: '㎍', source: 'unknown' },
  { basis: '몰리브덴', amount: 0, unit: '㎍', source: 'unknown' },
]

const nrvKey = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s·+()-]/g, '')
const NRV_INDEX = new Map(DAILY_VALUES.map((entry) => [nrvKey(entry.basis), entry]))

export function dailyValueFor(basis: string | undefined): NrvEntry | null {
  if (!basis) return null
  return NRV_INDEX.get(nrvKey(basis)) ?? null
}

export type NrvResult =
  | { state: 'ok'; percent: number; entry: NrvEntry }
  | { state: 'needs-check'; entry: NrvEntry }
  | { state: 'no-basis' }
  | { state: 'unreadable' }

/**
 * 표시량이 일일영양성분 기준치의 몇 %인지. 기준치를 확인하지 못한 영양소는
 * 계산하지 않고 `needs-check` 를 돌려준다 - 근거 없는 숫자를 고객 문서에 넣지 않는다.
 */
export function dailyValuePercent(basis: string | undefined, labelAmount: string): NrvResult {
  const entry = dailyValueFor(basis)
  if (!entry) return { state: 'no-basis' }
  if (entry.source === 'unknown' || entry.amount <= 0) return { state: 'needs-check', entry }

  const parsed = parseLabelAmount(labelAmount)
  if (!parsed) return { state: 'unreadable' }
  // 표시 단위와 기준치 단위를 같은 자리로 맞춘다(mg 기준).
  const declared = toMilligrams(parsed.value, parsed.unit)
  const reference = toMilligrams(entry.amount, entry.unit)
  if (declared === null || reference === null || reference <= 0) return { state: 'unreadable' }
  return { state: 'ok', percent: (declared / reference) * 100, entry }
}

/** 배합비율 표기. 소수 네 자리까지 쓰고 뒤의 0 은 떼어낸다(45.5042%, 0.0368%). */
export function trimPercent(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(4)))
}
