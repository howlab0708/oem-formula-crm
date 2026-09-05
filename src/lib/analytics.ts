/**
 * 브리핑 대시보드가 쓰는 집계 함수 모음.
 *
 * 전부 순수 함수이고 필터링된 Product[] 하나만 입력으로 받는다.
 * (필터 한 줄이 화면 전체를 지배해야 하므로, 차트마다 다른 모집단을 쓰지 않는다.)
 */

import { isExcipient } from './dictionary'
import type { FormType, Product } from './types'
import { isPillForm } from './unitWeight'

export type CountItem = {
  label: string
  count: number
  share: number
}

function toCountItems(counts: Map<string, number>, total: number, limit?: number): CountItem[] {
  const items = [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))
  return limit ? items.slice(0, limit) : items
}

/**
 * 시장 다빈도 제형 비율.
 * 제형은 최대 9종이고 단일 계열 막대로 그리므로 꼬리를 접지 않는다
 * (색 클래스가 아니라 행이 늘어날 뿐이고, 접으면 클릭해서 필터를 걸 수 없다).
 */
export function formDistribution(products: Product[]): CountItem[] {
  const counts = new Map<FormType, number>()
  for (const product of products) {
    counts.set(product.form, (counts.get(product.form) ?? 0) + 1)
  }
  return toCountItems(counts as Map<string, number>, products.length)
}

export type SubCountStats = {
  average: number
  median: number
  max: number
  /** 부원료 개수별 제품 수. 10개 초과는 '10+' 한 칸으로 접는다. */
  histogram: Array<{ label: string; bucket: number; count: number }>
  sampleSize: number
}

