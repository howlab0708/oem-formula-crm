'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActiveFilters } from '@/components/ActiveFilters'
import { BriefingDashboard } from '@/components/BriefingDashboard'
import { DatasetImporter } from '@/components/DatasetImporter'
import { DetailPanel } from '@/components/DetailPanel'
import { ExportActions } from '@/components/ExportActions'
import { FilterRail } from '@/components/FilterRail'
import { ReferenceGrid } from '@/components/ReferenceGrid'
import { useCsvImport } from '@/hooks/useCsvImport'
import { fetchStoredDataset, type StoredDataset } from '@/lib/api/products'
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
import { mainIngredientKey, uniqueMainIngredients } from '@/lib/ingredientNames'
import { REFERENCE_PAGE_SIZE } from '@/lib/pagination'
import { SEED_PRODUCTS } from '@/lib/seed'
import type { FormType, Product } from '@/lib/types'

export default function ConsultingWorkspace() {
  const [dataset, setDataset] = useState<StoredDataset | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)

  // 저장 여부를 확인하기 전에는 예시 데이터로 콘솔을 그리지 않는다.
  useEffect(() => {
    let cancelled = false
    fetchStoredDataset()
      .then((result) => {
        if (cancelled) return
        if (result.error) throw new Error(result.error)
        setDataset(result)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ConsultingWorkspace] 저장된 데이터셋을 불러오지 못했습니다.', error)
        setLoadError('저장된 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      })
    return () => {
      cancelled = true
    }
  }, [loadAttempt])

  if (!dataset) {
    return (
      <main className="h-workspace flex flex-col items-center justify-center gap-3 px-4">
        <h1 className="text-[15px] font-semibold text-ink">OEM 처방 상담 콘솔</h1>
        <p role={loadError ? 'alert' : 'status'} className="text-[13px] text-ink-2">
          {loadError ?? '저장된 데이터를 불러오는 중…'}
        </p>
        {loadError ? (
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setLoadAttempt((attempt) => attempt + 1)
            }}
            className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            다시 시도
          </button>
        ) : null}
      </main>
    )
  }

  return (
    <LoadedConsultingWorkspace
      initialProducts={dataset.products ?? SEED_PRODUCTS}
      initialSource={dataset.products ? 'db' : 'seed'}
    />
  )
}

function LoadedConsultingWorkspace({
  initialProducts,
  initialSource,
}: {
  initialProducts: Product[]
  initialSource: 'seed' | 'db'
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [source, setSource] = useState<'seed' | 'csv' | 'db'>(initialSource)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  const [verifyNote, setVerifyNote] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const handleLoaded = useCallback((next: Product[]) => {
    setProducts(next)
    setSource('csv')
    setFilters(EMPTY_FILTERS)
    setSelectedId(null)
    setVerifyNote(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [setVerifyNote])

  const { status, saveStatus, importFile, reset: resetImport } = useCsvImport({ onLoaded: handleLoaded })

  /**
   * 저장(`saveStatus.phase === 'saved'`)이 끝난 직후, 방금 저장한 게 실제로
   * 서버에서 다시 읽힐 때까지 확인한다. 화면에 보이는 데이터는 이미 맞지만,
   * 이 확인이 끝나기 전에 다른 사람이 새로고침하면 아직 예시 데이터를 볼 수
   * 있다 - 그래서 몇 번 재시도해서 실제로 반영됐는지 확인하고, 오래 걸리면
   * 조용히 넘어가지 않고 화면에 알려준다.
   */
  useEffect(() => {
    if (saveStatus.phase !== 'saved') return
    let cancelled = false
    const expectedRows = saveStatus.meta.imported_rows

    async function verify() {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (cancelled) return
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 700 : 2000))
        if (cancelled) return
        try {
          const result = await fetchStoredDataset()
          if (cancelled) return
          if (result.products && result.products.length === expectedRows) {
            setProducts(result.products)
            setSource('db')
            setVerifyNote(null)
            return
          }
        } catch {
          // 재시도로 넘어간다 - 마지막에도 실패하면 아래에서 알린다.
        }
      }
      if (!cancelled) {
        setVerifyNote(
          '저장은 완료됐지만, 서버에서 다시 불러오는 데 예상보다 오래 걸리고 있습니다. 잠시 후 새로고침해서 확인해 주세요.',
        )
      }
    }

    verify()
    return () => {
      cancelled = true
    }
  }, [saveStatus])

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

  // 필터·데이터가 바뀌면 새 결과의 1페이지부터 보여준다.
  const [pagination, setPagination] = useState({ results: filtered, page: 1 })
  const page = pagination.results === filtered ? pagination.page : 1

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
    setVerifyNote(null)
    resetImport()
  }, [resetImport, setVerifyNote])

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
      mains: uniqueMainIngredients(product.mainIngredients).slice(0, 3).map((name) =>
        options.mains.find((option) => mainIngredientKey(option.value) === mainIngredientKey(name))?.value ?? name,
      ),
      mainMode: 'all',
      forms: [product.form],
    })
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [options.mains])

  const step = useCallback(
    (delta: number) => {
      if (selectedIndex < 0) return
      const next = filtered[selectedIndex + delta]
      if (next) {
        setSelectedId(next.id)
        setPagination({ results: filtered, page: Math.floor((selectedIndex + delta) / REFERENCE_PAGE_SIZE) + 1 })
      }
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
              {source === 'seed' ? '예시 레퍼런스' : source === 'db' ? '저장된 데이터' : '업로드 데이터'}{' '}
              {formatInt(products.length)}건 · 조건 일치 {formatInt(filtered.length)}건
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
                saveStatus={saveStatus}
                verifyNote={verifyNote}
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
              selectedMarker={filters.marker}
              onToggleForm={toggleForm}
              onToggleSub={toggleSub}
              onSelectCombo={selectCombo}
            />

            <ReferenceGrid
              products={filtered}
              totalCount={products.length}
              page={page}
              onPageChange={(next) => setPagination({ results: filtered, page: next })}
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
