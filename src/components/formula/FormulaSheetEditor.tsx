'use client'

/**
 * 배합 설계 탭.
 *
 * 화면 순서를 공장 견적서와 같게 뒀다. 위에서 아래로 읽으면 엑셀 한 장을 그대로
 * 훑는 순서가 된다 - 포장 단위 → 원료비 → 부자재비 → 가공비 → 분석비 → 간접비·요약
 * → 구성 및 포장지.
 *
 * 계산은 전부 `calculate()` 한 번으로 끝난다. 셀을 고치면 시트가 바뀌고, 시트가
 * 바뀌면 모든 표의 숫자가 같은 계산 결과에서 다시 나온다. 엑셀에서 수식이 끊겨
 * 어떤 칸만 갱신되지 않는 사고가 안 생기는 이유다.
 */

import { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useState, type Ref } from 'react'
import type { Product } from '@/lib/types'
import { DEFAULT_SHEET_EXPORT } from '@/lib/export/renderFormulaSheet'
import { refreshProductProvenance } from '@/lib/formulaDesign/fromProduct'
import { formulaReferenceKey, type FormulaDraft, type FormulaTabMeta } from '@/lib/formulaDesign/workspace'
import { calculate, calculateTiers, formatWon } from '@/lib/formulaDesign/calc'
import { emptySheet, SAMPLE_SHEETS } from '@/lib/formulaDesign/preset'
import { sheetReducer, type SheetAction } from '@/lib/formulaDesign/reducer'
import { buildSuggestionIndex } from '@/lib/formulaDesign/suggest'
import type { FormulaRecord, FormulaSheet, IngredientPrice } from '@/lib/formulaDesign/types'
import {
  createFormula,
  deleteFormula,
  fetchFormula,
  fetchIngredientPrices,
  fetchVersionSheet,
  updateFormula,
} from '@/lib/api/formulas'
import { companyKey, type NoteSummary } from '@/lib/formulaNotes'
import { LabelTable } from './LabelTable'
import { LineGrid } from './LineGrid'
import { MaterialGrid } from './MaterialGrid'
import { QuotePanel } from './QuotePanel'
import { SpecPanel } from './SpecPanel'
import { FormulaLibrary } from './FormulaLibrary'
import { PriceBookPanel } from './PriceBookPanel'
import { SheetExportPanel } from './SheetExportPanel'

const buttonClass =
  'rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50'
const primaryClass =
  'rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50'
const fieldClass =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3'

/** 저장 상태. 저장된 배합비를 열면 서버 id·버전을 함께 들고 있어야 갱신할 수 있다. */
type Saved = { id: string; version: number; updatedAt: string } | null

export type FormulaSheetEditorHandle = {
  refreshReference: (product: Product) => boolean
  snapshot: () => FormulaDraft
  canClose: () => boolean
}

type Props = {
  tabId: string
  active: boolean
  initialDraft: FormulaDraft
  referenceNames: string[]
  editorRef: Ref<FormulaSheetEditorHandle>
  onMetadata: (id: string, meta: FormulaTabMeta) => void
  onNewSheet: () => void
  onOpenRecord: (record: FormulaRecord) => void
  onBackToReference?: (product: Product | null) => void
}

