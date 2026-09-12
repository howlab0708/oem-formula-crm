import { PRODUCT_INGREDIENT_EVIDENCE } from '../data/productIngredientEvidence'
import type { Product } from './types'

/** A snapshot of a reference product's published sourcing claim, never a purchasing specification. */
export type IngredientProvenance = {
  ingredientName: string
  productName: string
  reportNo: string
  supplier: string
  country: string
  region: string
  evidenceId: string
  sourceTitle: string
  sourceUrl: string
  statement: string
  checkedAt: string
  /** Limits a claim to a component of a premix when the whole mixture is not documented. */
  scope?: string
  productionDate?: string
  traceabilityNo?: string
  referenceVariant?: string
  additionalSources?: { sourceTitle: string; sourceUrl: string; statement: string; checkedAt: string }[]
}

export type ProductIngredientEvidence = {
  id: string
  productName: string
  reportNo: string
  manufacturer: string
  /** Exact ingredient names. No brand-wide, nutrient-family or fuzzy matching. */
  ingredients: string[]
  supplier: string
  country: string
  region: string
  sourceTitle: string
  sourceUrl: string
  statement: string
  checkedAt: string
  scope?: string
}

export const provenanceKey = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const ingredientKey = (value: string) => provenanceKey(value).replace(/\(고시형\)/g, '')

export function originLabel(source?: IngredientProvenance): string {
  return source?.country || (source?.region ? `${source.region} (국가 미확인)` : '미확인')
}

export function hasProvenance(source?: IngredientProvenance): boolean {
  return Boolean(source?.sourceUrl && (source.supplier || source.country || source.region))
}

export function provenanceForIngredient(product: Product, ingredientName: string): IngredientProvenance {
  const match = PRODUCT_INGREDIENT_EVIDENCE.find((entry) =>
    Boolean(product.reportNo) && entry.reportNo === product.reportNo &&
    provenanceKey(entry.productName) === provenanceKey(product.name) &&
    provenanceKey(entry.manufacturer) === provenanceKey(product.manufacturer) &&
    entry.ingredients.some((name) => ingredientKey(name) === ingredientKey(ingredientName)),
  )
  const source: IngredientProvenance = {
    ingredientName, productName: product.name, reportNo: product.reportNo || '',
    supplier: match?.supplier || '', country: match?.country || '', region: match?.region || '',
    evidenceId: match?.id || '', sourceTitle: match?.sourceTitle || '', sourceUrl: match?.sourceUrl || '',
    statement: match?.statement || '', checkedAt: match?.checkedAt || '',
    scope: match?.scope || '',
  }
  const trace = product.traceability
  if (trace?.status === 'matched' && trace.lot) {
    const lot = trace.lot
    const matching = lot.ingredients.filter(row => ingredientKey(row.name) === ingredientKey(ingredientName))
    const countries = [...new Set(matching.map(row => row.country).filter(Boolean))]
    if (countries.length) {
      const additionalSources = hasProvenance(source) ? [{ sourceTitle: source.sourceTitle, sourceUrl: source.sourceUrl, statement: source.statement, checkedAt: source.checkedAt }] : []
      const country = countries.join(' · ') + (matching.some(row => !row.country) ? ' · 일부 미기재' : '')
      return { ...source, country, region: '', evidenceId: `tfood-${lot.traceabilityNo}${match ? `-${match.id}` : ''}`,
        sourceTitle: '식품이력관리시스템 · 원재료 정보', sourceUrl: lot.sourceUrl, checkedAt: trace.checkedAt,
        statement: `${lot.productName} / ${lot.manufacturer} / ${lot.productionDate} 생산분 / 식품이력번호 ${lot.traceabilityNo}. 제품명·제조원·원료 구성을 대조한 공개 등록 정보입니다. 다른 생산분의 원산지는 달라질 수 있습니다.${match?.country && match.country !== country ? ` 공식 제품 설명(${match.country})과 원산지 표기가 달라 두 근거를 함께 확인해야 합니다.` : ''}`,
        scope: `${match?.supplier ? `원료사: 공식 제품 설명${match.scope ? ` (${match.scope})` : ''} / ` : ''}원산지: 해당 생산분 기준`,
        productionDate: lot.productionDate, traceabilityNo: lot.traceabilityNo, referenceVariant: lot.productName,
        additionalSources,
      }
    }
  }
  return source
}

export function productProvenance(product: Product): IngredientProvenance[] {
  const seen = new Set<string>()
  return [...product.mainIngredients, ...product.subIngredients].filter((name) => {
    const key = provenanceKey(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).map((name) => provenanceForIngredient(product, name))
}

/** Editing the ingredient name invalidates the copied claim, including direct paste and old saved sheets. */
export function currentProvenance(name: string, source?: IngredientProvenance): IngredientProvenance | undefined {
  return source && provenanceKey(name) === provenanceKey(source.ingredientName) ? source : undefined
}

/** Do not let tabs/newlines in original names change the exported table structure. */
const cell = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim()

export function provenanceToText(rows: { name: string; ratio?: string; provenance?: IngredientProvenance }[], productName: string): string {
  const lines = [
    `[${cell(productName || '배합표')} · 원료 정보]`,
    '원료사·원산지는 참고 제품의 공개 자료 기준입니다. 새 견적의 실제 사용 원료는 별도 확인이 필요합니다.',
    '미확인은 현재 연결된 자료에서 확인하지 못한 정보입니다. 비공개 또는 비중국산을 뜻하지 않습니다.',
    ['원료명', '배합비율(%)', '원료사(참고)', '원산지(참고)', '확인 범위', '참고 제품', '확인 상태', '확인일', '근거', '생산일', '식품이력번호'].join('\t'),
  ]
  for (const row of rows.filter((item) => item.name.trim())) {
    const source = currentProvenance(row.name, row.provenance)
    lines.push([
      row.name, row.ratio || '미확인', source?.supplier || '미확인', originLabel(source),
      source?.scope || (hasProvenance(source) ? '해당 원료' : '미확인'),
      source?.productName || '미확인', hasProvenance(source) ? '공식 자료 기준' : '미확인',
      source?.checkedAt || '미확인', source?.sourceUrl || '미확인',
      source?.productionDate || '미확인', source?.traceabilityNo || '미확인',
    ].map(cell).join('\t'))
  }
  const sources = new Map(rows.map((row) => currentProvenance(row.name, row.provenance))
    .filter((source): source is IngredientProvenance => hasProvenance(source))
    .map((source) => [source.evidenceId, source]))
  for (const source of sources.values()) {
    lines.push(`근거: ${cell(source.sourceTitle)} / ${cell(source.statement)} / 확인일 ${source.checkedAt} / ${source.sourceUrl}`)
    for (const extra of source.additionalSources || []) lines.push(`추가 근거: ${cell(extra.sourceTitle)} / ${cell(extra.statement)} / 확인일 ${extra.checkedAt} / ${extra.sourceUrl}`)
  }
  return lines.join('\n')
}
