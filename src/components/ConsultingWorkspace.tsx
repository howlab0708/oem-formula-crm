'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { WorkspaceSidebar, tabLabel, type WorkspaceTab } from '@/components/WorkspaceSidebar'
import { ActiveFilters } from '@/components/ActiveFilters'
import { BriefingDashboard } from '@/components/BriefingDashboard'
import { DatasetSyncPanel } from '@/components/DatasetSyncPanel'
import { DetailPanel } from '@/components/DetailPanel'
import { SavedSearches } from '@/components/SavedSearches'
import { freshnessLabel } from '@/lib/datasetProvenance'
import type { DatasetProvenance } from '@/lib/datasetProvenance'
import type { SavedSearch } from '@/lib/savedSearches'
import type { DatasetMeta } from '@/lib/api/products'
import { ExportActions } from '@/components/ExportActions'
import { FilterBar } from '@/components/FilterBar'
import { CompanyDataPanel } from '@/components/CompanyDataPanel'
import { loadCompanyLibrary } from '@/lib/api/companyData'
import type { CompanyLibrary } from '@/lib/companyCsv'
import { ReferenceGrid } from '@/components/ReferenceGrid'
import { fetchStoredDataset, type StoredDataset } from '@/lib/api/products'
import { markerCatalog } from '@/lib/analytics'
import { downloadProductsAsCsv } from '@/lib/export/download'
import { buildBriefing } from '@/lib/export/briefing'
import { DEFAULT_RDA_PROFILE } from '@/lib/rda'
import { buildDashboardSummary } from '@/lib/dashboardSummary'
import { useCollapsedCard } from '@/hooks/useCollapsedCard'
import { useWorkspaceNavigation } from '@/hooks/useWorkspaceNavigation'
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
import { sourceFormOptions, sourceNutrientOptions } from '@/lib/ingredientSource'
import { REFERENCE_PAGE_SIZE } from '@/lib/pagination'
import { prepareReferences } from '@/lib/referenceOrder'
import { SEED_PRODUCTS } from '@/lib/seed'
import type { FormType, Product } from '@/lib/types'
import type { FormulaDesignerHandle } from '@/components/formula/FormulaDesigner'

const FunctionalIngredientLibrary = dynamic(() => import('@/components/FunctionalIngredientLibrary'), {
  loading: () => <p role="status" className="p-6 text-[14px] text-ink-2">기능성 원료 자료를 불러오는 중…</p>,
})

const FormulaNotes = dynamic(() => import('@/components/FormulaNotes'), {
  loading: () => <p role="status" className="p-6 text-[14px] text-ink-2">노트를 불러오는 중…</p>,
})

const FormulaDesigner = dynamic(() => import('@/components/formula/FormulaDesigner'), {
  loading: () => <p role="status" className="p-6 text-[14px] text-ink-2">배합 설계 화면을 불러오는 중…</p>,
})

export default function ConsultingWorkspace({ deployLabel }: { deployLabel: string }) {
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
        <p role={loadError ? 'alert' : 'status'} className="text-[14px] text-ink-2">
          {loadError ?? '저장된 데이터를 불러오는 중…'}
        </p>
        {loadError ? (
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setLoadAttempt((attempt) => attempt + 1)
            }}
            className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-sunken"
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
      deployLabel={deployLabel}
    />
  )
}

