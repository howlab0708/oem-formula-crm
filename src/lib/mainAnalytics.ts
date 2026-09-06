import { mainIngredientKey, uniqueMainIngredients } from './ingredientNames'
import type { CountItem, SubCountStats } from './analytics'
import type { Product } from './types'

export type MainCombo = CountItem & { ingredients: string[] }

/** 검색과 같은 이름 기준으로 한 제품 안의 중복을 제거한다. */
export function mainIngredientSummary(products: Product[]) {
  const names: string[] = []
  const ids = new Map<string, number>()
  const counts = new Map<number, number>()
  const pairs = new Map<string, number>()
  const values: number[] = []
  const buckets = new Map<number, number>()
  for (const product of products) {
    const ingredients = uniqueMainIngredients(product.mainIngredients)
    values.push(ingredients.length)
    const bucket = Math.min(ingredients.length, 10)
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
    const productIds = ingredients.map((name) => {
      const key = mainIngredientKey(name)
      let id = ids.get(key)
      if (id === undefined) { id = names.length; ids.set(key, id); names.push(name) }
      counts.set(id, (counts.get(id) ?? 0) + 1)
      return id
    }).sort((a, b) => a - b)
    for (let i = 0; i < productIds.length; i += 1) {
      for (let j = i + 1; j < productIds.length; j += 1) {
        const key = `${productIds[i]}:${productIds[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  values.sort((a, b) => a - b)
  const total = products.length
  const stats: SubCountStats = {
    average: total ? values.reduce((sum, n) => sum + n, 0) / total : 0,
    median: total ? (values[Math.floor((total - 1) / 2)] + values[Math.ceil((total - 1) / 2)]) / 2 : 0,
    max: values.at(-1) ?? 0,
    sampleSize: total,
    histogram: total ? Array.from({ length: Math.max(...buckets.keys()) + 1 }, (_, bucket) => ({
      label: bucket === 10 ? '10+' : String(bucket), bucket, count: buckets.get(bucket) ?? 0,
    })) : [],
  }
  const byFrequency = (a: CountItem, b: CountItem) => b.count - a.count || a.label.localeCompare(b.label, 'ko')
  const topIngredients: CountItem[] = [...counts].map(([id, count]) => ({
    label: names[id], count, share: count / total,
  })).sort(byFrequency).slice(0, 8)
  const topCombos: MainCombo[] = [...pairs].filter(([, count]) => count >= 2).map(([key, count]) => {
    const ingredients = key.split(':').map((id) => names[Number(id)]).sort((a, b) => a.localeCompare(b, 'ko'))
    return { label: ingredients.join(' + '), ingredients, count, share: count / total }
  }).sort(byFrequency).slice(0, 6)
  return { stats, topIngredients, topCombos }
}
