'use client'

import type { ReactNode } from 'react'
import { RangeFields } from '@/components/filters/RangeFields'
import { TokenMultiSelect } from '@/components/filters/TokenMultiSelect'
import type { FilterState, Option } from '@/lib/filters'
import { formatInt } from '@/lib/format'
import type { FormType } from '@/lib/types'

export type MarkerOption = { name: string; unit: string; count: number }

type Props = {
  filters: FilterState
  onChange: (next: FilterState) => void
  onReset: () => void
  activeCount: number
  options: {
    mains: Option[]
    forms: Option[]
    manufacturers: Option[]
    subs: Option[]
  }
  markers: MarkerOption[]
  importer: ReactNode
}

function Section({ children }: { children: ReactNode }) {
  return <div className="border-t border-line px-5 py-5 first:border-t-0">{children}</div>
}

export function FilterRail({
  filters,
  onChange,
  onReset,
  activeCount,
  options,
  markers,
  importer,
}: Props) {
  const patch = (next: Partial<FilterState>) => onChange({ ...filters, ...next })

  const markerKey = filters.marker ? `${filters.marker.name}|${filters.marker.unit}` : ''

  return (
    <aside className="flex h-full flex-col overflow-y-auto scroll-contain border-r border-line bg-surface">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface px-5 py-4">
        <h2 className="text-[13px] font-semibold text-ink">검색 조건</h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            {activeCount}개 조건 초기화
          </button>
        ) : (
          <span className="text-[11px] text-ink-3">조건 없음</span>
        )}
      </div>

      <Section>
        <label htmlFor="query" className="text-[12px] font-semibold text-ink">
          제품명 · 제조원 검색
        </label>
        <input
          id="query"
          type="search"
          value={filters.query}
          onChange={(event) => patch({ query: event.target.value })}
          placeholder="예: 밀크씨슬, 서흥"
          className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[12px] text-ink placeholder:text-ink-3"
        />
      </Section>

      <Section>
        <TokenMultiSelect
          label="주원료 (기능성 성분)"
          options={options.mains}
          selected={filters.mains}
          onChange={(mains) => patch({ mains })}
          searchPlaceholder="성분 검색"
          visibleCount={8}
        />
        {filters.mains.length > 1 ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-ink-3">조합 방식</span>
            <div className="flex rounded-md border border-line p-0.5">
              {(
                [
                  ['all', '모두 포함'],
                  ['any', '하나라도'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filters.mainMode === value}
                  onClick={() => patch({ mainMode: value })}
                  className={`rounded-[5px] px-2 py-1 text-[11px] transition-colors ${
                    filters.mainMode === value
                      ? 'bg-surface-sunken font-medium text-ink'
                      : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section>
        <TokenMultiSelect
          label="제형"
          options={options.forms}
          selected={filters.forms}
          onChange={(forms) => patch({ forms: forms as FormType[] })}
          visibleCount={9}
        />
      </Section>

      <Section>
        <TokenMultiSelect
          label="제조원"
          options={options.manufacturers}
          selected={filters.manufacturers}
          onChange={(manufacturers) => patch({ manufacturers })}
          searchPlaceholder="제조원 검색"
          visibleCount={6}
        />
      </Section>

      <Section>
        <label htmlFor="marker" className="text-[12px] font-semibold text-ink">
          기능성 지표성분 함량
        </label>
        <p className="mt-1 text-[11px] leading-4 text-ink-3 keep-all">
          지표성분을 고르면 대시보드의 함량 분포도 같은 성분으로 바뀝니다.
        </p>
        <select
          id="marker"
          value={markerKey}
          onChange={(event) => {
            const value = event.target.value
            if (!value) {
              patch({ marker: null })
              return
            }
            const [name, unit] = value.split('|')
            patch({ marker: { name, unit, min: null, max: null } })
          }}
          className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[12px] text-ink"
        >
          <option value="">지표성분 선택 안 함</option>
          {markers.map((marker) => (
            <option key={`${marker.name}|${marker.unit}`} value={`${marker.name}|${marker.unit}`}>
              {marker.name} ({marker.unit}) · {formatInt(marker.count)}건
            </option>
          ))}
        </select>

        <div className="mt-3">
          <RangeFields
            label="함량 범위"
            unit={filters.marker?.unit ?? '-'}
            min={filters.marker?.min ?? null}
            max={filters.marker?.max ?? null}
            disabled={!filters.marker}
            onChange={(min, max) =>
              patch({ marker: filters.marker ? { ...filters.marker, min, max } : null })
            }
            hint={filters.marker ? undefined : '먼저 지표성분을 선택하세요.'}
          />
        </div>
      </Section>

      <Section>
        <RangeFields
          label="규격 (1알 중량)"
          unit="mg"
          min={filters.weightMin}
          max={filters.weightMax}
          onChange={(weightMin, weightMax) => patch({ weightMin, weightMax })}
          hint="1알 중량이 확인된 정제·캡슐·환만 포함합니다."
        />
      </Section>

      <Section>
        <TokenMultiSelect
          label="부원료 포함"
          options={options.subs}
          selected={filters.subInclude}
          onChange={(subInclude) => patch({ subInclude })}
          searchPlaceholder="부원료 검색"
          visibleCount={6}
        />
        <div className="mt-5">
          <TokenMultiSelect
            label="부원료 제외"
            options={options.subs}
            selected={filters.subExclude}
            onChange={(subExclude) => patch({ subExclude })}
            searchPlaceholder="제외할 부원료 검색"
            visibleCount={4}
            tone="danger"
            hint="고객사 금지 원료를 빼고 레퍼런스를 볼 때 씁니다."
          />
        </div>
      </Section>

      <Section>{importer}</Section>
    </aside>
  )
}
