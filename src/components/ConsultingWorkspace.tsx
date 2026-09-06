'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { WorkspaceTabs, type WorkspaceTab } from '@/components/WorkspaceTabs'
import { ActiveFilters } from '@/components/ActiveFilters'
import { BriefingDashboard } from '@/components/BriefingDashboard'
import { DatasetImporter } from '@/components/DatasetImporter'
import { DetailPanel } from '@/components/DetailPanel'
import { SavedSearches } from '@/components/SavedSearches'
import { freshnessLabel } from '@/lib/datasetProvenance'
import type { DatasetProvenance } from '@/lib/datasetProvenance'
import type { ImportReport } from '@/lib/types'
import type { SavedSearch } from '@/lib/savedSearches'
import type { DatasetMeta } from '@/lib/api/products'
import { ExportActions } from '@/components/ExportActions'
import { FilterRail } from '@/components/FilterRail'
import { ReferenceGrid } from '@/components/ReferenceGrid'
import { useCsvImport } from '@/hooks/useCsvImport'
import { fetchStoredDataset, type StoredDataset } from '@/lib/api/products'
import { markerCatalog } from '@/lib/analytics'
import { downloadProductsAsCsv } from '@/lib/export/download'
import { buildBriefing } from '@/lib/export/briefing'
import { DEFAULT_RDA_PROFILE } from '@/lib/rda'
import { buildDashboardSummary } from '@/lib/dashboardSummary'
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  formOptions,
  mainIngredientOptions,
  manufacturerOptions,
  subIngredientOptions,
} from '@/lib/filters'
import { formatInt } from '@/lib/format'
import { filterHistoryReducer, INITIAL_FILTER_HISTORY, type FilterUpdate } from '@/lib/filterHistory'
import { mainIngredientKey, uniqueMainIngredients } from '@/lib/ingredientNames'
import { REFERENCE_PAGE_SIZE } from '@/lib/pagination'
import { SEED_PRODUCTS } from '@/lib/seed'
import type { FormType, Product } from '@/lib/types'

const FunctionalIngredientLibrary = dynamic(() => import('@/components/FunctionalIngredientLibrary'), {
  loading: () => <p role="status" className="p-6 text-[13px] text-ink-2">기능성 원료 자료를 불러오는 중…</p>,
})

const FormulaNotes = dynamic(() => import('@/components/FormulaNotes'), {
  loading: () => <p role="status" className="p-6 text-[13px] text-ink-2">노트를 불러오는 중…</p>,
})

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
        <h1 className="text-[15px] font-semibold text-ink">건기식 OEM 배합비 솔루션</h1>
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
      initialMeta={dataset.meta}
      initialSource={dataset.products ? 'db' : 'seed'}
    />
  )
}

