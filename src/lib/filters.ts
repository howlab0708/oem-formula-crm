/**
 * 다중 필터 상태와 적용 로직.
 *
 * 필터는 화면 하나를 통째로 좁히는 단일 조건이다. 차트마다 다른 조건을 두지 않고
 * 여기서 만든 결과 하나를 대시보드/그리드/슬라이드오버가 공유한다.
 */

import type { FormType, Product } from './types'
import { isPillForm } from './unitWeight'
import { compactSearchText, mainIngredientKey, mainIngredientLabel } from './ingredientNames'
import {
  ORIGIN_LABELS,
  originOfForm,
  productSources,
  type SourceOrigin,
} from './ingredientSource'

export type MarkerFilter = {
  name: string
  unit: string
  min: number | null
  max: number | null
}

export type FilterState = {
  /** 제품명·브랜드명·제조원 자유 검색 */
  query: string
  mains: string[]
  /** 선택한 주원료를 모두 포함(all) / 하나라도 포함(any) */
  mainMode: 'all' | 'any'
  forms: FormType[]
  manufacturers: string[]
  subInclude: string[]
  subExclude: string[]
  weightMin: number | null
  weightMax: number | null
  marker: MarkerFilter | null
  /** 원료 형태를 볼 영양성분. 고르면 아래 두 조건이 이 성분에만 적용된다. */
  sourceNutrient: string | null
  /** 그 영양성분의 원료 형태 - 하나라도 포함 */
  sourceForms: string[]
  /** 그 영양성분의 원료 형태 - 하나라도 있으면 제외 */
  sourceFormExclude: string[]
  /** 원료 기원(효모·천연물·화학합성). 영양성분을 고르면 그 성분의 기원만 본다. */
  sourceOrigins: SourceOrigin[]
}

export const EMPTY_FILTERS: FilterState = {
  query: '',
  mains: [],
  mainMode: 'all',
  forms: [],
  manufacturers: [],
  subInclude: [],
  subExclude: [],
  weightMin: null,
  weightMax: null,
  marker: null,
  sourceNutrient: null,
  sourceForms: [],
  sourceFormExclude: [],
  sourceOrigins: [],
}

function lower(values: string[]): Set<string> {
  return new Set(values.map((v) => v.trim().toLowerCase()))
}

