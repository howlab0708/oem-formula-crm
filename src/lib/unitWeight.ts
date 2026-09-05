import type { FormType } from './types'

const PILL_FORMS = new Set<FormType>(['정제', '경질캡슐', '연질캡슐', '캡슐', '환'])
export function isPillForm(form: FormType): boolean {
  return PILL_FORMS.has(form)
}

const N = String.raw`([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)`
const MASS = String.raw`(kg|mg|g|mcg|μg|ug)(?![a-z])`
const PILL = String.raw`(?:캡슐|캅셀|캅슐|정제|타블렛|정|알|환|capsules?|tablets?)`
const C = String.raw`([0-9]+)\s*${PILL}`
const MASS_FACTORS: Record<string, number> = { kg: 1000000, g: 1000, mg: 1, mcg: 0.001, 'μg': 0.001, ug: 0.001 }

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/µ/g, 'μ').replace(/캅셀/g, '캡슐').replace(/\s+/g, ' ').trim()
}

function milligrams(number: string, unit: string): number {
  return Number(number.replace(/,/g, '')) * MASS_FACTORS[unit.toLowerCase()]
}

function agreedValue(values: number[]): number | null {
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null
  const valid = values.filter((value) => Number.isFinite(value) && value > 0)
  if (!valid.length || valid.some((value) => Math.abs(value - valid[0]) > 0.001)) return null
  return Math.round(valid[0] * 1000) / 1000 || null
}

/** 명시된 알 수와 제품 중량만 사용한다. 성분 함량이나 섭취 횟수로 중량을 추정하지 않는다. */
function explicitWeights(text: string): number[] {
  const values: number[] = []
  // 250mg/1캡슐, 1,000mg/2정. 분모의 알 수를 반드시 나눈다.
  for (const match of text.matchAll(new RegExp(`${N}\\s*${MASS}\\s*/\\s*([0-9]+)\\s*${PILL}`, 'gi'))) {
    const count = Number(match[3])
    values.push(count > 0 ? milligrams(match[1], match[2]) / count : NaN)
  }
  // 1정당 500mg, 2정(1,000mg), 1캡슐 중량: 500mg.
  const afterCount = String.raw`(?:\s*(?:당\s*|(?:의\s*)?(?:중량|무게)\s*(?:은|는|:|=)?\s*|[:=]\s*|[([]\s*)|\s+)`
  for (const match of text.matchAll(new RegExp(`${C}${afterCount}${N}\\s*${MASS}(?!\\s*(?:/|[x×*]|씩))`, 'gi'))) {
    const count = Number(match[1])
    values.push(count > 0 ? milligrams(match[2], match[3]) / count : NaN)
  }
  // 500mg × 2정: 곱하기 앞의 중량이 1알 중량이다.
  for (const match of text.matchAll(new RegExp(`${N}\\s*${MASS}\\s*[x×*]\\s*${C}`, 'gi'))) {
    values.push(Number(match[3]) > 0 ? milligrams(match[1], match[2]) : NaN)
  }
  // 500mg(1정), 1,000mg(2캡슐).
  for (const match of text.matchAll(new RegExp(`${N}\\s*${MASS}\\s*[(]\\s*${C}\\s*[)]`, 'gi'))) {
    const count = Number(match[3])
    values.push(count > 0 ? milligrams(match[1], match[2]) / count : NaN)
  }
  return values
}

type UnitWeightInput = {
  form: FormType
  intakeMethod: string
  /** 제품의 전체 중량을 알 수와 함께 명시한 규격 열. */
  declaredWeight?: string
  /** 열 이름 자체가 '1알 중량(mg)'인 경우에만 전달한다. */
  unitWeight?: string
}

export function parseUnitWeightMg({ form, intakeMethod, declaredWeight = '', unitWeight }: UnitWeightInput): number | null {
  if (!isPillForm(form)) return null
  const values: number[] = []
  if (unitWeight?.trim()) {
    const value = normalize(unitWeight)
    const mass = new RegExp(`^${N}\\s*${MASS}$`, 'i').exec(value)
    const bare = new RegExp(`^${N}$`).exec(value)
    const explicit = explicitWeights(value)
    if (mass) values.push(milligrams(mass[1], mass[2]))
    else if (bare) values.push(Number(bare[1].replace(/,/g, '')))
    else if (explicit.length) values.push(...explicit)
    else return null
  }
  const intake = normalize(`${intakeMethod} ${declaredWeight}`)
  // 복합 포장(서로 다른 정·캡슐), 가변 개수·용량은 단일 1알 중량으로 확정하지 않는다.
  if (new RegExp(`[0-9]\\s*(?:~|～|∼|–|-|또는)\\s*[0-9]+\\s*${PILL}`, 'i').test(intake)) return null
  if (new RegExp(`[0-9](?:\\.[0-9]+|\\s*/\\s*[0-9]+)\\s*${PILL}`, 'i').test(intake)) return null
  if (new RegExp(`${C}\\s*(?:또는|혹은)\\s*[0-9]+\\s*(?:${PILL}|포|병)`, 'i').test(intake)) return null
  // 2정(500mg, 600mg) 같은 혼합 구성이나 용량 범위는 첫 중량만 읽지 않는다.
  if (new RegExp(`${N}\\s*${MASS}\\s*(?:,|/|[+~∼–-]|및|와|과|또는)\\s*${N}\\s*${MASS}`, 'i').test(intake)) return null
  if (new RegExp(`${N}\\s*(?:~|∼|–|-)\\s*${N}\\s*${MASS}`, 'i').test(intake)) return null
  // '1.100mg'은 소수/천 단위 구분이 불명확하다. 1.1mg 또는 1,100mg으로 임의 보정하지 않는다.
  if (/[1-9][0-9]*\.[0-9]{3}\s*mg\b/i.test(intake)) return null
  values.push(...explicitWeights(normalize(intakeMethod)), ...explicitWeights(normalize(declaredWeight)))
  return agreedValue(values)
}
