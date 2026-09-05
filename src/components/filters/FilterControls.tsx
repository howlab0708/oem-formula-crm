'use client'

import { useRef, useState } from 'react'
import { filterChips, type FilterState } from '@/lib/filters'

type Props = {
  filters: FilterState
  history: FilterState[]
  activeCount: number
  onChange: (next: FilterState) => void
  onReset: () => void
  onRestore: (index: number) => void
}

function describeFilters(filters: FilterState) {
  const labels = filterChips(filters).map((chip) => `${chip.group} ${chip.label}`)
  if (filters.mains.length > 1) labels.push(filters.mainMode === 'all' ? '주원료 모두 포함' : '주원료 하나라도 포함')
  return labels.join(' · ') || '조건 없음 · 전체 레퍼런스'
}

export function FilterControls({ filters, history, activeCount, onChange, onReset, onRestore }: Props) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const chips = filterChips(filters)

  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          toggleRef.current?.focus()
        }
      }}>
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <h2 className="text-[13px] font-semibold text-ink">검색 조건</h2>
        <button ref={toggleRef} type="button" aria-expanded={open} aria-controls="filter-controls"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-surface-sunken">
          {activeCount > 0 ? `${activeCount}개 조건 관리` : '조건 내역'} <span aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
      </div>
      <div id="filter-controls" hidden={!open} className="max-h-[55vh] overflow-y-auto border-t border-line px-5 py-4">
        <section aria-label="선택한 조건">
          <h3 className="text-[12px] font-semibold text-ink">선택한 조건</h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-3">잘못 선택한 조건만 해제할 수 있습니다.</p>
          {chips.length ? <ul className="mt-2 space-y-1.5">
            {chips.map((chip) => (
              <li key={chip.key} className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2">
                <span className="min-w-0 flex-1 text-[12px] leading-5 text-ink">
                  <span className="mr-1 text-[11px] text-ink-3">{chip.group}</span>{chip.label}
                </span>
                <button type="button" aria-label={`${chip.group} ${chip.label}만 해제`}
                  onClick={() => { onChange(chip.remove(filters)); toggleRef.current?.focus() }}
                  className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-surface-sunken">해제</button>
              </li>
            ))}
          </ul> : <p className="mt-2 text-[12px] text-ink-3">선택한 조건이 없습니다.</p>}
        </section>

        <section aria-label="이전 선택 내역" className="mt-4 border-t border-line pt-4">
          <h3 className="text-[12px] font-semibold text-ink">이전 선택 내역</h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-3">선택하면 그때의 검색 조건으로 돌아갑니다.</p>
          {history.length ? <ol className="mt-2 space-y-1.5">
            {history.map((previous, index) => ({ previous, index })).reverse().map(({ previous, index }, order) => (
              <li key={index}>
                <button type="button" onClick={() => { onRestore(index); toggleRef.current?.focus() }}
                  className="w-full rounded-md border border-line px-2.5 py-2 text-left hover:border-accent-line hover:bg-accent-soft">
                  <span className="block text-[11px] font-medium text-accent-strong">{order === 0 ? '직전 조건으로 되돌리기' : `${order + 1}단계 전 조건으로 돌아가기`}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-ink-2">{describeFilters(previous)}</span>
                </button>
              </li>
            ))}
          </ol> : <p className="mt-2 text-[12px] text-ink-3">이전 선택 내역이 없습니다.</p>}
          <p className="mt-2 text-[10px] leading-4 text-ink-3">최근 20단계 · 새로고침하면 내역이 지워집니다.</p>
        </section>

        {chips.length ? <button type="button" onClick={() => { onReset(); toggleRef.current?.focus() }}
          className="mt-4 w-full rounded-md border border-line py-2 text-[11px] text-ink-2 hover:bg-surface-sunken">전체 조건 초기화</button> : null}
      </div>
    </div>
  )
}
