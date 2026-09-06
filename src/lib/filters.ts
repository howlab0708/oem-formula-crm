/**
 * 다중 필터 상태와 적용 로직.
 *
 * 필터는 화면 하나를 통째로 좁히는 단일 조건이다. 차트마다 다른 조건을 두지 않고
 * 여기서 만든 결과 하나를 대시보드/그리드/슬라이드오버가 공유한다.
 */

import type { FormType, Product } from './types'
import { isPillForm } from './unitWeight'
import { compactSearchText, mainIngredientKey, mainIngredientLabel } from './ingredientNames'

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

    return true
  })
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