function LoadedConsultingWorkspace({
  initialProducts,
  initialSource,
  initialMeta,
  deployLabel,
}: {
  initialProducts: Product[]
  initialSource: 'seed' | 'db'
  initialMeta: DatasetMeta | null
  /** 회사 이름표(`APP_LABEL`). 배포가 여러 개일 때 화면만 보고 구분하려고 붙인다. */
  deployLabel: string
}) {
  const [rawProducts, setProducts] = useState<Product[]>(initialProducts)
  const [companyLibrary, setCompanyLibrary] = useState<CompanyLibrary>({ files: [], products: [], local: false })
  const [companyError, setCompanyError] = useState('')
  const [companyLoading, setCompanyLoading] = useState(true)
  const [dataScope, setDataScope] = useState<'all' | 'public' | 'company'>('all')
  const companyLoadVersion = useRef(0)
  const reloadCompany = useCallback(async () => {
    const version = ++companyLoadVersion.current
    setCompanyLoading(true)
    try {
      const library = await loadCompanyLibrary()
      if (version === companyLoadVersion.current) { setCompanyLibrary(library); setCompanyError('') }
    } catch {
      if (version === companyLoadVersion.current) setCompanyError('회사 데이터를 불러오지 못했습니다.')
    } finally { if (version === companyLoadVersion.current) setCompanyLoading(false) }
  }, [])
  useEffect(() => {
    let cancelled = false
    const version = companyLoadVersion.current
    loadCompanyLibrary().then(library => {
      if (!cancelled && version === companyLoadVersion.current) { setCompanyLibrary(library); setCompanyError('') }
    }).catch(() => {
      if (!cancelled && version === companyLoadVersion.current) setCompanyError('회사 데이터를 불러오지 못했습니다.')
    }).finally(() => {
      if (!cancelled && version === companyLoadVersion.current) setCompanyLoading(false)
    })
    return () => { cancelled = true }
  }, [])
  /**
   * 제조원 표기를 통일하고 메이저 제조사부터 보이도록 순서를 다시 세운다.
   * 데이터셋이 바뀔 때만 한 번 돌고, 아래의 모든 필터·통계·내보내기가 이 결과를
   * 그대로 물려받는다(`applyFilters`는 걸러내기만 하고 순서를 건드리지 않는다).
   */
  const publicProducts = useMemo(() => prepareReferences(rawProducts), [rawProducts])
  const allProducts = useMemo(() => [...companyLibrary.products, ...publicProducts], [companyLibrary.products, publicProducts])
  const products = dataScope === 'public' ? publicProducts : dataScope === 'company' ? companyLibrary.products : allProducts
  const [source, setSource] = useState<'seed' | 'csv' | 'db'>(initialSource)
  const [datasetMeta, setDatasetMeta] = useState(initialMeta)
  const [provenance, setProvenance] = useState<DatasetProvenance | null>(initialMeta?.provenance ?? null)
  const [savedNotice, setSavedNotice] = useState('')
  const freshness = freshnessLabel(provenance, datasetMeta?.finished_at, source === 'seed')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filterHistory, dispatchFilters] = useReducer(filterHistoryReducer, INITIAL_FILTER_HISTORY)
  const rdaProfile = DEFAULT_RDA_PROFILE
  const filters = filterHistory.current
  const setFilters = useCallback((update: FilterUpdate, group?: string) => {
    dispatchFilters({ type: 'change', update, group })
    // 이미 적용된 조합을 다시 선택한 경우에도 결과를 바로 보여준다.
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  const { activeTab, selectedId, setActiveTab, setSelectedId, resetSearch, goBack } = useWorkspaceNavigation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  // 제품 목록에 도착했는지. 조건 줄의 이동 단추가 갈 곳을 이 값으로 정한다.
  const [atList, setAtList] = useState(false)
  const [ingredientsVisited, setIngredientsVisited] = useState(false)
  const [notesVisited, setNotesVisited] = useState(false)
  const [designVisited, setDesignVisited] = useState(false)
  const [designProduct, setDesignProduct] = useState<Product | null>(null)
  const designerRef = useRef<FormulaDesignerHandle>(null)
  const designScrollRef = useRef<HTMLDivElement>(null)

  const createQuote = async (product: Product) => {
    if (designerRef.current) {
      if (!(await designerRef.current.importProduct(product))) {
        return
      }
    }
    setDesignProduct(product)
    setDesignVisited(true)
    setActiveTab('design')
    setSidebarOpen(false)
    requestAnimationFrame(() => {
      designScrollRef.current?.scrollTo({ top: 0 })
      document.getElementById('workspace-tab-design')?.focus()
    })
  }

  // 조건 반영이 끝난 화면의 상단으로 즉시 이동한다. 왼쪽 조건 목록의 스크롤은 유지한다.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [filters])

  // Refresh only reference data. Filters, selected reference IDs and unsaved formula sheets survive.
  const refreshDataset = useCallback(async () => {
    const result = await fetchStoredDataset()
    if (result.error || !result.products || !result.meta) throw new Error('업데이트된 자료를 불러오지 못했습니다.')
    setProducts(result.products)
    setSource('db')
    setDatasetMeta(result.meta)
    setProvenance(result.meta.provenance ?? null)
  }, [])

  const options = useMemo(
    () => ({
      mains: mainIngredientOptions(products),
      forms: formOptions(products),
      manufacturers: manufacturerOptions(products),
      subs: subIngredientOptions(products),
      sourceNutrients: sourceNutrientOptions(products),
    }),
    [products],
  )

  // 형태 목록은 고른 영양성분에만 달려 있다. 성분을 바꿀 때 나머지 목록까지 다시 세지 않는다.
  const sourceForms = useMemo(
    () => (filters.sourceNutrient ? sourceFormOptions(products, filters.sourceNutrient) : []),
    [products, filters.sourceNutrient],
  )
  const railOptions = useMemo(() => ({ ...options, sourceForms }), [options, sourceForms])

  const markers = useMemo(() => markerCatalog(products, 60), [products])

  /**
   * 배합 설계 탭의 원료명 자동완성 보조 목록.
   * 부형제(결정셀룰로오스·스테아린산마그네슘 등)는 기능성 원료 DB 에 없으므로
   * 레퍼런스에서 실제로 쓰인 부원료·주원료 이름을 후보로 함께 넣는다.
   */
  const referenceNames = useMemo(
    () => [...options.subs.map((option) => option.value), ...options.mains.map((option) => option.value)],
    [options.subs, options.mains],
  )

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

  /** 상단 제목 옆 한 줄. 무엇을 기준으로 보고 있는지 화면에서 잃지 않게 한다. */
  const sourceWord = dataScope === 'company' ? '회사 데이터' : dataScope === 'all' && companyLibrary.products.length ? '공개·회사 데이터' : source === 'seed' ? '예시 레퍼런스' : '공개 레퍼런스'
  const headline = activeCount === 0
    ? `조건 없음 · ${sourceWord} ${formatInt(products.length)}건 기준`
    : `조건 ${activeCount}개 · ${formatInt(products.length)}건 중 ${formatInt(filtered.length)}건`

  /*
   * 사이드바 접힘은 화면별로 따로 기억한다 - 배합 설계는 배합표 때문에 늘 접어 두고
   * 검색은 즐겨찾기를 보려고 펴 두는 식으로 쓰임새가 갈린다.
   */
  const [sidebarCollapsed, setSidebarCollapsed] = useCollapsedCard(`workspace-sidebar:${activeTab}`)

  // 목록 위치를 스크롤에서 읽는다. 이동 단추의 방향과 이름이 현재 위치를 따라간다.
  useEffect(() => {
    const container = scrollRef.current
    if (!container || activeTab !== 'consulting') return
    const onScroll = () => {
      const target = gridRef.current
      setAtList(Boolean(target) && container.scrollTop >= (target as HTMLDivElement).offsetTop - 24)
    }
    onScroll()
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [activeTab, filtered.length])

  const jump = useCallback(() => {
    const container = scrollRef.current
    const target = gridRef.current
    if (!container) return
    const top = atList || !target ? 0 : Math.max(target.offsetTop - 12, 0)
    container.scrollTo({ top, behavior: 'smooth' })
  }, [atList])

  const changeTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab)
    setSidebarOpen(false)
    if (tab === 'ingredients') setIngredientsVisited(true)
    if (tab === 'notes') setNotesVisited(true)
    if (tab === 'design') setDesignVisited(true)
  }, [setActiveTab])

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
  }, [options.mains, setFilters, setSelectedId])

  const step = useCallback(
    (delta: number) => {
      if (selectedIndex < 0) return
      const next = filtered[selectedIndex + delta]
      if (next) {
        setSelectedId(next.id)
        setPagination({ results: filtered, page: Math.floor((selectedIndex + delta) / REFERENCE_PAGE_SIZE) + 1 })
      }
    },
    [filtered, selectedIndex, setSelectedId],
  )

  const restoreSaved = useCallback((item: SavedSearch) => {
    setFilters(item.filters)
    // 과거 즐겨찾기의 성별·연령 선택값을 복원하지 않는다. 표시 기준은 항상 고정이다.
    setSidebarOpen(false)
    resetSearch()
    setSavedNotice(`“${item.name}” 조건을 불러왔습니다.${!item.generation || item.generation !== datasetMeta?.generation ? ' 저장 당시와 데이터가 달라 현재 데이터로 다시 계산합니다.' : ''}`)
  }, [datasetMeta?.generation, setFilters, resetSearch])


  return (
    <div className="h-workspace flex overflow-hidden">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <div
        className={`${
          sidebarOpen ? 'block' : 'hidden'
        } fixed inset-y-0 left-0 z-40 w-[15.5rem] overflow-hidden transition-[width] lg:static lg:z-auto lg:block lg:h-full lg:shrink-0 ${
          sidebarCollapsed ? 'lg:w-[3.5rem]' : 'lg:w-[15.5rem]'
        }`}
      >
        <WorkspaceSidebar
          companyData={compact => <CompanyDataPanel compact={compact} library={companyLibrary} error={companyError} loading={companyLoading} onReload={reloadCompany} onShowCompany={() => {
            setDataScope('company'); setFilters(EMPTY_FILTERS); setSelectedId(null); changeTab('consulting')
          }} />}
          deployLabel={deployLabel}
          value={activeTab}
          onChange={changeTab}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
          freshness={freshness}
          dateTitle={provenance?.updatedThrough ? `원본 LAST_UPDT_DTM 최댓값 · 날짜 확인 ${provenance.datedRows.toLocaleString('ko-KR')}건. CSV 다운로드 날짜는 아닙니다.` : undefined}
          /* 즐겨찾기는 검색 조건을 담는 자리다. 다른 화면에서는 자리만 차지한다. */
          favorites={activeTab === 'consulting'
            ? <SavedSearches current={{ filters, rdaProfile, generation: datasetMeta?.generation ?? null, resultCount: filtered.length }} onRestore={restoreSaved} onNotice={setSavedNotice} />
            : null}
          importer={
            <DatasetSyncPanel
              productCount={publicProducts.length}
              generation={datasetMeta?.generation ?? null}
              onRefresh={refreshDataset}
            />
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-sunken lg:hidden"
            >
              메뉴
            </button>
            {activeTab === 'design' ? <button type="button" onClick={goBack}
              title="이전 화면으로 돌아갑니다. 작성 중인 시트는 유지됩니다."
              className="shrink-0 rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent">
              <span aria-hidden="true">← </span>뒤로가기
            </button> : null}
            <h2 className="shrink-0 text-[16px] leading-6 font-semibold text-ink">{tabLabel(activeTab)}</h2>
            {activeTab === 'design' ? <span className="hidden text-[12px] text-ink-3 sm:block">이전 화면으로 돌아가도 작성 내용은 유지됩니다.</span> : null}
            {/* 좁은 화면에서는 제목과 내보내기만 남긴다. 같은 요약이 아래 조건 줄에 다시 나온다. */}
            {activeTab === 'consulting' ? <p className="hidden truncate text-[13px] leading-5 text-ink-3 sm:block">{headline}</p> : null}
          </div>

          {activeTab === 'consulting' ? <ExportActions freshness={freshness} briefing={briefing} disabled={filtered.length === 0} /> : null}
        </header>

        {/*
          조건 줄은 스크롤 밖에 둔다. 제품 목록까지 내려간 뒤에도 검색창·조건·선택한 조건이
          같은 자리에 있어야 조건을 고쳐 가며 결과를 볼 수 있다.
        */}
        {activeTab === 'consulting' ? (
          <div className="z-10 shrink-0 border-b border-line bg-surface px-4 py-2.5 lg:px-6">
            <div className="mx-auto flex max-w-[104rem] flex-col gap-2">
              <FilterBar
                filters={filters}
                onChange={(next, group) => { setFilters(next, group); setSelectedId(null) }}
                onReset={() => { setFilters(EMPTY_FILTERS); setSelectedId(null) }}
                history={filterHistory.previous}
                onRestore={(index) => {
                  dispatchFilters({ type: 'restore', index })
                  scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
                }}
                onUndo={() => { dispatchFilters({ type: 'undo' }); setSelectedId(null) }}
                onEndEdit={() => dispatchFilters({ type: 'end-edit' })}
                onViewResults={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })}
                options={railOptions}
                markers={markers}
                resultCount={filtered.length}
                atList={atList}
                onJump={jump}
              />
              <ActiveFilters
                filters={filters}
                onChange={(next) => { setFilters(next); setSelectedId(null) }}
                onReset={() => { setFilters(EMPTY_FILTERS); setSelectedId(null) }}
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2" role="group" aria-label="검색 데이터 범위">
                <span className="mr-2 text-[12px] text-ink-2">검색 범위</span>
                {([['all', '전체', allProducts.length], ['public', source === 'seed' ? '예시 데이터' : '식약처 데이터', publicProducts.length], ['company', '회사 데이터', companyLibrary.products.length]] as const).map(([scope, label, count]) =>
                  <button type="button" key={scope} aria-pressed={dataScope === scope} onClick={() => { setDataScope(scope); setSelectedId(null); scrollRef.current?.scrollTo({ top: 0 }) }} className={`rounded-md border px-2.5 py-1 text-[12px] ${dataScope === scope ? 'border-accent-line bg-accent-soft font-medium text-accent-strong' : 'border-transparent text-ink-2 hover:bg-surface-sunken'}`}>{label} <span className="ml-1 tnum">{count.toLocaleString()}</span></button>)}
              </div>
            </div>
          </div>
        ) : null}

        <div id="workspace-panel-consulting" role="tabpanel" aria-labelledby="workspace-tab-consulting"
          hidden={activeTab !== 'consulting'} className={activeTab === 'consulting' ? 'min-h-0 flex-1 overflow-hidden' : 'hidden'}>
        <main
          ref={scrollRef}
          className="h-full min-w-0 overflow-y-auto scroll-contain"
        >
          <div
            className="mx-auto flex max-w-[104rem] flex-col gap-4 px-4 py-4 lg:px-6"
          >
            {savedNotice ? <p role="status" className="rounded border border-line bg-surface p-3 text-[13px] text-ink-2">{savedNotice}<button type="button" className="ml-3 underline" onClick={() => setSavedNotice('')}>닫기</button></p> : null}

            <BriefingDashboard
              briefing={briefing}
              summary={dashboardSummary}
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

            <div ref={gridRef}>
            <ReferenceGrid
              active={activeTab === 'consulting'}
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
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50"
                >
                  CSV 내보내기
                </button>
              }
            />
            </div>
          </div>
        </main>
        </div>

        <div ref={designScrollRef} id="workspace-panel-design" role="tabpanel" aria-labelledby="workspace-tab-design"
          hidden={activeTab !== 'design'} className={activeTab === 'design' ? 'min-h-0 flex-1 overflow-y-auto scroll-contain' : 'hidden'}>
          {designVisited ? <FormulaDesigner referenceNames={referenceNames} initialProduct={designProduct}
            editorRef={designerRef} /> : null}
        </div>

        <div id="workspace-panel-ingredients" role="tabpanel" aria-labelledby="workspace-tab-ingredients"
          hidden={activeTab !== 'ingredients'} className={activeTab === 'ingredients' ? 'min-h-0 flex-1 overflow-y-auto scroll-contain' : 'hidden'}>
          {ingredientsVisited ? <FunctionalIngredientLibrary /> : null}
        </div>

        <div id="workspace-panel-notes" role="tabpanel" aria-labelledby="workspace-tab-notes"
          hidden={activeTab !== 'notes'} className={activeTab === 'notes' ? 'min-h-0 flex-1 overflow-y-auto scroll-contain' : 'hidden'}>
          {notesVisited ? <FormulaNotes /> : null}
        </div>
      </div>

      {activeTab === 'consulting' ? <DetailPanel
        product={selectedProduct}
        position={selectedIndex}
        total={filtered.length}
        onClose={() => setSelectedId(null)}
        onStep={step}
        onFilterBySub={(name) => { toggleSub(name); setSelectedId(null) }}
        onMatchFormula={matchFormula}
        onCreateQuote={createQuote}
      /> : null}
    </div>
  )
}
