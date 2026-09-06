'use client'

import { filterChips, type FilterState } from '@/lib/filters'

type Props = {
  filters: FilterState
  onChange: (next: FilterState) => void
  onReset: () => void
}

/**
 * 현재 걸린 조건 줄. 대시보드와 리스트 위에 한 줄로 두어
 * "지금 보고 있는 것이 무엇의 결과인가" 를 화면에서 잃지 않게 한다.
 */
export function ActiveFilters({ filters, onChange, onReset }: Props) {
  const chips = filterChips(filters)
  if (chips.length === 0) {
    return (
      <p className="text-[13px] text-ink-3">
        조건 없음 · 전체 레퍼런스를 기준으로 시장 평균을 보여줍니다.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.remove(filters))}
          className="group flex items-center gap-1.5 rounded-md border border-line bg-surface py-1 pr-1.5 pl-2 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
        >
          <span className="text-ink-3">{chip.group}</span>
          <span className="font-medium text-ink">{chip.label}</span>
          <span aria-hidden className="text-ink-3 group-hover:text-ink">
            ×
          </span>
          <span className="sr-only">조건 제거</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onReset}
        className="ml-1 text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
      >
        전체 해제
      </button>
    </div>
  )
}
