'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Product } from './types'
import { traceabilityClient, traceabilityPayload } from './traceabilityClient'

const serverSnapshot = () => undefined

export function useProductTraceability(product: Product | null) {
  const payload = traceabilityPayload(product)
  const getSnapshot = useCallback(() => traceabilityClient.snapshot(payload), [payload])
  const state = useSyncExternalStore(traceabilityClient.subscribe, getSnapshot, serverSnapshot)
  useEffect(() => { traceabilityClient.request(payload) }, [payload])
  const data = state?.data
  const enriched = useMemo(() => product && data ? { ...product, traceability: data } : product, [product, data])
  return { product: enriched, loading: Boolean(payload && !data && !state?.error),
    refreshing: Boolean(data && state?.pending), error: state?.error,
    retry: () => traceabilityClient.request(payload, true, true) }
}
