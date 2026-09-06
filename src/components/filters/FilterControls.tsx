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
        <h2 className="text-[14px] font-semibold text-ink">검색 조건</h2>
        <button ref={toggleRef} type="button" aria-expanded={open} aria-controls="filter-controls"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken">
          {activeCount > 0 ? `${activeCount}개 조건 관리` : '조건 내역'} <span aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
      </div>
      <div className="flex gap-2 px-5 pb-4">
        <button type="button" disabled={history.length === 0}
          onClick={() => onRestore(history.length - 1)}
          className="flex-1 rounded-md border border-line px-2 py-2 text-[12px] text-ink-2 hover:bg-surface-sunken disabled:opacity-40">
          이전 항목
        </button>
        <button type="button" disabled={chips.length === 0} onClick={onReset}
          className="flex-1 rounded-md border border-line px-2 py-2 text-[12px] text-ink-2 hover:bg-surface-sunken disabled:opacity-40">
          전체 조건 초기화
        </button>
      </div>
      <div id="filter-controls" hidden={!open} className="max-h-[55vh] overflow-y-auto border-t border-line px-5 py-4">
        <section aria-label="선택한 조건">
          <h3 className="text-[13px] font-semibold text-ink">선택한 조건</h3>
          <p className="mt-1 text-[12px] leading-5 text-ink-3">잘못 선택한 조건만 해제할 수 있습니다.</p>
          {chips.length ? <ul className="mt-2 space-y-1.5">
            {chips.map((chip) => (
              <li key={chip.key} className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2">
                <span className="min-w-0 flex-1 text-[13px] leading-5 text-ink">
                  <span className="mr-1 text-[12px] text-ink-3">{chip.group}</span>{chip.label}
                </span>
                <button type="button" aria-label={`${chip.group} ${chip.label}만 해제`}
                  onClick={() => { onChange(chip.remove(filters)); toggleRef.current?.focus() }}
                  className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-sunken">해제</button>
              </li>
            ))}
          </ul> : <p className="mt-2 text-[13px] text-ink-3">선택한 조건이 없습니다.</p>}
        </section>

      </div>
    </div>
  )
}
