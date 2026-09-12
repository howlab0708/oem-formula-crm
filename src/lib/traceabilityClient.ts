import type { Product } from './types'
import type { TraceLookup } from './server/foodTraceability'

const FRESH_MS = 60 * 60 * 1000
const RETAIN_MS = 7 * 24 * FRESH_MS
const STORAGE_KEY = 'oem:public-ingredient-trace:v2'
type Entry = { data?: TraceLookup; fetchedAt: number; pending: boolean; error?: string; failedAt?: number }
type Job = { key: string; foreground: boolean; started: boolean }
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

export function traceabilityPayload(product: Product | null) {
  return product ? JSON.stringify({ name: product.name, manufacturer: product.manufacturer,
    reportNo: product.reportNo, mainIngredients: product.mainIngredients, subIngredients: product.subIngredients }) : ''
}

function validLookup(value: unknown): value is TraceLookup {
  if (!value || typeof value !== 'object') return false
  const v = value as TraceLookup
  const text = (s: unknown, max = 500): s is string => typeof s === 'string' && s.length <= max
  const date = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const source = (s: unknown) => {
    if (!text(s, 2000)) return false
    try { const url = new URL(s); return url.origin === 'https://tfood.go.kr' && url.pathname.startsWith('/tfweb/nhq/') && !url.username && !url.password } catch { return false }
  }
  if (!['matched', 'not_found', 'needs_review'].includes(v.status) || !date(v.checkedAt) || !text(v.message, 2000) ||
    !Array.isArray(v.candidates) || v.candidates.length > 6 || !v.candidates.every(c => c && text(c.productName) && text(c.manufacturer) && source(c.sourceUrl))) return false
  if (v.status !== 'matched') return !v.lot
  const lot = v.lot
  return Boolean(lot && /^\d{1,60}$/.test(lot.registrationNo) && /^\d{1,60}$/.test(lot.traceabilityNo) &&
    text(lot.productName) && text(lot.manufacturer) && date(lot.productionDate) && source(lot.sourceUrl) &&
    Array.isArray(lot.ingredients) && lot.ingredients.length > 0 && lot.ingredients.length <= 500 &&
    lot.ingredients.every(i => i && text(i.name) && text(i.country, 200)))
}

/** Public source snapshots only. Full recipe identity prevents reuse after a product changes. */
export function createTraceabilityClient(options: {
  fetcher: (key: string) => Promise<unknown>; storage?: () => Storage | undefined; now?: () => number
}) {
  const now = options.now || Date.now
  const entries = new Map<string, Entry>()
  const jobs = new Map<string, Job>()
  const listeners = new Set<() => void>()
  let active = 0, hydrated = false, saveQueued = false
  const emit = () => listeners.forEach(listener => listener())

  function hydrate() {
    if (hydrated) return
    hydrated = true
    try {
      const raw = options.storage?.()?.getItem(STORAGE_KEY)
      if (!raw || raw.length > 1_500_000) return
      const saved = JSON.parse(raw)
      if (!Array.isArray(saved)) return
      for (const item of saved.slice(-120)) {
        if (!Array.isArray(item) || item.length !== 2) continue
        const [key, entry] = item
        if (typeof key !== 'string' || key.length > 80_000 || !entry || !Number.isFinite(entry.fetchedAt) ||
          entry.fetchedAt > now() || now() - entry.fetchedAt >= RETAIN_MS || !validLookup(entry.data)) continue
        entries.set(key, { data: entry.data, fetchedAt: entry.fetchedAt, pending: false })
      }
    } catch { /* Storage can be unavailable or contain an older/corrupt snapshot. */ }
  }

  function persist() {
    if (saveQueued) return
    saveQueued = true
    queueMicrotask(() => {
      saveQueued = false
      const saved = [...entries].filter(([, e]) => e.data && now() - e.fetchedAt < RETAIN_MS)
        .slice(-120).map(([key, e]) => [key, { data: e.data, fetchedAt: e.fetchedAt }])
      let raw = JSON.stringify(saved)
      while (raw.length > 1_000_000 && saved.length) { saved.shift(); raw = JSON.stringify(saved) }
      try { options.storage?.()?.setItem(STORAGE_KEY, raw) } catch { /* Memory cache still works. */ }
    })
  }

  function snapshot(key: string) {
    hydrate()
    const entry = entries.get(key)
    if (entry?.data && now() - entry.fetchedAt >= RETAIN_MS) {
      const expired = { ...entry, data: undefined }
      entries.set(key, expired)
      return expired
    }
    return entry
  }

  function cancel(job: Job) {
    jobs.delete(job.key)
    const entry = entries.get(job.key)
    if (entry?.data) entries.set(job.key, { ...entry, pending: false })
    else entries.delete(job.key)
  }

  function pump() {
    const waiting = [...jobs.values()].filter(job => !job.started)
    const job = waiting.find(job => job.foreground) || waiting[0]
    // Keep one request slot free for a clicked product; speculative work cannot block it.
    if (!job || active >= (job.foreground ? 2 : 1)) return
    job.started = true
    active++
    void Promise.resolve().then(() => options.fetcher(job.key)).then(data => {
      if (!validLookup(data)) throw new Error('INVALID_TRACE_RESPONSE')
      entries.set(job.key, { data, fetchedAt: now(), pending: false })
      persist()
    }).catch(() => {
      const previous = snapshot(job.key)
      entries.set(job.key, { data: previous?.data, fetchedAt: previous?.fetchedAt || 0, pending: false,
        failedAt: now(), error: '공개 이력을 불러오지 못했습니다. 다시 조회해 주세요.' })
    }).finally(() => {
      jobs.delete(job.key)
      active--
      for (const key of entries.keys()) {
        if (entries.size <= 150) break
        if (!jobs.has(key)) entries.delete(key)
      }
      emit()
      pump()
    })
    pump()
  }

  function request(key: string, foreground = true, retry = false) {
    if (!key) return
    const entry = snapshot(key)
    if (!retry && entry?.data && now() - entry.fetchedAt < FRESH_MS) return
    if (!retry && entry?.failedAt !== undefined && now() - entry.failedAt < 30_000) return
    const existing = jobs.get(key)
    if (existing) { existing.foreground ||= foreground; pump(); return }
    const queued = [...jobs.values()].filter(job => !job.started && !job.foreground)
    if (!foreground && queued.length >= 8) cancel(queued[0])
    entries.set(key, { data: entry?.data, fetchedAt: entry?.fetchedAt || 0, pending: true })
    jobs.set(key, { key, foreground, started: false })
    emit()
    pump()
  }

  return { snapshot, request,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    prefetch(keys: string[]) {
      keys.forEach(key => request(key, false))
      return () => {
        for (const key of keys) { const job = jobs.get(key); if (job && !job.started && !job.foreground) cancel(job) }
        emit()
      }
    },
  }
}

export const traceabilityClient = createTraceabilityClient({
  storage: () => typeof window === 'undefined' ? undefined : window.localStorage,
  fetcher: async key => {
    const response = await fetch('/api/ingredient-provenance', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: key, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error('TRACE_UNAVAILABLE')
    return response.json()
  },
})
