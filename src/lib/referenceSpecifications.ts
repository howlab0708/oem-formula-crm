import type { Product } from './types'
import { standardUnitWeightMg } from './standardUnitWeight'
import { isPillForm } from './unitWeight'
import { traceCompanyMatches, traceProductMatches } from './server/foodTraceability'
import { PRODUCT_SPECIFICATION_EVIDENCE } from '../data/productSpecificationEvidence'

const normalize = (text: string) => text.normalize('NFKC').replace(/캅셀|캅슐/g, '캡슐').replace(/\s+/g, ' ').trim()
const positiveCount = (value: string): number | null => {
  if (!/^\d+(?:,\d{3})*$/.test(value.trim())) return null
  const count = Number(value.replace(/,/g, ''))
  return Number.isSafeInteger(count) && count > 0 && count <= 1_000_000 ? count : null
}

/** Packaging counts only: never turn intake frequency, days, or mixed bundles into one set. */
function packageCount(text: string, product: Product): number | null {
  const value = normalize(text)
  if (/[+~∼–]|\d\s*-\s*\d|또는|혹은|[x×*]\s*\d+\s*(?:병|박스|세트|팩|통)/i.test(value)) return null
  const unit = isPillForm(product.form) ? '(?:캡슐|정제|정|알|환)' : '(?:포|스틱|병|팩|개)'
  const count = String.raw`(\d+(?:,\d{3})*)\s*${unit}`
  const matches = [
    ...value.matchAll(new RegExp(`(?:mg|g)\\s*[x×*]\\s*${count}`, 'gi')),
    ...value.matchAll(new RegExp(`(?:mg|g)\\s*[(]\\s*${count}\\s*[)]`, 'gi')),
    ...value.matchAll(new RegExp(`(?:총\\s*(?:내용량|중량)\\s*[:：]?\\s*[\\d,.]+\\s*(?:mg|g)\\s*[,(/]\\s*|총\\s*)${count}`, 'gi')),
    ...value.matchAll(new RegExp(`^${count}(?:입)?$`, 'gi')),
    ...value.matchAll(new RegExp(`(?:^|[\\s(,])${count}\\s*(?:입|포장|/\\s*(?:박스|세트|병|통))(?=$|[\\s),])`, 'gi')),
    ...value.matchAll(new RegExp(`(?:1\\s*(?:박스|세트|병|통)\\s*[:：/]\\s*)${count}(?=$|[\\s),])`, 'gi')),
  ].map(m => positiveCount(m[1])).filter((n): n is number => n !== null)
  return matches.length && matches.every(n => n === matches[0]) ? matches[0] : null
}

/** Only explicit packaging words; a powder form alone does not imply a stick pouch. */
function declaredPackaging(text: string): string {
  const value = normalize(text)
  if (/또는|혹은|선택|미정|아님|불가|없음/.test(value)) return ''
  const types = [
    [/\bPTP\b|피티피/i, 'PTP 포장'],
    [/스틱\s*(?:포장|파우치)|스틱포(?:\s|[,)/]|$)/, '스틱포 포장'],
    [/\bPE\s*병\b|PE병/i, 'PE병 포장'],
    [/\bPET\s*병\b|PET병/i, 'PET병 포장'],
    [/유리병/, '유리병 포장'],
    [/파우치/, '파우치 포장'],
  ] as const
  const matches = types.filter(([pattern]) => pattern.test(value)).map(([, label]) => label)
  const distinct = matches.filter(label => label !== '파우치 포장' || !matches.includes('스틱포 포장'))
  return distinct.length === 1 ? distinct[0] : ''
}

/** Shared by product detail and quote import so displayed and transferred facts agree. */
export function referenceSpecifications(product: Product) {
  const key = (text: string) => normalize(text).replace(/\s+/g, '').toLowerCase()
  const official = PRODUCT_SPECIFICATION_EVIDENCE.find(entry => product.reportNo === entry.reportNo
    && key(product.name) === key(entry.productName) && traceCompanyMatches(product.manufacturer, entry.manufacturer)
    && (!product.sourceUpdatedAt || product.sourceUpdatedAt.slice(0, 10) <= entry.checkedAt)
    && (product.unitWeightMg == null || product.unitWeightMg === entry.unitWeightMg)
    && entry.markers.every(expected => product.markers.some(marker => key(marker.name) === key(expected.name)
      && marker.mgValue !== null && Math.abs(marker.mgValue - expected.mgValue) < 0.000001)))
  const details = { ...official?.details, ...product.referenceDetails }
  const trace = product.traceability
  const lot = trace?.status === 'matched' && trace.lot
    && traceCompanyMatches(product.manufacturer, trace.lot.manufacturer)
    && traceProductMatches(product.name, trace.lot.productName) ? trace.lot : null
  const specifications = [details.declaredWeight || product.weightLabel, product.name, lot?.productName ?? ''].filter(Boolean)
  // Nutrient marker numerators and daily intake counts are not product weights.
  const mixedForm = !isPillForm(product.form) && /\d\s*(?:캡슐|정제|정|알|환)/.test(normalize(specifications.join(' ; ')))
  const unitWeightMg = mixedForm ? null : standardUnitWeightMg({ ...product, weightLabel: specifications.join(' ; ') })
  const counts = [
    ...(details.unitsPerSet ? [positiveCount(details.unitsPerSet) ?? packageCount(details.unitsPerSet, product)] : []),
    ...[...specifications, details.packaging ?? ''].map(raw => packageCount(raw, product)),
  ].filter((n): n is number => n !== null)
  const unitsPerSet = counts.length && counts.every(n => n === counts[0]) ? String(counts[0]) : ''
  const packaging = details.packaging?.trim() || declaredPackaging(specifications.join(' ; '))
  const intakeGuide = product.intakeMethod?.trim() ?? ''
  const shelfLife = details.shelfLife ?? ''
  const missing = [unitWeightMg === null ? '1개 중량' : '', !unitsPerSet ? '포장 개수' : '', !packaging ? '포장 형태' : '', !intakeGuide ? '섭취방법' : '', !shelfLife ? '소비기한' : ''].filter(Boolean)
  return { unitWeightMg, unitsPerSet, packaging, intakeGuide, shelfLife, missing, officialSource: official,
    evidence: [
      details.declaredWeight ? `내용량 원문: ${details.declaredWeight}` : '',
      official ? `${official.sourceTitle} · 확인 ${official.checkedAt}: ${official.sourceUrl}` : '',
      lot ? `확인된 생산 이력 규격: ${lot.productName}` : '',
      details.appearance ? `성상: ${details.appearance}` : '',
      details.storageGuide ? `보관방법: ${details.storageGuide}` : '',
      details.intakeCaution ? `섭취 시 주의사항: ${details.intakeCaution}` : '',
    ].filter(Boolean),
  }
}
