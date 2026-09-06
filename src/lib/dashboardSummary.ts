import references from '../data/dashboardReferences.json'
import type { FilterState } from './filters'
import { mainIngredientKey, mainIngredientLabel } from './ingredientNames'
import { parseUnitWeightMg, isPillForm } from './unitWeight'
import { standardUnitWeightMg } from './standardUnitWeight'
import { compareRda, DEFAULT_RDA_PROFILE, rdaKey } from './rda'
import type { Marker, Product } from './types'

const NUMBER = String.raw`([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)`
const MASS = String.raw`(mg|mcg|μg|ug|g)(?![a-z])`
const ITEM = String.raw`(캡슐|정제|정|알|환|포|병|팩|스틱|개)`
const FACTORS: Record<string, number> = { mg: 1, g: 1000, mcg: .001, 'μg': .001, ug: .001 }
const normalize = (text: string) => text.normalize('NFKC').replace(/µ/g, 'μ').replace(/캅셀|캅슐/g, '캡슐').replace(/\s+/g, ' ').trim()
const mass = (value: string, unit: string) => Number(value.replace(/,/g, '')) * FACTORS[unit.toLowerCase()]
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const agree = (values: number[]) => values.length && values.every(v => Number.isFinite(v) && v > 0 && Math.abs(v - values[0]) < .001) ? values[0] : null

/** Only explicit daily frequency and product mass. Neither specification denominators
 * nor nutrient content are assumed to be the daily product mass. */
export function dailyWeightMg(product: Product): number | null {
  const text = normalize(product.intakeMethod ?? '')
  if (!text || /(?:~|∼|–|또는|혹은|내지|이상|이하|성인|어린이|소아|세\s*[미만이상]|격일)/.test(text)) return null
  if (/\d\s*-\s*\d|\d\.[0-9]{3}\s*mg/i.test(text)) return null
  if (new RegExp(`(?:[)\\]]\\s*,|및|[+])\\s*\\d+\\s*${ITEM}`).test(text)) return null
  const daily = [...text.matchAll(/(?:1\s*일|하루|일일)\s*(?:섭취량\s*[:：]?\s*)?(\d+)\s*회/g)]
  const times = daily.length === 1 ? Number(daily[0][1]) : null
  if (times !== null && (times <= 0 || times > 24)) return null
  const values: number[] = []
  // Explicit '1일 섭취량: 2g', without a volume/dose denominator.
  const direct = new RegExp(`(?:1\\s*일|하루|일일)\\s*(?:총\\s*)?(?:섭취량\\s*[:：]?\\s*)?${NUMBER}\\s*${MASS}(?!\\s*[/x×*])`, 'gi')
  for (const m of text.matchAll(direct)) values.push(mass(m[1], m[2]))
  const counts = [...text.matchAll(new RegExp(`1\\s*회\\s*(?:에\\s*)?(\\d+)\\s*${ITEM}`, 'g'))]
  const dayCounts = [...text.matchAll(new RegExp(`(?:1\\s*일|하루|일일)\\s*(\\d+)\\s*${ITEM}`, 'g'))]
  // Multiple portions/components and alternatives require a separate interpretation.
  if (counts.length > 1 || dayCounts.length > 1) return null
  const count = counts[0] ?? dayCounts[0]
  const multiplier = counts.length ? times : 1
  if (count && multiplier !== null) {
    const quantity = Number(count[1])
    if (quantity <= 0) return null
    const item = count[2]
    if (isPillForm(product.form) && /^(캡슐|정제|정|알|환)$/.test(item)) {
      const unit = parseUnitWeightMg({ form: product.form, intakeMethod: text })
        ?? (new RegExp(`${NUMBER}\\s*${MASS}`, 'i').test(text) ? null : product.unitWeightMg)
      if (typeof unit === 'number' && unit > 0) values.push(unit * quantity * multiplier)
    } else {
      // For sachets/bottles only a mass explicitly attached to the same unit is valid.
      const weights: number[] = []
      for (const m of text.matchAll(new RegExp(`${NUMBER}\\s*${MASS}\\s*/\\s*(\\d+)\\s*${item}`, 'gi'))) {
        weights.push(mass(m[1], m[2]) / Number(m[3]))
      }
      for (const m of text.matchAll(new RegExp(`(\\d+)\\s*${item}\\s*(?:당\\s*|[([]\\s*)${NUMBER}\\s*${MASS}\\s*[)\\]]?`, 'gi'))) {
        const tail = text.slice((m.index ?? 0) + m[0].length)
        if (/^\s*\//.test(tail)) continue
        if (/^\s*[x×*+]|^\s*[,，]\s*\d/.test(tail)) return null
        weights.push(mass(m[2], m[3]) / Number(m[1]))
      }
      const unit = agree(weights)
      if (unit !== null) values.push(unit * quantity * multiplier)
    }
  }
  if (times !== null) {
    for (const m of text.matchAll(new RegExp(`1\\s*회\\s*${NUMBER}\\s*${MASS}(?!\\s*[/x×*])`, 'gi'))) values.push(mass(m[1], m[2]) * times)
  }
  return agree(values)
}

const basisKey = (value: string) => mainIngredientKey(value).replace(/^셀렌$/, '셀레늄')
type Range = (typeof references.ranges)[number]
const rangeIndex = new Map<string, Range[]>()
for (const range of references.ranges) {
  const key = basisKey(range.basis)
  rangeIndex.set(key, [...(rangeIndex.get(key) ?? []), range])
}
const recognizedNames = new Set(references.recognizedNames.map(mainIngredientKey))

export function includesRecognizedIngredient(product: Product): boolean {
  return [...product.mainIngredients, ...product.subIngredients].some(name =>
    /[（(]\s*개별인정형?\s*[)）]/.test(name) || recognizedNames.has(mainIngredientKey(name)))
}

/** A declared marker amount needs its own denominator. A different marker's
 * denominator or the legacy weightMg field must never be substituted. */
function indexSpecification(product: Product): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const sourceSegments = product.mainDetail.split(/\r?\n/).flatMap(line => normalize(line).split(/(?=[①-⑳])|(?=\d{1,2}\s*[.)]\s*[가-힣A-Za-z])/))
  for (const line of sourceSegments) {
    const colon = line.search(/[:：]/)
    if (colon < 0) continue
    const name = basisKey(line.slice(0, colon).replace(/^\s*(?:[①-⑳]|\(?\d{1,2}[.)])\s*/, ''))
    index.set(name, [...(index.get(name) ?? []), line.slice(colon + 1)])
  }
  return index
}

