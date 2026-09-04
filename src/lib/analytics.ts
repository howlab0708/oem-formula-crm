/**
 * 브리핑 대시보드가 쓰는 집계 함수 모음.
 *
 * 전부 순수 함수이고 필터링된 Product[] 하나만 입력으로 받는다.
 * (필터 한 줄이 화면 전체를 지배해야 하므로, 차트마다 다른 모집단을 쓰지 않는다.)
 */

import { isExcipient } from './dictionary'
import type { FormType, Product } from './types'

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

/** 인기 부원료 '조합'(동시 등장 쌍). 상담에서 실제로 팔리는 단위는 단일 성분이 아니라 조합이다. */
export function topSubCombos(products: Product[], limit = 6): CountItem[] {
  const counts = new Map<string, number>()
  const perProductCap = 10

  for (const product of products) {
    const subs = [
      ...new Set(
        product.subIngredients
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !isExcipient(s)),
      ),
    ]
      .slice(0, perProductCap)
      .sort((a, b) => a.localeCompare(b, 'ko'))

    for (let i = 0; i < subs.length; i += 1) {
      for (let j = i + 1; j < subs.length; j += 1) {
        const key = `${subs[i]} + ${subs[j]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }

  return toCountItems(counts, products.length, limit).filter((item) => item.count > 1)
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

/** 규격(1회 섭취 중량) 통계. */
export function weightSummary(products: Product[]): { median: number; sampleSize: number } | null {
  const values = products
    .map((product) => product.weightMg)
    .filter((value): value is number => value !== null && value > 0)
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
