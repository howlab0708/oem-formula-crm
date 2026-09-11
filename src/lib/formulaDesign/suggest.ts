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
import { aliasCandidates, nameKey, sourceFormOf } from './ingredientAliases'
import type { IngredientPrice } from './types'

export { nameKey }

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

function ingredientIntake(ingredient: FunctionalIngredient): { amount: string; basis: string } {
  for (const standard of ingredient.standards) {
    for (const intake of standard.intakes) {
      if (intake.amount) return { amount: intake.amount, basis: intake.basis || ingredient.name }
    }
  }
  return { amount: '', basis: ingredient.name }
}

/** 현행 기능성 원료 DB 후보. 모듈 로드 때 한 번만 만든다. */
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

/**
 * 공전 이름이 품고 있는 동의어를 열쇠로 함께 등록한다.
 *   `셀레늄(셀렌)`               → 셀레늄, 셀렌
 *   `EPA 및 DHA 함유 유지(오메가3)` → epa및dha함유유지, 오메가3
 *   `구아검/구아검가수분해물`      → 구아검, 구아검가수분해물
 * 이름을 손으로 적지 않고 카탈로그에서 뽑으므로, 공전 자료가 갱신되면 함께 따라온다.
 */
function catalogAliasKeys(name: string): string[] {
  const text = name.normalize('NFKC')
  const inner = [...text.matchAll(/\(([^)]*)\)/g)].map((match) => match[1])
  const outer = text.replace(/\([^)]*\)/g, ' ')
  const keys = [nameKey(text)]
  for (const part of [outer, ...inner]) {
    for (const piece of part.split(/[/,]/)) {
      const key = nameKey(piece)
      if (key && !keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

export type SuggestionIndex = {
  all: Suggestion[]
  byKey: Map<string, Suggestion>
  /** 동의어·원료 형태까지 포함한 연결 색인. 이름으로 공전 원료를 찾을 때 쓴다. */
  aliases: Map<string, Suggestion>
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
  const aliases = new Map<string, Suggestion>()
  catalogSuggestions.forEach((item, position) => {
    const entry = { ...item }
    byKey.set(item.key, entry)
    // 공전 이름이 품은 동의어를 연결 색인에 넣는다. 먼저 등록된 쪽을 남긴다.
    for (const key of catalogAliasKeys(functionalIngredients[position].name)) {
      if (!aliases.has(key)) aliases.set(key, entry)
    }
  })

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

  return { all: [...byKey.values()], byKey, aliases }
}

/**
 * 이름으로 공전 원료를 찾는다. 직접 입력·붙여넣기로 채운 이름에 기준 정보를 얹을 때 쓴다.
 *
 * 표기가 정확히 같지 않아도 연결한다 - 꼬리표(`엽산(고시형)`), 공전 이름의 동의어
 * (`셀렌` → `셀레늄(셀렌)`), 제제 표기(`비타민c혼합제제`), 원료 형태(`산화아연` → `아연`,
 * `비타민B1염산염` → `비타민 B1`)까지 본다. 자세한 근거는 `ingredientAliases.ts` 참고.
 */
export function exactSuggestion(index: SuggestionIndex, name: string): Suggestion | null {
  for (const key of aliasCandidates(name)) {
    const found = index.byKey.get(key) ?? index.aliases.get(key)
    // 이름만 같은 레퍼런스·단가 항목은 기준 정보를 갖고 있지 않으므로 계속 찾는다.
    if (found?.source === 'ingredient') return found
  }
  // 공전 원료로 연결되지 않으면 이름이 같은 단가·레퍼런스 항목이라도 돌려준다.
  return index.byKey.get(nameKey(name)) ?? null
}

/** 이 이름이 어떤 원료 형태로 연결됐는지. 화면에 근거를 보여줄 때 쓴다. */
export function linkReason(name: string): string | null {
  const source = sourceFormOf(name)
  return source ? `${source} 공급 원료로 연결` : null
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
  const result = scored.slice(0, limit).map((entry) => entry.item)

  /*
   * 이름만으로는 글자가 겹치지 않는 연결을 맨 앞에 얹는다.
   * `산화아연` 을 치면 글자가 겹치는 후보가 없어 목록이 비지만, 원료 형태 표를 보면
   * 아연이다. 이걸 안 올려 주면 연구원은 아연을 손으로 다시 찾아야 한다.
   *
   * 이때 넣는 이름은 연구원이 친 이름 그대로다. 원료명은 발주·투입에 쓰는 이름이라
   * 공전 이름으로 바꿔 버리면 배합표가 틀어진다 - 산화아연을 넣고 아연이라고 적을 수는 없다.
   * 공전 이름은 기준 성분(basis) 으로만 들어간다.
   */
  const typed = query.trim()
  const linked = exactSuggestion(index, query)
  if (linked?.source === 'ingredient' && !result.some((item) => item.key === linked.key)) {
    const reason = linkReason(query) ?? `${linked.name} 기준으로 연결`
    return [{ ...linked, name: typed, hint: `${reason} · ${linked.hint}` }, ...result].slice(0, limit)
  }
  return result
}