export function dailyMarkerValue(product: Product, marker: Marker, dailyMass: number | null, specification = indexSpecification(product)): number | null {
  if (!Number.isFinite(marker.value) || marker.value < 0) return null
  const bodies = specification.get(basisKey(marker.name)) ?? []
  const values: number[] = []
  for (const valuePart of bodies) {
    // Only the complete declared expression: never accidentally read a second ingredient.
    const declaration = new RegExp(`표시량\\s*\\(\\s*${NUMBER}\\s*${MASS}\\s*(?:RAE|DFE|NE)?\\s*/\\s*${NUMBER}\\s*${MASS}\\s*\\)`, 'i').exec(valuePart)
    if (declaration && dailyMass !== null) {
      const denominator = mass(declaration[3], declaration[4])
      const markerFactor = FACTORS[normalize(marker.unit).toLowerCase()]
      const declaredMass = mass(declaration[1], declaration[2])
      if (denominator > 0 && markerFactor && Math.abs(declaredMass - marker.value * markerFactor) < .001) {
        values.push(declaredMass / markerFactor * dailyMass / denominator)
      }
    } else if (/1\s*일\s*(?:섭취량|섭취분)\s*(?:당|기준)|일일\s*섭취량\s*당/.test(valuePart)
      && !new RegExp(`${NUMBER}\\s*(?:${MASS})?\\s*[~∼–-]\\s*${NUMBER}\\s*${MASS}`, 'i').test(valuePart)) {
      values.push(marker.value)
    }
  }
  return values.length && values.every(v => Number.isFinite(v) && v >= 0 && Math.abs(v - values[0]) < .001) ? values[0] : null
}

