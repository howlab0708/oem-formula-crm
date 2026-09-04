'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ActiveFilters } from '@/components/ActiveFilters'
import { BriefingDashboard } from '@/components/BriefingDashboard'
import { DatasetImporter } from '@/components/DatasetImporter'
import { DetailPanel } from '@/components/DetailPanel'
import { ExportActions } from '@/components/ExportActions'
import { FilterRail } from '@/components/FilterRail'
import { ReferenceGrid } from '@/components/ReferenceGrid'
import { useCsvImport } from '@/hooks/useCsvImport'
import { markerCatalog } from '@/lib/analytics'
import { downloadProductsAsCsv } from '@/lib/export/download'
import { buildBriefing } from '@/lib/export/briefing'
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  formOptions,
  mainIngredientOptions,
  manufacturerOptions,
  subIngredientOptions,
  type FilterState,
} from '@/lib/filters'
import { formatInt } from '@/lib/format'
import { SEED_PRODUCTS } from '@/lib/seed'
import type { FormType, Product } from '@/lib/types'

export default function ConsultingWorkspace() {
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS)
  const [source, setSource] = useState<'seed' | 'csv'>('seed')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleLoaded = useCallback((next: Product[]) => {
    setProducts(next)
    setSource('csv')
    setFilters(EMPTY_FILTERS)
    setSelectedId(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [])

  const { status, importFile, reset: resetImport } = useCsvImport({ onLoaded: handleLoaded })

  const options = useMemo(
    () => ({
      mains: mainIngredientOptions(products),
      forms: formOptions(products),
      manufacturers: manufacturerOptions(products),
      subs: subIngredientOptions(products),
    }),
    [products],
  )

  const markers = useMemo(() => markerCatalog(products, 60), [products])

  const filtered = useMemo(() => applyFilters(products, filters), [products, filters])

  const briefing = useMemo(
    () => buildBriefing(filtered, filters, products.length),
    [filtered, filters, products.length],
  )

  const selectedIndex = useMemo(
    () => (selectedId ? filtered.findIndex((product) => product.id === selectedId) : -1),
    [filtered, selectedId],
  )

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) ?? null,
    [products, selectedId],
  )

  const activeCount = activeFilterCount(filters)

  const restoreSample = useCallback(() => {
    setProducts(SEED_PRODUCTS)
    setSource('seed')
    setFilters(EMPTY_FILTERS)
    setSelectedId(null)
    resetImport()
  }, [resetImport])

  const toggleForm = useCallback((form: FormType) => {
    setFilters((prev) => ({
      ...prev,
      forms: prev.forms.includes(form)
        ? prev.forms.filter((value) => value !== form)
        : [...prev.forms, form],
    }))
  }, [])

  const toggleSub = useCallback((name: string) => {
    setFilters((prev) => ({
      ...prev,
      subInclude: prev.subInclude.includes(name)
        ? prev.subInclude.filter((value) => value !== name)
        : [...prev.subInclude, name],
    }))
  }, [])

  const selectCombo = useCallback((names: string[]) => {
    setFilters((prev) => ({
      ...prev,
      subInclude: [...new Set([...prev.subInclude, ...names])],
    }))
  }, [])

  const matchFormula = useCallback((product: Product) => {
    setFilters({
      ...EMPTY_FILTERS,
      mains: product.mainIngredients.slice(0, 3),
      mainMode: 'all',
      forms: [product.form],
    })
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const step = useCallback(
    (delta: number) => {
      if (selectedIndex < 0) return
      const next = filtered[selectedIndex + delta]
      if (next) setSelectedId(next.id)
    },
    [filtered, selectedIndex],
  )

  const panelOpen = selectedProduct !== null

  return (
    <div className="h-workspace flex flex-col overflow-hidden">
      <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setRailOpen((prev) => !prev)}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken lg:hidden"
          >
            조건 {activeCount > 0 ? `(${activeCount})` : ''}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] leading-5 font-semibold text-ink">
              OEM 처방 상담 콘솔
            </h1>
            <p className="truncate text-[11px] leading-4 text-ink-3">
              {source === 'seed' ? '예시 레퍼런스' : '업로드 데이터'} {formatInt(products.length)}건
              · 조건 일치 {formatInt(filtered.length)}건
            </p>
          </div>
        </div>

        <ExportActions briefing={briefing} disabled={filtered.length === 0} />
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {railOpen ? (
          <button
            type="button"
            aria-label="조건 패널 닫기"
            onClick={() => setRailOpen(false)}
            className="fixed inset-0 z-30 bg-ink/10 lg:hidden"
          />
        ) : null}

        <div
          className={`${
            railOpen ? 'block' : 'hidden'
          } fixed inset-y-0 left-0 z-40 w-[19rem] overflow-hidden lg:static lg:z-auto lg:block lg:h-full lg:w-[19rem] lg:shrink-0`}
        >
          <FilterRail
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
            activeCount={activeCount}
            options={options}
            markers={markers}
            importer={
              <DatasetImporter
                status={status}
                source={source}
                productCount={products.length}
                onFile={importFile}
                onRestoreSample={restoreSample}
              />
            }
          />
        </div>

        <main
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto scroll-contain"
        >
          <div
            className={`mx-auto flex max-w-[104rem] flex-col gap-5 px-4 py-5 transition-[padding] duration-200 lg:px-6 ${
              panelOpen ? '2xl:pr-[36rem]' : ''
            }`}
          >
            <ActiveFilters
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
            />

            <BriefingDashboard
              briefing={briefing}
              onToggleForm={toggleForm}
              onToggleSub={toggleSub}
              onSelectCombo={selectCombo}
            />

            <ReferenceGrid
              products={filtered}
              totalCount={products.length}
              selectedId={selectedId}
              onSelect={(product) => setSelectedId(product.id)}
              scrollRef={scrollRef}
              actions={
                <button
                  type="button"
                  disabled={filtered.length === 0}
                  onClick={() =>
                    downloadProductsAsCsv(
                      filtered,
                      `OEM레퍼런스_${briefing.generatedAt.replace(/\./g, '')}.csv`,
                    )
                  }
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50"
                >
                  CSV 내보내기
                </button>
              }
            />
          </div>
        </main>
      </div>

      <DetailPanel
        product={selectedProduct}
        position={selectedIndex}
        total={filtered.length}
        onClose={() => setSelectedId(null)}
        onStep={step}
        onFilterBySub={toggleSub}
        onMatchFormula={matchFormula}
      />
    </div>
  )
}