function LoadedConsultingWorkspace({
  initialProducts,
  initialSource,
  initialMeta,
}: {
  initialProducts: Product[]
  initialSource: 'seed' | 'db'
  initialMeta: DatasetMeta | null
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [source, setSource] = useState<'seed' | 'csv' | 'db'>(initialSource)
  const [datasetMeta, setDatasetMeta] = useState(initialMeta)
  const [provenance, setProvenance] = useState<DatasetProvenance | null>(initialMeta?.provenance ?? null)
  const [savedNotice, setSavedNotice] = useState('')
  const freshness = freshnessLabel(provenance, datasetMeta?.finished_at, source === 'seed')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filterHistory, dispatchFilters] = useReducer(filterHistoryReducer, INITIAL_FILTER_HISTORY)
  const [rdaProfile, setRdaProfile] = useState(DEFAULT_RDA_PROFILE)
  const filters = filterHistory.current
  const setFilters = useCallback((update: FilterUpdate, group?: string) => {
    dispatchFilters({ type: 'change', update, group })
    // 이미 적용된 조합을 다시 선택한 경우에도 결과를 바로 보여준다.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  const [verifyNote, setVerifyNote] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('consulting')
  const [ingredientsVisited, setIngredientsVisited] = useState(false)
  const [notesVisited, setNotesVisited] = useState(false)

  // 조건 반영이 끝난 화면의 상단으로 즉시 이동한다. 왼쪽 조건 목록의 스크롤은 유지한다.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [filters])

  const handleLoaded = useCallback((next: Product[], report: ImportReport) => {
    setProducts(next)
    setSource('csv')
    setDatasetMeta(null)
    setProvenance(report.provenance ?? null)
    dispatchFilters({ type: 'clear' })
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
            setDatasetMeta(result.meta)
            setProvenance(result.meta?.provenance ?? null)
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
  const dashboardSummary = useMemo(() => buildDashboardSummary(filtered, filters, rdaProfile), [filtered, filters, rdaProfile])

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
    setDatasetMeta(null)
    setProvenance(null)
    dispatchFilters({ type: 'clear' })
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
  }, [setFilters])

  const toggleSub = useCallback((name: string) => {
    setFilters((prev) => ({
      ...prev,
      subInclude: prev.subInclude.includes(name)
        ? prev.subInclude.filter((value) => value !== name)
        : [...prev.subInclude, name],
    }))
  }, [setFilters])

  const selectCombo = useCallback((names: string[]) => {
    setFilters((prev) => ({
      ...prev,
      subInclude: [...new Set([...prev.subInclude, ...names])],
    }))
  }, [setFilters])

  const matchFormula = useCallback((product: Product) => {
    setFilters({
      ...EMPTY_FILTERS,
      mains: uniqueMainIngredients(product.mainIngredients).slice(0, 3).map((name) =>
        options.mains.find((option) => mainIngredientKey(option.value) === mainIngredientKey(name))?.value ?? name,
      ),
      mainMode: 'all',
      forms: [product.form],
    })
    setSelectedId(null)
  }, [options.mains, setFilters])

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

  const restoreSaved = useCallback((item: SavedSearch) => {
    setFilters(item.filters)
    setRdaProfile(item.rdaProfile)
    setSelectedId(null)
    setRailOpen(false)
    setActiveTab('consulting')
    setSavedNotice(`“${item.name}” 조건을 불러왔습니다.${!item.generation || item.generation !== datasetMeta?.generation ? ' 저장 당시와 데이터가 달라 현재 데이터로 다시 계산합니다.' : ''}`)
  }, [datasetMeta?.generation, setFilters])

  const panelOpen = selectedProduct !== null

  return (
    <div className="h-workspace flex flex-col overflow-hidden">
      <header className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {activeTab === 'consulting' ? <button
            type="button"
            onClick={() => setRailOpen((prev) => !prev)}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken lg:hidden"
          >
            조건 {activeCount > 0 ? `(${activeCount})` : ''}
          </button> : null}
          <div className="min-w-0">
            <h1 className="truncate text-[15px] leading-5 font-semibold text-ink">
              건기식 OEM 배합비 솔루션
            </h1>
            <p className="truncate text-[11px] leading-4 text-ink-3">
              {source === 'seed' ? '예시 레퍼런스' : source === 'db' ? '저장된 데이터' : '업로드 데이터'}{' '}
              {formatInt(products.length)}건 · 조건 일치 {formatInt(filtered.length)}건
            </p>
          </div>
        </div>

        {activeTab === 'consulting' ? <ExportActions freshness={freshness} briefing={briefing} disabled={filtered.length === 0} /> : null}
        {activeTab === 'consulting' ? <div className="w-full text-[11px] leading-4 text-ink-3" aria-label="데이터 출처와 최신성">
          <p title={provenance?.updatedThrough ? `원본 LAST_UPDT_DTM 최댓값 · 날짜 확인 ${provenance.datedRows.toLocaleString('ko-KR')}건. CSV 다운로드 날짜는 아닙니다.` : undefined}>{freshness.date}</p>
          <p>{freshness.url ? <a href={freshness.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{freshness.source}</a> : freshness.source} · {freshness.schedule}</p>
        </div> : null}
      </header>

      <WorkspaceTabs value={activeTab} onChange={(tab) => {
        setActiveTab(tab)
        if (tab === 'ingredients') setIngredientsVisited(true)
        if (tab === 'notes') setNotesVisited(true)
      }} />

      <div id="workspace-panel-consulting" role="tabpanel" aria-labelledby="workspace-tab-consulting"
        hidden={activeTab !== 'consulting'} className={activeTab === 'consulting' ? 'flex min-h-0 flex-1 overflow-hidden' : 'hidden'}>
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
            onChange={(next, group) => { setFilters(next, group); if (!group) setRailOpen(false) }}
            onReset={() => { setFilters(EMPTY_FILTERS); setRailOpen(false) }}
            history={filterHistory.previous}
            onRestore={(index) => {
              dispatchFilters({ type: 'restore', index })
              scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
              setRailOpen(false)
            }}
            onEndEdit={() => dispatchFilters({ type: 'end-edit' })}
            activeCount={activeCount}
            options={options}
            markers={markers}
            savedSearches={<SavedSearches current={{ filters, rdaProfile, generation: datasetMeta?.generation ?? null, resultCount: filtered.length }} onRestore={restoreSaved} onNotice={setSavedNotice} />}
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
            {savedNotice ? <p role="status" className="rounded border border-line bg-surface p-3 text-[12px] text-ink-2">{savedNotice}<button type="button" className="ml-3 underline" onClick={() => setSavedNotice('')}>닫기</button></p> : null}
            <ActiveFilters
              filters={filters}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
            />

            <BriefingDashboard
              briefing={briefing}
              summary={dashboardSummary}
              rdaProfile={rdaProfile} onRdaProfileChange={setRdaProfile}
              selectedMarker={filters.marker}
              onToggleForm={toggleForm}
              onToggleSub={toggleSub}
              onSelectCombo={selectCombo}
              onSelectMains={(names) => setFilters((prev) => ({
                ...prev,
                mains: names.map((name) => options.mains.find((option) => mainIngredientKey(option.value) === mainIngredientKey(name))?.value ?? name),
                mainMode: 'all',
              }))}
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

      <div id="workspace-panel-ingredients" role="tabpanel" aria-labelledby="workspace-tab-ingredients"
        hidden={activeTab !== 'ingredients'} className={activeTab === 'ingredients' ? 'min-h-0 flex-1 overflow-y-auto scroll-contain' : 'hidden'}>
        {ingredientsVisited ? <FunctionalIngredientLibrary /> : null}
      </div>

      <div id="workspace-panel-notes" role="tabpanel" aria-labelledby="workspace-tab-notes"
        hidden={activeTab !== 'notes'} className={activeTab === 'notes' ? 'min-h-0 flex-1 overflow-y-auto scroll-contain' : 'hidden'}>
        {notesVisited ? <FormulaNotes /> : null}
      </div>

      {activeTab === 'consulting' ? <DetailPanel
        product={selectedProduct}
        position={selectedIndex}
        total={filtered.length}
        onClose={() => setSelectedId(null)}
        onStep={step}
        onFilterBySub={(name) => { toggleSub(name); setSelectedId(null) }}
        onMatchFormula={matchFormula}
      /> : null}
    </div>
  )
}
