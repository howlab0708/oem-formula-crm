'use client'

import { useId, useMemo, useState } from 'react'
import { FoldButton } from '@/components/FoldButton'
import type { Option } from '@/lib/filters'
import { formatInt } from '@/lib/format'
import { compactSearchText } from '@/lib/ingredientNames'

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
  const [extraCount, setExtraCount] = useState(0)
  // 조건 레일이 길다. 지금 쓰지 않는 묶음은 제목 옆 버튼으로 통째로 접어 둘 수 있다.
  const [collapsed, setCollapsed] = useState(false)
  const bodyId = useId()

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = needle
      ? options.filter((option) => option.searchAliases
        ? [option.value, ...option.searchAliases].some((name) => compactSearchText(name).includes(compactSearchText(needle)))
        : option.value.toLowerCase().includes(needle))
      : options
    // 선택된 항목은 검색 결과와 무관하게 항상 위에 남긴다.
    const pinned = options.filter((option) => selectedSet.has(option.value))
    const rest = matched.filter((option) => !selectedSet.has(option.value))
    return [...pinned, ...rest]
  }, [options, query, selectedSet])

  const limit = (query.trim() ? 20 : visibleCount) + extraCount
  const shown = filtered.slice(0, limit)
  const hiddenCount = filtered.length - shown.length

  const toggle = (value: string) => {
    onChange(
      selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value],
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        {/* 제목 줄 전체가 여는 버튼이다. 손가락으로도 눌리도록 화살표와 여백을 넉넉히 준다. */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
        >
          <span
            aria-hidden
            className={`grid h-5 w-5 shrink-0 place-items-center text-[13px] text-ink-3 transition-transform ${
              collapsed ? '' : 'rotate-90'
            }`}
          >
            ▶
          </span>
          <span className="truncate">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
            >
              {selected.length}개 해제
            </button>
          ) : null}
          {/* 묶음 전체를 여닫는 버튼. 목록 아래의 `접기` 는 목록 길이만 줄인다. */}
          <FoldButton
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            label={`${label} 조건`}
            controls={bodyId}
          />
        </div>
      </div>

      <div id={bodyId} hidden={collapsed}>
        {hint ? <p className="mt-1 text-[12px] leading-4 text-ink-3">{hint}</p> : null}

        {options.length > visibleCount ? (
          <input
            type="search"
            aria-label={searchPlaceholder === '검색' ? `${label} 검색` : searchPlaceholder}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setExtraCount(0) }}
            placeholder={searchPlaceholder}
            className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3"
          />
        ) : null}

        <ul className="mt-2 flex max-h-64 flex-col gap-0.5 overflow-y-auto overscroll-contain">
          {shown.map((option) => {
            const isSelected = selectedSet.has(option.value)
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => toggle(option.value)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
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
                  <span className="shrink-0 text-[12px] text-ink-3 tnum">
                    {formatInt(option.count)}
                  </span>
                </button>
              </li>
            )
          })}
          {shown.length === 0 ? (
            <li className="px-2 py-2 text-[12px] text-ink-3">일치하는 항목이 없습니다.</li>
          ) : null}
        </ul>

        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExtraCount((count) => count + 40)}
            className="mt-1.5 text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            더 보기 · 남은 {formatInt(hiddenCount)}개
          </button>
        ) : null}

        {extraCount > 0 ? (
          <button
            type="button"
            onClick={() => setExtraCount(0)}
            className="mt-1.5 ml-2 text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            접기
          </button>
        ) : null}
      </div>
    </div>
  )
}
