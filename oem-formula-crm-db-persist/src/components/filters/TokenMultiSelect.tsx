'use client'

import { useMemo, useState } from 'react'
import type { Option } from '@/lib/filters'
import { formatInt } from '@/lib/format'

type Props = {
  label: string
  options: Option[]
  selected: string[]
  onChange: (next: string[]) => void
  searchPlaceholder?: string
  /** 검색 없이 기본으로 보여줄 항목 수 */
  visibleCount?: number
  /** 선택 항목을 붉은 계열로 표시(제외 조건용) */
  tone?: 'accent' | 'danger'
  hint?: string
}

/**
 * 검색 가능한 다중 선택.
 * 옵션은 전체 데이터 기준 건수와 함께 보여준다 - 영업 담당자가 "이 조건이
 * 시장에 몇 건이나 있는지" 를 고르기 전에 알 수 있어야 한다.
 */
export function TokenMultiSelect({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = '검색',
  visibleCount = 8,
  tone = 'accent',
  hint,
}: Props) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = needle
      ? options.filter((option) => option.value.toLowerCase().includes(needle))
      : options
    // 선택된 항목은 검색 결과와 무관하게 항상 위에 남긴다.
    const pinned = options.filter((option) => selectedSet.has(option.value))
    const rest = matched.filter((option) => !selectedSet.has(option.value))
    return [...pinned, ...rest]
  }, [options, query, selectedSet])

  const limit = expanded || query.trim() ? filtered.length : visibleCount
  const shown = filtered.slice(0, limit)
  const hiddenCount = filtered.length - shown.length

  const toggle = (value: string) => {
    onChange(
      selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value],
    )
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[12px] font-semibold text-ink">{label}</label>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            {selected.length}개 해제
          </button>
        ) : null}
      </div>

      {hint ? <p className="mt-1 text-[11px] leading-4 text-ink-3">{hint}</p> : null}

      {options.length > visibleCount ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-3"
        />
      ) : null}

      <ul className="mt-2 flex flex-col gap-0.5">
        {shown.map((option) => {
          const isSelected = selectedSet.has(option.value)
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => toggle(option.value)}
                aria-pressed={isSelected}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                  isSelected
                    ? tone === 'danger'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-accent-soft text-accent-strong'
                    : 'text-ink-2 hover:bg-surface-sunken'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`inline-block h-3 w-3 shrink-0 rounded-[3px] border ${
                      isSelected
                        ? tone === 'danger'
                          ? 'border-danger bg-danger'
                          : 'border-accent bg-accent'
                        : 'border-line-strong bg-surface'
                    }`}
                  />
                  <span className="truncate" title={option.value}>
                    {option.value}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-3 tnum">
                  {formatInt(option.count)}
                </span>
              </button>
            </li>
          )
        })}
        {shown.length === 0 ? (
          <li className="px-2 py-2 text-[11px] text-ink-3">일치하는 항목이 없습니다.</li>
        ) : null}
      </ul>

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 text-[11px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          {formatInt(hiddenCount)}개 더 보기
        </button>
      ) : null}

      {expanded && !query.trim() && filtered.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1.5 ml-2 text-[11px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          접기
        </button>
      ) : null}
    </div>
  )
}
