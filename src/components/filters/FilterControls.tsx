'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { filterChips, type FilterState } from '@/lib/filters'

type Props = {
  filters: FilterState
  history: FilterState[]
  activeCount: number
  onChange: (next: FilterState) => void
  onReset: () => void
  onRestore: (index: number) => void
}

function describe(filters: FilterState) {
  return filterChips(filters).map((chip) => `${chip.group}: ${chip.label}`).join(' · ') || '전체 제품'
}

export function FilterControls({ filters, history, activeCount, onChange, onReset, onRestore }: Props) {
  const [open, setOpen] = useState(false)
  const chips = filterChips(filters)
  const entries = history.map((snapshot, index) => ({ snapshot, index })).reverse()

  return (
    <section aria-label="검색 히스토리" className="border-t border-line px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-ink-2">적용 중 {activeCount > 0 ? `${activeCount}개` : '전체 제품'}</h3>
        <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}
          className="rounded-md px-2 py-1 text-[12px] font-medium text-accent-strong hover:bg-accent-soft">검색 히스토리 ↗</button>
      </div>
      {chips.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">
        {chips.slice(0, 3).map((chip) => <button key={chip.key} type="button" onClick={() => onChange(chip.remove(filters))}
          aria-label={`${chip.group} ${chip.label} 해제`} title={`${chip.group}: ${chip.label}`}
          className="max-w-full truncate rounded-md bg-accent-soft px-2 py-1 text-[12px] text-accent-strong">{chip.label} ×</button>)}
        {chips.length > 3 ? <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="text-[12px] text-ink-3">+{chips.length - 3}개</button> : null}
      </div> : null}
      {entries.length > 0 ? <ol className="mt-3 space-y-2 border-l border-line-strong pl-3">
        {entries.slice(0, 2).map(({ snapshot, index }) => <li key={index}>
          <button type="button" onClick={() => onRestore(index)} title={describe(snapshot)}
            className="block w-full truncate text-left text-[12px] text-ink-3 hover:text-accent-strong">
            <span className="mr-1.5 text-ink-2">{index === history.length - 1 ? '직전' : '이전'}</span>{describe(snapshot)}
          </button>
        </li>)}
      </ol> : null}
      {open ? <Modal title="검색 히스토리" onClose={() => setOpen(false)}>
        <section className="rounded-lg border border-accent-line bg-accent-soft p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-accent-strong">현재 검색</h3>
            <button type="button" disabled={!chips.length} onClick={onReset}
              className="rounded-md border border-accent-line bg-surface px-2 py-1 text-[12px] text-ink-2 disabled:opacity-40">조건 비우기</button>
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
