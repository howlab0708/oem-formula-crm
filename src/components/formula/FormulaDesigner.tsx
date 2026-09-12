'use client'

import { useCallback, useEffect, useImperativeHandle, useReducer, useRef, type Ref } from 'react'
import type { Product } from '@/lib/types'
import type { FormulaRecord } from '@/lib/formulaDesign/types'
import {
  createFormulaWorkspace, duplicateFormulaDraft, formulaReferenceKey, formulaWorkspaceReducer,
  newFormulaDraft, recordFormulaDraft, type FormulaTabMeta,
} from '@/lib/formulaDesign/workspace'
import { FormulaSheetEditor, type FormulaSheetEditorHandle } from './FormulaSheetEditor'

export type FormulaDesignerHandle = { importProduct: (product: Product) => Promise<boolean> }
type Props = {
  referenceNames: string[]
  initialProduct?: Product | null
  editorRef?: Ref<FormulaDesignerHandle>
  onBackToReference?: (product: Product | null) => void
}

const buttonClass = 'shrink-0 rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50'

export default function FormulaDesigner({ referenceNames, initialProduct, editorRef, onBackToReference }: Props) {
  const [workspace, dispatch] = useReducer(formulaWorkspaceReducer, initialProduct, product => createFormulaWorkspace(newFormulaDraft(product)))
  const editors = useRef(new Map<string, FormulaSheetEditorHandle>())
  const tabButtons = useRef(new Map<string, HTMLButtonElement>())
  const active = workspace.tabs.find(tab => tab.id === workspace.activeId)!

  const newSheet = useCallback(() => dispatch({ type: 'open', draft: newFormulaDraft() }), [])
  const openRecord = useCallback((record: FormulaRecord) => dispatch({ type: 'open', draft: recordFormulaDraft(record) }), [])
  const updateMetadata = useCallback((id: string, meta: FormulaTabMeta) => dispatch({ type: 'metadata', id, meta }), [])

  useImperativeHandle(editorRef, () => ({
    async importProduct(product) {
      const key = formulaReferenceKey(product)
      // 이미 열린 제품은 입력 내용을 유지하고 그 시트로 이동한다.
      const existing = workspace.tabs.find(tab => tab.meta.referenceKey === key)
      if (existing) {
        dispatch({ type: 'activate', id: existing.id })
        editors.current.get(existing.id)?.refreshReference(product)
      } else {
        dispatch({ type: 'open', draft: newFormulaDraft(product) })
      }
      return true
    },
  }))

  // 가로로 많은 시트를 열어도 선택한 탭이 보이도록 탭 목록만 스크롤한다.
  useEffect(() => {
    const button = tabButtons.current.get(workspace.activeId)
    const strip = button?.closest<HTMLElement>('[role="tablist"]')
    if (!button || !strip) return
    strip.closest<HTMLElement>('[role="tabpanel"]')?.scrollTo({ top: 0 })
    const box = button.getBoundingClientRect()
    const viewport = strip.getBoundingClientRect()
    if (box.left < viewport.left) strip.scrollLeft -= viewport.left - box.left
    else if (box.right > viewport.right) strip.scrollLeft += box.right - viewport.right
  }, [workspace.activeId])

  const closeSheet = (id: string) => {
    if (!editors.current.get(id)?.canClose()) return
    dispatch({ type: 'close', id, emptyDraft: newFormulaDraft() })
  }

  return <>
    <div data-formula-workspace-toolbar className="sticky top-0 z-20 border-b border-line bg-canvas">
      <div className="mx-auto max-w-[104rem] px-4 pt-4 pb-3 lg:px-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[14px] font-semibold text-ink">배합 설계 시트 <span className="ml-1 font-normal text-ink-3">{workspace.tabs.length}개</span></p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} disabled={active.meta.busy} onClick={() => {
              const draft = editors.current.get(workspace.activeId)?.snapshot()
              if (draft) dispatch({ type: 'open', draft: duplicateFormulaDraft(draft) })
            }}>현재 시트 복제</button>
            <button type="button" onClick={newSheet} className="shrink-0 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-strong">+ 새 시트</button>
          </div>
        </div>
        <div role="tablist" aria-label="배합 설계 시트" className="flex gap-2 overflow-x-auto pb-1">
          {workspace.tabs.map((tab, index) => {
            const selected = tab.id === workspace.activeId
            const label = tab.meta.title.trim() || `시트 ${tab.number}`
            return <div key={tab.id} role="presentation" className={`flex shrink-0 items-center rounded-lg border ${selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
              <button ref={node => { if (node) tabButtons.current.set(tab.id, node); else tabButtons.current.delete(tab.id) }}
                id={`formula-tab-${tab.id}`} type="button" role="tab" aria-selected={selected}
                aria-controls={`formula-panel-${tab.id}`} tabIndex={selected ? 0 : -1}
                title={`${label}${tab.meta.dirty ? ' · 저장하지 않은 변경사항' : ''}`}
                onClick={() => dispatch({ type: 'activate', id: tab.id })}
                onKeyDown={event => {
                  const target = event.key === 'ArrowRight' ? (index + 1) % workspace.tabs.length
                    : event.key === 'ArrowLeft' ? (index - 1 + workspace.tabs.length) % workspace.tabs.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? workspace.tabs.length - 1 : null
                  if (target === null) return
                  event.preventDefault()
                  const next = workspace.tabs[target].id
                  dispatch({ type: 'activate', id: next })
                  tabButtons.current.get(next)?.focus({ preventScroll: true })
                }}
                className={`flex min-w-24 max-w-72 items-center gap-2 rounded-l-lg px-3 py-2.5 text-left text-[13px] ${selected ? 'font-semibold text-accent-strong' : 'text-ink-2 hover:text-ink'}`}>
                <span className="truncate">{label}</span>
                {tab.meta.dirty ? <span aria-label="저장 안 됨" className="shrink-0 text-accent">●</span> : null}
              </button>
              <button type="button" aria-label={`${label} 시트 닫기`} title="시트 닫기" disabled={tab.meta.busy}
                onClick={() => closeSheet(tab.id)} className="mr-1 rounded px-2 py-1 text-[16px] text-ink-3 hover:bg-surface-sunken hover:text-ink disabled:opacity-40">×</button>
            </div>
          })}
        </div>
        <p className="mt-1 text-[12px] text-ink-3">제품을 가져오면 새 시트로 열립니다. 시트를 오가도 입력 내용은 유지되며, 저장은 각 시트에서 진행합니다.</p>
      </div>
    </div>
    {workspace.tabs.map(tab => <div key={tab.id} id={`formula-panel-${tab.id}`} role="tabpanel" aria-labelledby={`formula-tab-${tab.id}`} hidden={tab.id !== workspace.activeId}>
      <FormulaSheetEditor tabId={tab.id} active={tab.id === workspace.activeId}
      initialDraft={tab.initialDraft} referenceNames={referenceNames}
      editorRef={handle => { if (handle) editors.current.set(tab.id, handle); else editors.current.delete(tab.id) }}
      onMetadata={updateMetadata} onNewSheet={newSheet} onOpenRecord={openRecord} onBackToReference={onBackToReference} /></div>)}
  </>
}