export function FormulaSheetEditor({ tabId, active, initialDraft, referenceNames, editorRef, onMetadata, onNewSheet, onOpenRecord, onBackToReference }: Props) {
  const [sheet, dispatch] = useReducer(sheetReducer, initialDraft.sheet)
  const [reference, setReference] = useState(initialDraft.reference)
  const [company, setCompany] = useState(initialDraft.company)
  const [title, setTitle] = useState(initialDraft.title)
  const [noteId, setNoteId] = useState(initialDraft.noteId)
  const [saved, setSaved] = useState<Saved>(initialDraft.saved)
  const [dirty, setDirty] = useState(initialDraft.dirty)
  const [exportOptions, setExportOptions] = useState(() => initialDraft.exportOptions ?? { ...DEFAULT_SHEET_EXPORT })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(initialDraft.reference ? '제품의 원료와 규격을 새 시트로 가져왔습니다.' : '')
  const [error, setError] = useState('')
  const [prices, setPrices] = useState<IngredientPrice[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [priceBookOpen, setPriceBookOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [notes, setNotes] = useState<NoteSummary[]>([])

  useImperativeHandle(editorRef, () => ({
    refreshReference(product) {
      if (busy || formulaReferenceKey(reference) !== formulaReferenceKey(product)) return false
      const refreshed = refreshProductProvenance(sheet, product)
      if (refreshed !== sheet) {
        dispatch({ type: 'load', sheet: refreshed })
        setReference(product)
        setDirty(true)
        setMessage('입력한 견적은 유지하고 참고 제품의 원료 출처를 갱신했습니다.')
      }
      return true
    },
    snapshot: () => ({ sheet, reference, company, title, noteId, saved, dirty, exportOptions }),
    canClose: () => !busy && (!dirty || window.confirm('이 시트에 저장하지 않은 내용이 있습니다. 시트를 닫고 변경사항을 버릴까요?')),
  }))

  useEffect(() => {
    onMetadata(tabId, { title: title || reference?.name || sheet.spec.productName,
      referenceKey: formulaReferenceKey(reference), savedId: saved?.id ?? null, dirty, busy })
  }, [tabId, title, reference, sheet.spec.productName, saved, dirty, busy, onMetadata])

  /**
   * 단계 안내에서 해당 구역으로 이동한다.
   *
   * `scrollIntoView` 를 쓰지 않는다 - 그건 스크롤 가능한 조상을 전부 움직여서,
   * 작업 화면을 감싼 문서까지 같이 밀어 올린다. html·body 가 `overflow: hidden`
   * 이라 한 번 밀리면 사용자가 되돌릴 방법도 없다. 그래서 이 구역이 실제로 든
   * 스크롤 상자 하나만 찾아서 그것만 움직인다.
   */
  const jumpTo = (id: string) => {
    const section = document.getElementById(id)
    if (!section) return
    let scroller: HTMLElement | null = null
    for (let node = section.parentElement; node; node = node.parentElement) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') {
        scroller = node
        break
      }
    }
    if (scroller) {
      const toolbarHeight = scroller.querySelector('[data-formula-workspace-toolbar]')?.getBoundingClientRect().height ?? 0
      const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - toolbarHeight - 16
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
    section.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
  }

  /**
   * 이 회사의 상담 노트 목록. 배합비를 특정 노트 하위에 매달아 둘 때 쓴다.
   * 회사 이름 정규화 규칙(`companyKey`)이 노트 화면과 같아서, 노트에서 쓰던
   * 회사 이름을 그대로 적으면 그 회사의 노트가 잡힌다.
   */
  useEffect(() => {
    const key = companyKey(company)
    if (!key) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/notes?company=${encodeURIComponent(key)}`, { cache: 'no-store', signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data?.notes && !controller.signal.aborted) setNotes(data.notes as NoteSummary[])
        })
        .catch(() => {})
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [company])

  // 원료단가 기억장은 자동완성에만 쓰므로 실패해도 화면을 막지 않는다.
  useEffect(() => {
    const controller = new AbortController()
    fetchIngredientPrices(controller.signal)
      .then((data) => setPrices(data.prices))
      .catch(() => {})
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  // 회사명을 지우거나 바꾸면 이전 회사의 노트 목록을 보여주지 않는다.
  const shownNotes = companyKey(company) ? notes : []

  const index = useMemo(() => buildSuggestionIndex(prices, referenceNames), [prices, referenceNames])
  const totals = useMemo(() => calculate(sheet), [sheet])
  const tiers = useMemo(() => calculateTiers(sheet), [sheet])

  const act = useCallback((action: SheetAction) => {
    setDirty(true)
    setMessage('')
    dispatch(action)
  }, [])

  const canLeave = () =>
    !busy && (!dirty || window.confirm('저장하지 않은 배합비가 있습니다. 변경사항을 버리고 이동할까요?'))

  const reset = (next: FormulaSheet, notice: string) => {
    setReference(null)
    dispatch({ type: 'load', sheet: next })
    setSaved(null)
    setDirty(false)
    setError('')
    setMessage(notice)
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await task()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (!company.trim() || !title.trim()) {
        setError('회사명과 배합비 제목을 입력해 주세요.')
        return
      }
      const payload = { company: company.trim(), title: title.trim(), noteId, sheet }
      const result = saved
        ? await updateFormula({ ...payload, id: saved.id, version: saved.version })
        : await createFormula({ ...payload, id: crypto.randomUUID() })
      setSaved({ id: result.formula.id, version: result.formula.version, updatedAt: result.formula.updatedAt })
      setDirty(false)
      setMessage(`저장했습니다. 버전 ${result.formula.version}`)
      setRefresh((value) => value + 1)
    })

  const remove = () =>
    run(async () => {
      if (!saved || !window.confirm(`‘${title}’ 배합비를 삭제할까요? 저장된 견적 버전도 함께 지워집니다.`)) return
      await deleteFormula(saved.id, saved.version)
      reset(emptySheet(), '배합비를 삭제했습니다.')
      setCompany('')
      setTitle('')
      setNoteId(null)
      setRefresh((value) => value + 1)
    })

  const openFormula = (id: string) =>
    run(async () => {
      const data = await fetchFormula(id)
      setLibraryOpen(false)
      onOpenRecord(data.formula)
    })

  const openVersion = (version: number) =>
    run(async () => {
      if (!saved || !canLeave()) return
      const data = await fetchVersionSheet(saved.id, version)
      dispatch({ type: 'load', sheet: data.sheet })
      setDirty(true)
      setLibraryOpen(false)
      setMessage(`버전 ${version} 을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.`)
    })

  // 편집 상태를 유지하면서 현재 시트의 표만 그려 계산 칸과 고정 id가 중복되지 않게 한다.
  if (!active) return null

  return (
    <div className="mx-auto flex max-w-[104rem] flex-col gap-4 px-4 py-5 lg:px-6">
      <fieldset disabled={busy} className="contents">
      <section className="rounded-lg border border-accent-line bg-surface p-4" aria-label="견적 작성 안내">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-accent-strong">배합 설계 · 견적 작성</p>
            <h2 className="mt-1 text-[18px] font-semibold text-ink">
              {reference ? `${reference.name} 기준으로 견적 만들기` : '원료와 규격을 입력해 견적을 만드세요'}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-2">
              {reference ? '원료·규격과 확인된 원료사·원산지를 함께 가져왔습니다. 원료사·원산지는 참고 제품 기준이며, 배합비율과 단가는 직접 입력해 주세요.' : '제품 검색에서 선택한 원료를 가져오거나, 아래에서 직접 작성할 수 있습니다.'}
            </p>
          </div>
          {onBackToReference ? <button type="button" className={buttonClass} onClick={() => onBackToReference(reference)}>
            <span aria-hidden>← </span>{reference ? '참고 제품 다시 보기' : '제품 검색으로'}
          </button> : null}
        </div>
        <nav aria-label="견적 작성 순서" className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ['quote-spec', '1. 규격·수량 확인', '1개 중량 · 포장 개수 · 발주 수량'],
            ['quote-materials', '2. 배합비율·단가 입력', '가져온 원료를 확인하고 원가 계산'],
            ['quote-export', '3. 견적서 내보내기', '고객용 PDF 미리보기 · 저장'],
          ].map(([id, label, hint]) => <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken px-3 py-3">
            <div>
              <p className="text-[13px] font-medium text-ink">{label}</p>
              <p className="mt-1 text-[12px] text-ink-3">{hint}</p>
            </div>
            <button type="button" onClick={() => jumpTo(id)} aria-label={`${label} 바로가기`}
              className="shrink-0 rounded-md border border-accent-line bg-surface px-3 py-2 text-[13px] font-semibold text-accent-strong hover:border-accent hover:bg-accent-soft">바로가기</button>
          </div>)}
        </nav>
      </section>
      <header className="rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[10rem] flex-1">
            <span className="block text-[12px] font-medium text-ink-2">
              고객사 <span className="text-danger">*</span>
            </span>
            <input
              className={fieldClass}
              value={company}
              maxLength={100}
              placeholder="예: 하우랩"
              onChange={(event) => {
                setDirty(true)
                setCompany(event.target.value)
                dispatch({ type: 'spec', key: 'customer', value: event.target.value })
                // 회사가 바뀌면 이전 회사 노트에 매달린 상태를 그대로 두지 않는다.
                setNoteId(null)
              }}
            />
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className="block text-[12px] font-medium text-ink-2">연결할 상담 노트</span>
            <select
              className={fieldClass}
              value={noteId ?? ''}
              disabled={shownNotes.length === 0}
              onChange={(event) => {
                setDirty(true)
                setNoteId(event.target.value || null)
              }}
            >
              <option value="">
                {shownNotes.length === 0 ? '이 회사의 노트가 없습니다' : '연결하지 않음'}
              </option>
              {shownNotes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title} ({note.updatedAt.slice(0, 10)})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[14rem] flex-[2]">
            <span className="block text-[12px] font-medium text-ink-2">
              배합비 제목 <span className="text-danger">*</span>
            </span>
            <input
              className={fieldClass}
              value={title}
              maxLength={150}
              placeholder="예: 항산화 정제 800mg · 1차 견적"
              onChange={(event) => {
                setDirty(true)
                setTitle(event.target.value)
              }}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primaryClass} onClick={save} disabled={busy}>
              {busy ? '처리 중…' : saved ? '새 버전으로 저장' : '배합비 저장'}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={onNewSheet}
              disabled={busy}
            >
              새 시트 만들기
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setLibraryOpen((open) => !open)}
              aria-haspopup="dialog"
            >
              저장된 배합비
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPriceBookOpen((open) => !open)}
              aria-haspopup="dialog"
            >
              원료단가 {prices.length > 0 ? `(${prices.length.toLocaleString('ko-KR')})` : ''}
            </button>
            {saved ? (
              <button type="button" className={`${buttonClass} hover:text-danger`} onClick={remove} disabled={busy}>
                삭제
              </button>
            ) : null}
          </div>
        </div>

      <label className="mt-3 block border-t border-line pt-3">
        <span className="block text-[12px] font-medium text-ink-2">메모</span>
        <textarea
          value={sheet.memo}
          rows={2}
          maxLength={5000}
          placeholder="원료 수급, 시험생산 조건, 고객 요청 등"
          onChange={(event) => act({ type: 'memo', value: event.target.value })}
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3"
        />
      </label>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
          <span>
            {saved
              ? `서버 저장 · 버전 ${saved.version} · ${saved.updatedAt.slice(0, 16).replace('T', ' ')}`
              : '아직 저장하지 않았습니다.'}
          </span>
          {noteId ? <span>회사 노트에 연결됨</span> : null}
          <span>
            공급가 <span className="tnum font-medium text-ink-2">{formatWon(totals.supplyTotal)}</span>원 · 최종 단가{' '}
            <span className="tnum font-medium text-accent-strong">{formatWon(totals.unitPrice)}</span>원/set
          </span>
          <span className="flex items-center gap-1">
            예시 불러오기:
            {SAMPLE_SHEETS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className="underline underline-offset-2 hover:text-ink"
                onClick={() => {
                  if (!canLeave()) return
                  const next = sample.build()
                  reset(next, `${sample.label} 예시를 불러왔습니다.`)
                  setDirty(true)
                  setCompany(next.spec.customer)
                  setTitle(sample.label)
                  setNoteId(null)
                }}
              >
                {sample.short}
              </button>
            ))}
          </span>
        </div>

        {error ? (
          <p role="alert" className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-2 text-[13px] text-ink-2">
            {message}
          </p>
        ) : null}
      </header>

      {priceBookOpen ? (
        <PriceBookPanel
          prices={prices}
          onChanged={() => setRefresh((value) => value + 1)}
          onClose={() => setPriceBookOpen(false)}
        />
      ) : null}

      {libraryOpen ? (
        <FormulaLibrary
          busy={busy}
          actionError={error}
          refreshKey={refresh}
          currentId={saved?.id ?? null}
          onOpen={openFormula}
          onOpenVersion={openVersion}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}

      <div id="quote-spec" className="scroll-mt-4"><SpecPanel spec={sheet.spec} totals={totals} dispatch={(action) => {
        if (action.type === 'spec' && action.key === 'customer') { setCompany(action.value); setNoteId(null) }
        act(action)
      }} /></div>

      <div id="quote-materials" className="scroll-mt-4"><MaterialGrid
        materials={sheet.materials}
        productName={sheet.spec.productName}
        totals={totals}
        lossPercent={sheet.spec.lossPercent}
        index={index}
        dispatch={act}
      /></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <LineGrid
          title="2. 부자재비"
          block="packagingItems"
          rows={sheet.packagingItems}
          calcs={totals.packaging}
          total={totals.packagingCost}
          excluded={totals.packaging.reduce((sum, item) => (item.counted ? sum : sum + item.amount), 0)}
          itemLabel="항목"
          dispatch={act}
        />
        <LineGrid
          title="3. 가공비 (노무비·경비 포함)"
          block="processItems"
          rows={sheet.processItems}
          calcs={totals.process}
          total={totals.processCost}
          excluded={totals.process.reduce((sum, item) => (item.counted ? sum : sum + item.amount), 0)}
          itemLabel="공정"
          dispatch={act}
        />
      </div>

      <LineGrid
        title="4. 분석비 · 초도비용"
        block="analysisItems"
        rows={sheet.analysisItems}
        calcs={totals.analysis}
        total={totals.analysisCost}
        excluded={totals.analysis.reduce((sum, item) => (item.counted ? sum : sum + item.amount), 0)}
        itemLabel="항목"
        dispatch={act}
      />

      <QuotePanel quote={sheet.quote} totals={totals} tiers={tiers} dispatch={act} />

      <LabelTable
        materials={totals.materials}
        intakeGuide={sheet.spec.intakeGuide}
        unitWeightMg={sheet.spec.unitWeightMg}
        dispatch={act}
      />

      <div id="quote-export" className="scroll-mt-4"><SheetExportPanel sheet={sheet} totals={totals} tiers={tiers} options={exportOptions} onOptionsChange={setExportOptions} /></div>
      </fieldset>
    </div>
  )
}
