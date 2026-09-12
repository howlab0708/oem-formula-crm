'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Product } from './types'
import type { TraceLookup } from './server/foodTraceability'

const cache = new Map<string, { expires: number; data: TraceLookup }>()
const cached = (key: string) => { const entry = cache.get(key); return entry && entry.expires > Date.now() ? entry.data : undefined }

export function useProductTraceability(product: Product | null) {
  const payload = product ? JSON.stringify({ name: product.name, manufacturer: product.manufacturer,
    reportNo: product.reportNo, mainIngredients: product.mainIngredients, subIngredients: product.subIngredients }) : ''
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: TraceLookup; error?: string } | null>(null)
  const current = result?.key === payload ? result : null
  const data = cached(payload) || current?.data
  const error = current?.error

  useEffect(() => {
    if (!payload || cached(payload)) return
    const controller = new AbortController()
    let active = true
    const timer = setTimeout(() => controller.abort(), 30_000)
    async function lookup() {
      try {
        const response = await fetch('/api/ingredient-provenance', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: payload, signal: controller.signal })
        const value = await response.json()
        if (!response.ok || !['matched', 'not_found', 'needs_review'].includes(value.status)) throw new Error('LOOKUP_FAILED')
        if (!active) return
        cache.set(payload, { data: value, expires: Date.now() + 60 * 60 * 1000 })
        if (cache.size > 150) cache.delete(cache.keys().next().value!)
        setResult({ key: payload, data: value })
      } catch {
        if (active) setResult({ key: payload, error: '공개 이력을 불러오지 못했습니다. 다시 조회해 주세요.' })
      } finally { clearTimeout(timer) }
    }
    void lookup()
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [payload, attempt])

  const enriched = useMemo(() => product && data ? { ...product, traceability: data } : product, [product, data])
  function retry() { cache.delete(payload); setResult(null); setAttempt(value => value + 1) }
  return { product: enriched, loading: Boolean(payload && !data && !error), error, retry }
}
