/**
 * 원료명 자동완성.
 *
 * 세 곳에서 후보를 모은다.
 *   1) 기능성 원료 DB(`functionalIngredients`) - 이름·일일섭취기준·기능성내용을 채운다.
 *   2) 원료단가 기억장(`oem_ingredient_prices`) - 지난 견적에서 쓴 단가를 채운다.
 *   3) 레퍼런스 데이터의 부원료 이름 - 부형제(결정셀룰로오스, 스테아린산마그네슘 등)는
 *      기능성 원료 DB 에 없어서 여기서만 나온다.
 *
 * 검색 표기 정규화는 기능성 원료 조회 화면과 같은 규칙을 쓴다(공백·중점·괄호 무시).
 * 그래서 `비타민c` 로 `비타민 C` 를, `밀크씨슬` 로 `밀크씨슬 추출물` 을 찾는다.
 */

import {
  functionalIngredients,
  ingredientCategoryLabels,
  type FunctionalIngredient,
} from '../functionalIngredients'
import type { IngredientPrice } from './types'

export type SuggestionSource = 'ingredient' | 'price' | 'reference'

export type Suggestion = {
  key: string
  /** 입력란에 넣을 원료명 */
  name: string
  source: SuggestionSource
  /** 오른쪽에 붙는 보조 설명(고시형 · 일일섭취기준 등) */
  hint: string
  ingredientId?: string
  basis?: string
  dailyIntake?: string
  functionality?: string
  unitPrice?: number
  note?: string
  /** 인정 기준이 여러 개면 화면에서 확인을 요구한다. */
  standardCount?: number
}

/** 원료 조회 화면과 같은 정규화. 표기 차이를 무시하고 이름만 남긴다. */
export function nameKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·･ㆍ+()®™Ⓡ_‐‑–—-]/g, '')
}

function ingredientIntake(ingredient: FunctionalIngredient): { amount: string; basis: string } {
  for (const standard of ingredient.standards) {
    for (const intake of standard.intakes) {
      if (intake.amount) return { amount: intake.amount, basis: intake.basis || ingredient.name }
    }
  }
  return { amount: '', basis: ingredient.name }
}

/** 기능성 원료 DB 후보. 모듈 로드 때 한 번만 만든다(621건). */
const catalogSuggestions: Suggestion[] = functionalIngredients.map((ingredient) => {
  const intake = ingredientIntake(ingredient)
  const category = ingredientCategoryLabels[ingredient.category]
  return {
    key: nameKey(ingredient.name),
    name: ingredient.name,
    source: 'ingredient',
    hint: [category, intake.amount].filter(Boolean).join(' · '),
    ingredientId: ingredient.id,
    basis: intake.basis,
    dailyIntake: intake.amount,
    functionality: ingredient.standards[0]?.functionality ?? '',
    standardCount: ingredient.standards.length,
  }
})

const catalogText = new Map(
  catalogSuggestions.map((item, index) => [
    item.key,
    nameKey([functionalIngredients[index].name, item.basis ?? '', item.functionality ?? ''].join(' ')),
  ]),
)

export type SuggestionIndex = {
  all: Suggestion[]
  byKey: Map<string, Suggestion>
}

/**
 * 후보 목록을 합친다. 같은 이름은 기능성 원료 DB 항목을 남기고 단가만 얹는다 -
 * 이름은 공전 표기를 쓰고 단가는 최근에 쓴 값을 쓰는 편이 검토하기 쉽다.
 */
export function buildSuggestionIndex(
  prices: IngredientPrice[],
  referenceNames: string[],
): SuggestionIndex {
  const byKey = new Map<string, Suggestion>()
  for (const item of catalogSuggestions) byKey.set(item.key, { ...item })

  for (const name of referenceNames) {
    const key = nameKey(name)
    if (!key || byKey.has(key)) continue
    byKey.set(key, { key, name, source: 'reference', hint: '레퍼런스 부원료' })
  }

  for (const price of prices) {
    const key = nameKey(price.name)
    if (!key) continue
    const existing = byKey.get(key)
    const priceHint = `${price.unitPrice.toLocaleString('ko-KR')}원/kg`
    if (existing) {
      byKey.set(key, {
        ...existing,
        unitPrice: price.unitPrice,
        note: existing.note || price.note,
        hint: existing.hint ? `${existing.hint} · ${priceHint}` : priceHint,
      })
    } else {
      byKey.set(key, {
        key,
        name: price.name,
        source: 'price',
        hint: `최근 단가 ${priceHint}`,
        unitPrice: price.unitPrice,
        note: price.note,
      })
    }
  }

  return { all: [...byKey.values()], byKey }
}

/** 이름이 정확히 같은(표기 차이 무시) 후보. 붙여넣기로 채운 이름에 정보를 얹을 때 쓴다. */
export function exactSuggestion(index: SuggestionIndex, name: string): Suggestion | null {
  return index.byKey.get(nameKey(name)) ?? null
}

/** 이름이 짧을수록·앞에서 일치할수록·기능성 원료일수록 위로 올린다. */
function score(item: Suggestion, query: string): number {
  const key = item.key
  if (key === query) return 0
  if (key.startsWith(query)) return 1
  if (key.includes(query)) return 2
  const text = item.source === 'ingredient' ? catalogText.get(key) ?? '' : ''
  if (text.includes(query)) return 3
  return Number.POSITIVE_INFINITY
}

const SOURCE_ORDER: Record<SuggestionSource, number> = { ingredient: 0, price: 1, reference: 2 }

export function suggestIngredients(
  index: SuggestionIndex,
  query: string,
  limit = 8,
): Suggestion[] {
  const compact = nameKey(query)
  if (!compact) return []
  const scored: { item: Suggestion; rank: number }[] = []
  for (const item of index.all) {
    const rank = score(item, compact)
    if (rank === Number.POSITIVE_INFINITY) continue
    scored.push({ item, rank })
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      SOURCE_ORDER[a.item.source] - SOURCE_ORDER[b.item.source] ||
      a.item.name.length - b.item.name.length ||
      a.item.name.localeCompare(b.item.name, 'ko-KR'),
  )
  return scored.slice(0, limit).map((entry) => entry.item)
}
