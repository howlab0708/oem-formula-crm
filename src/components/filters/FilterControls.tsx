'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { filterChips, type FilterState } from '@/lib/filters'

type Props = {
  filters: FilterState
  history: FilterState[]
  onChange: (next: FilterState) => void
  onReset: () => void
  onRestore: (index: number) => void
  onUndo: () => void
}

function describe(filters: FilterState) {
  return filterChips(filters).map((chip) => `${chip.group}: ${chip.label}`).join(' · ') || '전체 제품'
}

// 누를 수 있는 글자는 설명문보다 진하게 둔다. 둘이 같은 회색이면 구분이 안 된다.
const link = 'rounded-md px-2 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken hover:underline disabled:pointer-events-none disabled:opacity-40'

/**
 * 조건 줄 오른쪽 끝의 되돌리기·기록·초기화.
 *
 * 걸린 조건을 낱개로 보여주는 일은 본문의 `ActiveFilters` 가 한다 -
 * 여기서 한 번 더 나열하면 같은 목록이 화면에 두 벌 생긴다.
 */
export function FilterControls({ filters, history, onChange, onReset, onRestore, onUndo }: Props) {
  const [open, setOpen] = useState(false)
  const chips = filterChips(filters)
  const entries = history.map((snapshot, index) => ({ snapshot, index })).reverse()

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {history.length ? (
        <button type="button" onClick={onUndo} className={link}><span aria-hidden>← </span>이전 조건</button>
      ) : null}
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={link}>최근 검색</button>
      <span aria-hidden className="h-3 w-px bg-line" />
      <button type="button" disabled={!chips.length} onClick={onReset} className={link}>초기화</button>

      {open ? <Modal title="최근 검색" onClose={() => setOpen(false)}>
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
    </div>
  )
}
