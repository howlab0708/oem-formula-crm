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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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

type Props = {
  /** 레퍼런스 데이터의 부원료 이름. 기능성 원료 DB 에 없는 부형제 자동완성에 쓴다. */
  referenceNames: string[]
}

export default function FormulaDesigner({ referenceNames }: Props) {
  const [sheet, dispatch] = useReducer(sheetReducer, undefined, emptySheet)
  const [company, setCompany] = useState('')
  const [title, setTitle] = useState('')
  const [noteId, setNoteId] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [prices, setPrices] = useState<IngredientPrice[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [priceBookOpen, setPriceBookOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const dirty = useRef(false)

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
      if (dirty.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  // 회사명을 지우거나 바꾸면 이전 회사의 노트 목록을 보여주지 않는다.
  const shownNotes = companyKey(company) ? notes : []

  const index = useMemo(() => buildSuggestionIndex(prices, referenceNames), [prices, referenceNames])
  const totals = useMemo(() => calculate(sheet), [sheet])
  const tiers = useMemo(() => calculateTiers(sheet), [sheet])

  const act = useCallback((action: SheetAction) => {
    dirty.current = true
    setMessage('')
    dispatch(action)
  }, [])

  const canLeave = () =>
    !busy && (!dirty.current || window.confirm('저장하지 않은 배합비가 있습니다. 변경사항을 버리고 이동할까요?'))

  const load = (record: FormulaRecord) => {
    dispatch({ type: 'load', sheet: record.sheet })
    setCompany(record.company)
    setTitle(record.title)
    setNoteId(record.noteId)
    setSaved({ id: record.id, version: record.version, updatedAt: record.updatedAt })
    dirty.current = false
    setError('')
    setLibraryOpen(false)
    setMessage(`‘${record.title}’ 을 불러왔습니다. (버전 ${record.version})`)
  }

  const reset = (next: FormulaSheet, notice: string) => {
    dispatch({ type: 'load', sheet: next })
    setSaved(null)
    dirty.current = false
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
      dirty.current = false
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
      if (!canLeave()) return
      const data = await fetchFormula(id)
      load(data.formula)
    })

  const openVersion = (version: number) =>
    run(async () => {
      if (!saved) return
      const data = await fetchVersionSheet(saved.id, version)
      dispatch({ type: 'load', sheet: data.sheet })
      dirty.current = true
      setMessage(`버전 ${version} 을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.`)
    })

  return (
    <div className="mx-auto flex max-w-[104rem] flex-col gap-4 px-4 py-5 lg:px-6">
      <header className="rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[10rem] flex-1">
            <span className="block text-[12px] font-medium text-ink-2">
              회사명 <span className="text-danger">*</span>
            </span>
            <input
              className={fieldClass}
              value={company}
              maxLength={100}
              placeholder="예: 하우랩"
              onChange={(event) => {
                dirty.current = true
                setCompany(event.target.value)
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
                dirty.current = true
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
                dirty.current = true
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
              onClick={() => {
                if (!canLeave()) return
                reset(emptySheet(), '새 배합비를 시작했습니다.')
                setCompany('')
                setTitle('')
                setNoteId(null)
              }}
              disabled={busy}
            >
              새로 만들기
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setLibraryOpen((open) => !open)}
              aria-expanded={libraryOpen}
            >
              저장된 배합비
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPriceBookOpen((open) => !open)}
              aria-expanded={priceBookOpen}
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
          refreshKey={refresh}
          currentId={saved?.id ?? null}
          onOpen={openFormula}
          onOpenVersion={openVersion}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}

      <SpecPanel spec={sheet.spec} totals={totals} dispatch={act} />

      <MaterialGrid
        materials={sheet.materials}
        totals={totals}
        lossPercent={sheet.spec.lossPercent}
        index={index}
        dispatch={act}
      />

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

      <LabelTable materials={totals.materials} intakeGuide={sheet.spec.intakeGuide} dispatch={act} />

      <SheetExportPanel sheet={sheet} totals={totals} tiers={tiers} />

      <label className="block rounded-lg border border-line bg-surface p-3">
        <span className="block text-[12px] font-medium text-ink-2">내부 메모 (고객용 PDF 에 들어가지 않습니다)</span>
        <textarea
          value={sheet.memo}
          rows={3}
          maxLength={5000}
          placeholder="원료 수급, 시험생산 조건, 고객 요청 등"
          onChange={(event) => act({ type: 'memo', value: event.target.value })}
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3"
        />
      </label>
    </div>
  )
}