export function applyFilters(products: Product[], filters: FilterState): Product[] {
  const query = filters.query.trim().toLowerCase()
  const compactQuery = compactSearchText(filters.query)
  const mains = new Set(filters.mains.map(mainIngredientKey))
  const manufacturers = lower(filters.manufacturers)
  const subInclude = lower(filters.subInclude)
  const subExclude = lower(filters.subExclude)
  const forms = new Set(filters.forms)

  return products.filter((product) => {
    if (query) {
      const names = [product.name, product.brand ?? '', product.manufacturer]
      const nameMatch = names.some((name) => compactSearchText(name).includes(compactQuery))
      // 기존 지표성분 원문 검색도 유지한다.
      if (!nameMatch && !`${product.name} ${product.manufacturer} ${product.mainDetail}`.toLowerCase().includes(query)) return false
    }

    if (forms.size > 0 && !forms.has(product.form)) return false

    if (manufacturers.size > 0 && !manufacturers.has(product.manufacturer.trim().toLowerCase())) {
      return false
    }

    if (mains.size > 0) {
      const productMains = new Set(product.mainIngredients.map(mainIngredientKey))
      const matched = [...mains].filter((m) => productMains.has(m))
      if (filters.mainMode === 'all' ? matched.length !== mains.size : matched.length === 0) {
        return false
      }
    }

    if (subInclude.size > 0 || subExclude.size > 0) {
      const productSubs = lower(product.subIngredients)
      for (const wanted of subInclude) {
        if (!productSubs.has(wanted)) return false
      }
      for (const banned of subExclude) {
        if (productSubs.has(banned)) return false
      }
    }

    if (filters.weightMin !== null || filters.weightMax !== null) {
      const weight = product.unitWeightMg
      if (!isPillForm(product.form) || typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return false
      if (filters.weightMin !== null && weight < filters.weightMin) return false
      if (filters.weightMax !== null && weight > filters.weightMax) return false
    }

    if (filters.marker) {
      const { name, unit, min, max } = filters.marker
      const marker = product.markers.find((m) => m.name === name && (!unit || m.unit === unit))
      if (!marker) return false
      if (min !== null && marker.value < min) return false
      if (max !== null && marker.value > max) return false
    }

    if (!matchesSource(product, filters)) return false

    return true
  })
}

/**
 * 원료 형태 조건.
 *
 * 영양성분을 고르면 그 성분을 공급한 원료만 본다 - '아연 + 효모 유래' 는
 * "아연을 건조효모로 넣은 제품" 이지, "아연이 있고 어딘가에 효모도 들어간 제품"
 * 이 아니다. 영양성분을 고르지 않았을 때만 제품 전체의 원료를 훑는다.
 */
function matchesSource(product: Product, filters: FilterState): boolean {
  const { sourceNutrient, sourceForms, sourceFormExclude, sourceOrigins } = filters
  if (!sourceNutrient && sourceForms.length === 0 && sourceFormExclude.length === 0 && sourceOrigins.length === 0) {
    return true
  }

  const sources = productSources(product)

  if (sourceNutrient) {
    const forms = sources.forms.get(sourceNutrient)
    if (!forms) return false
    if (sourceForms.length > 0 && !sourceForms.some((form) => forms.has(form))) return false
    if (sourceFormExclude.some((form) => forms.has(form))) return false
    if (sourceOrigins.length > 0) {
      const matched = [...forms].some((form) => sourceOrigins.includes(originOfForm(form)))
      if (!matched) return false
    }
    return true
  }

  const allForms = [...sources.forms.values()]
  if (sourceForms.length > 0 && !allForms.some((forms) => sourceForms.some((form) => forms.has(form)))) return false
  if (sourceFormExclude.length > 0 && allForms.some((forms) => sourceFormExclude.some((form) => forms.has(form)))) {
    return false
  }
  if (sourceOrigins.length > 0 && !sourceOrigins.some((origin) => sources.origins.has(origin))) return false

  return true
}

export function activeFilterCount(filters: FilterState): number {
  let count = 0
  if (filters.query.trim()) count += 1
  count += filters.mains.length
  count += filters.forms.length
  count += filters.manufacturers.length
  count += filters.subInclude.length
  count += filters.subExclude.length
  if (filters.weightMin !== null || filters.weightMax !== null) count += 1
  if (filters.marker) count += 1
  // 영양성분 자체는 형태·기원을 고르기 위한 문맥이라, 조건이 붙었을 때만 센다.
  if (filters.sourceNutrient && (filters.sourceForms.length > 0 || filters.sourceOrigins.length > 0)) count += 1
  else count += filters.sourceForms.length + filters.sourceOrigins.length
  count += filters.sourceFormExclude.length
  return count
}

export type FilterChip = {
  key: string
  group: string
  label: string
  /** 이 칩만 제거한 상태 */
  remove: (filters: FilterState) => FilterState
}

/** 현재 조건을 칩 목록으로 펼친다. 상단 요약 바와 이미지/PDF 내보내기가 함께 쓴다. */
export function filterChips(filters: FilterState): FilterChip[] {
  const chips: FilterChip[] = []

  if (filters.query.trim()) {
    chips.push({
      key: 'query',
      group: '검색어',
      label: filters.query.trim(),
      remove: (f) => ({ ...f, query: '' }),
    })
  }

  for (const main of filters.mains) {
    chips.push({
      key: `main:${main}`,
      group: '주원료',
      label: main,
      remove: (f) => ({ ...f, mains: f.mains.filter((m) => m !== main) }),
    })
  }

  for (const form of filters.forms) {
    chips.push({
      key: `form:${form}`,
      group: '제형',
      label: form,
      remove: (f) => ({ ...f, forms: f.forms.filter((v) => v !== form) }),
    })
  }

  for (const maker of filters.manufacturers) {
    chips.push({
      key: `maker:${maker}`,
      group: '제조원',
      label: maker,
      remove: (f) => ({ ...f, manufacturers: f.manufacturers.filter((v) => v !== maker) }),
    })
  }

  for (const sub of filters.subInclude) {
    chips.push({
      key: `sub+:${sub}`,
      group: '부원료',
      label: sub,
      remove: (f) => ({ ...f, subInclude: f.subInclude.filter((v) => v !== sub) }),
    })
  }

  for (const sub of filters.subExclude) {
    chips.push({
      key: `sub-:${sub}`,
      group: '부원료 제외',
      label: sub,
      remove: (f) => ({ ...f, subExclude: f.subExclude.filter((v) => v !== sub) }),
    })
  }

  if (filters.weightMin !== null || filters.weightMax !== null) {
    chips.push({
      key: 'weight',
      group: '규격',
      label: rangeLabel(filters.weightMin, filters.weightMax, 'mg'),
      remove: (f) => ({ ...f, weightMin: null, weightMax: null }),
    })
  }

  if (filters.marker) {
    const { name, unit, min, max } = filters.marker
    chips.push({
      key: 'marker',
      group: '지표성분',
      label: `${name} ${rangeLabel(min, max, unit)}`,
      remove: (f) => ({ ...f, marker: null }),
    })
  }

  // 형태·기원 칩은 어느 영양성분 얘기인지 함께 적는다. '혼합제제' 만 떠 있으면
  // 무엇의 혼합제제인지 알 수 없어 내보낸 브리핑에서 조건을 되읽을 수 없다.
  const scope = filters.sourceNutrient ? `${filters.sourceNutrient} ` : ''

  for (const form of filters.sourceForms) {
    chips.push({
      key: `sourceForm:${form}`,
      group: '원료 형태',
      label: `${scope}${form}`,
      remove: (f) => ({ ...f, sourceForms: f.sourceForms.filter((v) => v !== form) }),
    })
  }

  for (const form of filters.sourceFormExclude) {
    chips.push({
      key: `sourceForm-:${form}`,
      group: '원료 형태 제외',
      label: `${scope}${form}`,
      remove: (f) => ({ ...f, sourceFormExclude: f.sourceFormExclude.filter((v) => v !== form) }),
    })
  }

  for (const origin of filters.sourceOrigins) {
    chips.push({
      key: `sourceOrigin:${origin}`,
      group: '원료 기원',
      label: `${scope}${ORIGIN_LABELS[origin]}`,
      remove: (f) => ({ ...f, sourceOrigins: f.sourceOrigins.filter((v) => v !== origin) }),
    })
  }

  return chips
}

export function rangeLabel(min: number | null, max: number | null, unit: string): string {
  const format = (n: number) => n.toLocaleString('ko-KR')
  if (min !== null && max !== null) return `${format(min)}~${format(max)}${unit}`
  if (min !== null) return `${format(min)}${unit} 이상`
  if (max !== null) return `${format(max)}${unit} 이하`
  return '전체'
}

export type Option = {
  value: string
  count: number
  /** 통합 전 표기로 검색해도 대표 항목을 찾을 수 있도록 한다. */
  searchAliases?: string[]
}

function optionsFrom(
  products: Product[],
  pick: (product: Product) => Iterable<string>,
  limit?: number,
): Option[] {
  const counts = new Map<string, number>()
  for (const product of products) {
    const seen = new Set<string>()
    for (const raw of pick(product)) {
      const value = raw.trim()
      if (!value || seen.has(value)) continue
      seen.add(value)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  const options = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'))
  return limit ? options.slice(0, limit) : options
}

export function mainIngredientOptions(products: Product[]): Option[] {
  const groups = new Map<string, { value: string; count: number; aliases: Set<string> }>()
  for (const product of products) {
    const seen = new Set<string>()
    for (const raw of product.mainIngredients) {
      const key = mainIngredientKey(raw)
      if (!key) continue
      const group = groups.get(key) ?? { value: mainIngredientLabel(raw), count: 0, aliases: new Set<string>() }
      group.aliases.add(raw)
      if (!seen.has(key)) group.count += 1
      seen.add(key)
      groups.set(key, group)
    }
  }
  return [...groups.values()]
    .map(({ value, count, aliases }) => ({ value, count, searchAliases: [...aliases] }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'))
}

export function manufacturerOptions(products: Product[]): Option[] {
  return optionsFrom(products, (p) => [p.manufacturer])
}

export function subIngredientOptions(products: Product[]): Option[] {
  return optionsFrom(products, (p) => p.subIngredients, 400)
}

export function formOptions(products: Product[]): Option[] {
  return optionsFrom(products, (p) => [p.form])
}