/** 평균 부원료 투입 개수. 부형제는 제외해야 '배합 설계 난이도'가 드러난다. */
export function subIngredientCountStats(products: Product[]): SubCountStats {
  const values: number[] = []
  for (const product of products) {
    values.push(product.subIngredients.filter((s) => !isExcipient(s)).length)
  }

  if (values.length === 0) {
    return { average: 0, median: 0, max: 0, histogram: [], sampleSize: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((acc, v) => acc + v, 0)
  const cap = 10
  const buckets = new Map<number, number>()
  for (const value of values) {
    const bucket = Math.min(value, cap)
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }

  const maxBucket = Math.max(...buckets.keys())
  const histogram: SubCountStats['histogram'] = []
  for (let i = 0; i <= maxBucket; i += 1) {
    histogram.push({
      label: i === cap ? `${cap}+` : String(i),
      bucket: i,
      count: buckets.get(i) ?? 0,
    })
  }

  return {
    average: sum / values.length,
    median: percentile(sorted, 0.5),
    max: sorted[sorted.length - 1],
    histogram,
    sampleSize: values.length,
  }
}

/** 다빈도 단일 부원료. */
export function topSubIngredients(products: Product[], limit = 8): CountItem[] {
  const counts = new Map<string, number>()
  for (const product of products) {
    const seen = new Set<string>()
    for (const sub of product.subIngredients) {
      if (isExcipient(sub)) continue
      const key = sub.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return toCountItems(counts, products.length, limit)
}

const PER_PRODUCT_CAP = 10
/** 쌍 키를 하나의 정수로 접기 위한 자릿수. 고유 부원료가 이 수를 넘지 않는다고 본다. */
const PAIR_BASE = 1_000_000

/**
 * 인기 부원료 '조합'(동시 등장 쌍). 상담에서 실제로 팔리는 단위는 단일 성분이 아니라 조합이다.
 *
 * 4만 건 데이터에서 쌍은 200만 개까지 나온다. 이름을 정수로 바꿔 세고 상위 N 만
 * 남기는 이유는, 문자열 키와 전체 정렬로는 필터를 만질 때마다 화면이 멈추기 때문이다.
 */
export function topSubCombos(products: Product[], limit = 6): CountItem[] {
  const ids = new Map<string, number>()
  const names: string[] = []
  const counts = new Map<number, number>()
  const buffer: number[] = []

  for (const product of products) {
    buffer.length = 0
    for (const raw of product.subIngredients) {
      const name = raw.trim()
      if (!name || isExcipient(name)) continue
      let id = ids.get(name)
      if (id === undefined) {
        id = names.length
        ids.set(name, id)
        names.push(name)
      }
      if (!buffer.includes(id)) buffer.push(id)
      if (buffer.length >= PER_PRODUCT_CAP) break
    }

    if (buffer.length < 2) continue
    buffer.sort((a, b) => a - b)
    for (let i = 0; i < buffer.length; i += 1) {
      for (let j = i + 1; j < buffer.length; j += 1) {
        const key = buffer[i] * PAIR_BASE + buffer[j]
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  // 전체를 정렬하지 않고 상위 limit 개만 훑어 담는다(오름차순 유지, 맨 앞이 최소).
  const top: Array<{ key: number; count: number }> = []
  for (const [key, count] of counts) {
    if (count < 2) continue
    if (top.length < limit) {
      top.push({ key, count })
      top.sort((a, b) => a.count - b.count)
    } else if (count > top[0].count) {
      top[0] = { key, count }
      top.sort((a, b) => a.count - b.count)
    }
  }

  const total = products.length
  return top
    .sort((a, b) => b.count - a.count)
    .map(({ key, count }) => ({
      label: `${names[Math.floor(key / PAIR_BASE)]} + ${names[key % PAIR_BASE]}`,
      count,
      share: total > 0 ? count / total : 0,
    }))
}

export type MarkerSummary = {
  name: string
  unit: string
  sampleSize: number
  median: number
  p25: number
  p75: number
  min: number
  max: number
  /** 함량 구간별 제품 수. */
  histogram: Array<{ label: string; from: number; to: number; count: number }>
}

/** 필터 결과에서 가장 많이 등장한 지표성분 순서. 함량 범위 필터의 선택지가 된다. */
export function markerCatalog(products: Product[], limit = 40): Array<{ name: string; unit: string; count: number }> {
  const counts = new Map<string, { name: string; unit: string; count: number }>()
  for (const product of products) {
    for (const marker of product.markers) {
      const key = `${marker.name}|${marker.unit}`
      const entry = counts.get(key)
      if (entry) entry.count += 1
      else counts.set(key, { name: marker.name, unit: marker.unit, count: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

/** 특정 지표성분의 시장 함량 분포. "실리마린 130mg 이 표준인가" 에 답하는 차트. */
export function markerSummary(
  products: Product[],
  markerName: string,
  unit?: string,
): MarkerSummary | null {
  const values: number[] = []
  let resolvedUnit = unit ?? ''

  for (const product of products) {
    for (const marker of product.markers) {
      if (marker.name !== markerName) continue
      if (unit && marker.unit !== unit) continue
      values.push(marker.value)
      if (!resolvedUnit) resolvedUnit = marker.unit
    }
  }

  if (values.length < 2) return null

  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const binCount = Math.min(8, Math.max(3, Math.round(Math.sqrt(sorted.length))))
  const span = max - min
  const step = span > 0 ? niceStep(span / binCount) : 1
  const start = Math.floor(min / step) * step
  const bins: MarkerSummary['histogram'] = []

  for (let edge = start; edge < max + step * 0.5; edge += step) {
    const from = round(edge)
    const to = round(edge + step)
    bins.push({ label: formatRange(from, to), from, to, count: 0 })
    if (bins.length > 24) break
  }

  for (const value of sorted) {
    const position = Math.min(bins.length - 1, Math.floor((value - start) / step))
    if (bins[position]) bins[position].count += 1
  }

  return {
    name: markerName,
    unit: resolvedUnit,
    sampleSize: sorted.length,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    min,
    max,
    histogram: bins,
  }
}

/** 제조원 점유. 어느 CMO 가 이 카테고리를 실제로 돌리고 있는지 보여준다. */
export function topManufacturers(products: Product[], limit = 6): CountItem[] {
  const counts = new Map<string, number>()
  for (const product of products) {
    const key = product.manufacturer || '미상'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return toCountItems(counts, products.length, limit)
}

/** 알 단위 제품에서 근거가 확인된 1알 중량만 집계한다. */
export function weightSummary(products: Product[]): { median: number; sampleSize: number } | null {
  const values = products
    .filter((product) => isPillForm(product.form))
    .map((product) => product.unitWeightMg)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  if (values.length === 0) return null
  const sorted = values.sort((a, b) => a - b)
  return { median: percentile(sorted, 0.5), sampleSize: sorted.length }
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const exponent = Math.floor(Math.log10(raw))
  const magnitude = 10 ** exponent
  const normalized = raw / magnitude
  const stepped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return stepped * magnitude
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function formatRange(from: number, to: number): string {
  const format = (n: number) => (Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toFixed(1))
  return `${format(from)}~${format(to)}`
}
