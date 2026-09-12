'use client'

import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { filterChips, type FilterState } from '@/lib/filters'

type Props = {
  filters: FilterState
  history: FilterState[]
  activeCount: number
  onChange: (next: FilterState) => void
  onReset: () => void
  onRestore: (index: number) => void
  onUndo: () => void
}

function describe(filters: FilterState) {
  return filterChips(filters).map((chip) => `${chip.group}: ${chip.label}`).join(' · ') || '전체 제품'
}

export function FilterControls({ filters, history, activeCount, onChange, onReset, onRestore, onUndo }: Props) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const chips = filterChips(filters)
  const entries = history.map((snapshot, index) => ({ snapshot, index })).reverse()

  return (
    <section aria-label="선택한 검색 조건" className="border-t border-line bg-surface-muted px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">선택한 조건 {activeCount > 0 ? `${activeCount}개` : ''}</h3>
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}
          className="rounded-md px-2 py-1 text-[12px] font-medium text-accent-strong hover:bg-accent-soft">기록 ↗</button>
      </div>
      {chips.length > 0 ? <>
        <p className="mt-1 text-[12px] text-ink-3">체크를 해제하면 해당 조건만 풀립니다.</p>
        <ul ref={listRef} className="mt-2 max-h-44 space-y-1 overflow-y-auto">
          {chips.map((chip, index) => <li key={chip.key}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-accent-line bg-surface px-2.5 py-2 hover:bg-accent-soft">
              <input type="checkbox" checked aria-label={`${chip.group} ${chip.label}`} className="mt-0.5 size-4 shrink-0 accent-accent"
                onChange={() => {
                  onChange(chip.remove(filters))
                  requestAnimationFrame(() => {
                    const remaining = listRef.current?.querySelectorAll<HTMLInputElement>('input')
                    if (remaining?.length) remaining[Math.min(index, remaining.length - 1)].focus()
                    else undoRef.current?.focus()
                  })
                }} />
              <span className="min-w-0 break-words text-[13px] leading-5 text-ink"><span className="mr-1 text-[12px] text-ink-3">{chip.group}</span>{chip.label}</span>
            </label>
          </li>)}
        </ul>
      </> : <p className="mt-2 text-[12px] text-ink-3">선택한 조건 없이 전체 제품을 보고 있습니다.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button ref={undoRef} type="button" disabled={!history.length} onClick={onUndo}
          className="rounded-md border border-line-strong bg-surface px-2 py-2 text-[13px] font-medium text-ink-2 hover:bg-accent-soft disabled:opacity-40">
          <span aria-hidden>← </span>이전 조건
        </button>
        <button type="button" disabled={!chips.length} onClick={onReset}
          className="rounded-md border border-line-strong bg-surface px-2 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-sunken disabled:opacity-40">전체 초기화</button>
      </div>
      {open ? <Modal title="검색 히스토리" onClose={() => setOpen(false)}>
        <section className="rounded-lg border border-accent-line bg-accent-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-accent-strong">현재 검색</h3>
            <button type="button" disabled={!chips.length} onClick={onReset}
              className="rounded-md border border-accent-line bg-surface px-2 py-1 text-[12px] text-ink-2 disabled:opacity-40">전체 초기화</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.length ? chips.map((chip) => <button type="button" key={chip.key} onClick={() => onChange(chip.remove(filters))}
              aria-label={`${chip.group} ${chip.label} 해제`}
              className="rounded-md border border-accent-line bg-surface px-2 py-1 text-left text-[13px] text-ink">
              <span className="mr-1 text-ink-3">{chip.group}</span>{chip.label} ×
            </button>) : <p className="text-[13px] text-ink-2">전체 제품</p>}
          </div>
        </section>
        <p className="mb-4 mt-5 text-[12px] text-ink-3">최근 검색 순서입니다. 원하는 조건으로 돌아가도 기록은 남습니다. (최근 20개)</p>
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {entries.map(({ snapshot, index }) => <li key={index} className="rounded-lg border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink-3">{index === history.length - 1 ? '직전 검색' : `${history.length - index}단계 전`}</span>
              <button type="button" onClick={() => { onRestore(index); setOpen(false) }}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-accent-strong hover:bg-accent-soft">이 조건으로 검색</button>
            </div>
            <p className="break-words text-[13px] leading-6 text-ink-2">{describe(snapshot)}</p>
          </li>)}
        </ol>
        {!entries.length ? <p className="py-6 text-center text-[13px] text-ink-3">조건을 선택하면 검색 기록이 여기에 쌓입니다.</p> : null}
      </Modal> : null}
    </section>
  )
}