type Observation = { key: string; name: string; unit: string; value: number; valueMg: number | null; evidence: string; ingredient: string | null }
const productCache = new WeakMap<Product, { unitMass: number | null; recognized: boolean; observations: Observation[] }>()
function productStats(product: Product) {
  const cached = productCache.get(product)
  if (cached) return cached
  const dailyMass = dailyWeightMg(product)
  const specification = dailyMass !== null || /(?:1\s*일|일일)\s*섭취/.test(product.mainDetail) ? indexSpecification(product) : null
  const observations: Observation[] = []
  const seen = new Set<string>()
  for (const marker of specification ? product.markers : []) {
    const daily = dailyMarkerValue(product, marker, dailyMass, specification!)
    if (daily === null) continue
    const key = rdaKey(marker.name)
    const factor = FACTORS[normalize(marker.unit).toLowerCase()]
    const valueMg = factor ? daily * factor : null
    const candidates = rangeIndex.get(basisKey(marker.name)) ?? []
    const unit = factor ? (candidates.length === 1 ? candidates[0].unit : 'mg') : marker.unit
    const groupKey = `${key}|${factor ? 'mass' : unit}`
    if (seen.has(groupKey)) continue
    seen.add(groupKey)
    observations.push({ key: groupKey, name: mainIngredientLabel(marker.name), unit, value: valueMg === null ? daily : valueMg / (FACTORS[unit] ?? 1), valueMg,
      evidence: (specification!.get(basisKey(marker.name)) ?? []).join(' '),
      ingredient: candidates.length === 1 ? candidates[0].ingredient : null })
  }
  const result = { unitMass: standardUnitWeightMg(product), recognized: includesRecognizedIngredient(product), observations }
  productCache.set(product, result)
  return result
}

export function buildDashboardSummary(products: Product[], filters: Pick<FilterState, 'marker' | 'mains'>, profile = DEFAULT_RDA_PROFILE) {
  const weights: number[] = []
  const manufacturers = new Set<string>()
  const groups = new Map<string, Array<Observation & { comparison: ReturnType<typeof compareRda> }>>()
  let recognizedCount = 0, contentProducts = 0, comparableCount = 0, highCount = 0, manufacturerKnownCount = 0
  const rangeChecks = { tablet: { count: 0, outside: 0 }, capsule: { count: 0, outside: 0 } }
  const selectedMainKeys = new Set(filters.mains.map(rdaKey))
  for (const product of products) {
    const stats = productStats(product)
    if (stats.unitMass !== null) {
      weights.push(stats.unitMass)
      const kind = product.form === '정제' ? 'tablet' : product.form.includes('캡슐') ? 'capsule' : null
      if (kind) {
        rangeChecks[kind].count++
        const [min, max] = kind === 'tablet' ? [200, 1200] : [300, 800]
        if (stats.unitMass < min || stats.unitMass > max) rangeChecks[kind].outside++
      }
    }
    if (stats.recognized) recognizedCount++
    const manufacturer = normalize(product.manufacturer)
    if (manufacturer && !/^(미상|미입력|알수없음|알 수 없음|없음|unknown|n\/a|-)$/i.test(manufacturer)) {
      manufacturers.add(manufacturer.replace(/\s+/g, ''))
      manufacturerKnownCount++
    }
    const observations = stats.observations.filter(o => filters.marker
      ? rdaKey(o.name) === rdaKey(filters.marker.name)
      : !selectedMainKeys.size || selectedMainKeys.has(rdaKey(o.name)) || (o.ingredient !== null && selectedMainKeys.has(rdaKey(o.ingredient))))
    if (observations.length) contentProducts++
    let comparable = false, high = false
    for (const observation of observations) {
      const comparison = compareRda(observation.name, observation.valueMg, observation.evidence, profile)
      const group = groups.get(observation.key) ?? []
      group.push({ ...observation, comparison })
      groups.set(observation.key, group)
      if (comparison.ratio !== null) {
        comparable = true
        if (comparison.ratio >= 1 - 1e-10) high = true
      }
    }
    if (comparable) comparableCount++
    if (high) highCount++
  }
  const rows = [...groups.entries()].map(([key, observations]) => {
    const eligible = observations.filter(o => o.comparison.ratio !== null)
    return { key, name: observations[0].name, unit: observations[0].unit, count: observations.length,
      median: median(observations.map(o => o.value))!, rda: observations[0].comparison.amount,
      rdaUnit: observations[0].comparison.unit, comparableCount: eligible.length,
      highShare: eligible.length ? eligible.filter(o => o.comparison.ratio! >= 1 - 1e-10).length / eligible.length : null }
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  return {
    unitWeight: { median: median(weights), count: weights.length, rangeChecks },
    recognizedCount, recognizedShare: products.length ? recognizedCount / products.length : null,
    manufacturerCount: manufacturers.size, manufacturerKnownCount,
    content: { rows, productCount: contentProducts, comparableCount, highCount, highShare: comparableCount ? highCount / comparableCount : null },
  }
}

export type DashboardSummary = ReturnType<typeof buildDashboardSummary>
export const DASHBOARD_REFERENCE = { sourceUrl: references.sourceUrl, reviewedOn: references.reviewedOn }
