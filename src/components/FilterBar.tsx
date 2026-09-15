'use client'

import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import { RangeFields } from '@/components/filters/RangeFields'
import { TokenMultiSelect } from '@/components/filters/TokenMultiSelect'
import { FilterControls } from '@/components/filters/FilterControls'
import { SourceFormPicker } from '@/components/filters/SourceFormPicker'
import type { FilterState, Option } from '@/lib/filters'
import { formatInt } from '@/lib/format'
import type { SourceFormOption } from '@/lib/ingredientSource'
import type { FormType } from '@/lib/types'

export type MarkerOption = { name: string; unit: string; count: number }

type Props = {
  filters: FilterState
  onChange: (next: FilterState, group?: string) => void
  onReset: () => void
  history: FilterState[]
  onRestore: (index: number) => void
  onUndo: () => void
  onEndEdit: () => void
  /** 조건을 고르고 나면 좁은 화면에서는 결과로 돌아가야 한다. */
  onViewResults: () => void
  options: {
    mains: Option[]
    forms: Option[]
    manufacturers: Option[]
    subs: Option[]
    sourceNutrients: Array<{ value: string; count: number }>
    sourceForms: SourceFormOption[]
  }
  markers: MarkerOption[]
  /** 조건에 맞는 제품 수. 조건을 고른 다음 할 일을 버튼에 그대로 적는다. */
  resultCount: number
  /** 이미 제품 목록에 와 있는지. 그때는 같은 자리에서 시장 분석으로 되돌아간다. */
  atList: boolean
  onJump: () => void
}

/**
 * 조건 묶음 하나. 버튼은 줄에 눕고 내용은 예전처럼 모달로 열린다.
 * 무엇이 걸렸는지는 아래 `ActiveFilters` 줄이 낱개로 보여주므로
 * 여기서는 몇 개가 걸렸는지만 숫자로 붙인다.
 */
function FilterGroup({ title, summary, count, children, onViewResults }: {
  title: string; summary: string; count: number; children: ReactNode; onViewResults: () => void
}) {
  const [open, setOpen] = useState(false)
  const active = count > 0
  return <>
    <button type="button" aria-haspopup="dialog" title={summary} onClick={() => setOpen(true)}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors ${active
        ? 'border-accent-line bg-accent-soft font-medium text-accent-strong'
        : 'border-line text-ink hover:bg-surface-sunken'}`}>
      <span className="whitespace-nowrap">{title}</span>
      {active ? <span className="tnum rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-white">{count}</span> : null}
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 text-ink-3"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    {open ? <Modal title={title} onClose={() => setOpen(false)} footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3">선택한 조건은 고르는 즉시 결과에 반영됩니다.</span>
        <button type="button" onClick={() => { setOpen(false); onViewResults() }} className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-strong">완료</button>
      </div>
    }><div className="space-y-5 divide-y divide-line [&>div+div]:pt-5">{children}</div></Modal> : null}
  </>
}

/** 검색어와 결과 이동을 먼저 보여주고, 상세 조건은 아래에 모은다. */
export function FilterBar({ filters, onChange, onReset, history, onRestore, onUndo, onEndEdit, onViewResults, options, markers, resultCount, atList, onJump }: Props) {
  const patch = (next: Partial<FilterState>, group?: string) => onChange({ ...filters, ...next }, group)
  const markerKey = filters.marker ? `${filters.marker.name}|${filters.marker.unit}` : ''
  const mainSummary = [...filters.mains, ...filters.forms]
  const subSummary = [...filters.subInclude.map((value) => `포함 ${value}`), ...filters.subExclude.map((value) => `제외 ${value}`)]
  const sourceCount = filters.sourceForms.length + filters.sourceFormExclude.length + filters.sourceOrigins.length
  const extraCount = filters.manufacturers.length + Number(!!filters.marker) + Number(filters.weightMin !== null || filters.weightMax !== null)

  const showResults = () => {
    onEndEdit()
    if (!atList) onJump()
  }

  return (
    <section aria-label="검색 조건" onBlurCapture={onEndEdit} className="flex flex-col gap-3 py-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="query" className="text-[14px] font-semibold text-ink">제품·성분 검색</label>
        <span id="query-hint" className="hidden text-[12px] text-ink-3 sm:block">검색어와 조건은 입력 즉시 반영됩니다</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="relative min-w-0 flex-1">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-accent">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" />
          </svg>
          <input id="query" type="search" value={filters.query} aria-describedby="query-hint"
            onChange={(event) => patch({ query: event.target.value }, 'query')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                showResults()
              }
            }}
            placeholder="성분명, 제품명, 회사명으로 검색하세요"
            className="h-14 w-full min-w-0 rounded-xl border-2 border-accent-line bg-surface py-3 pr-4 pl-12 text-[16px] text-ink transition-colors placeholder:text-ink-3 hover:border-accent focus:border-accent focus:bg-accent-soft/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20" />
        </div>
        <button type="button" onClick={showResults}
          className="flex h-14 shrink-0 items-center justify-center gap-3 rounded-xl border-2 border-accent-line bg-surface px-6 text-[15px] font-semibold text-ink transition-colors hover:border-accent hover:bg-accent-soft/30">
          <span>검색 결과 보기</span>
          <span className="tnum border-l border-line pl-3 text-[13px] font-medium text-ink-2">{formatInt(resultCount)}건</span>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-accent"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] font-medium text-ink-2">상세 조건</span>
        <FilterGroup title="주원료 · 제형" onViewResults={onViewResults} count={mainSummary.length}
          summary={mainSummary.join(' · ') || '성분 조합과 제품 형태'}>
          <div>
            <TokenMultiSelect label="주원료 (기능성 성분)" options={options.mains} selected={filters.mains} onChange={(mains) => patch({ mains })} searchPlaceholder="성분 검색" visibleCount={6} />
            {filters.mains.length > 1 ? <div className="mt-3 flex items-center gap-2">
              <span className="text-[12px] text-ink-3">조합 방식</span>
              {([['all', '모두 포함'], ['any', '하나라도']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filters.mainMode === value} onClick={() => patch({ mainMode: value })}
                className={`rounded-md border px-2 py-1 text-[12px] ${filters.mainMode === value ? 'border-accent-line bg-accent-soft text-accent-strong' : 'border-line text-ink-2'}`}>{label}</button>)}
            </div> : null}
          </div>
          <div><TokenMultiSelect label="제형" options={options.forms} selected={filters.forms} onChange={(forms) => patch({ forms: forms as FormType[] })} visibleCount={6} /></div>
        </FilterGroup>

        <FilterGroup title="부원료 포함 · 제외" onViewResults={onViewResults} count={subSummary.length}
          summary={subSummary.join(' · ') || '필요한 원료와 제외할 원료'}>
          <div><TokenMultiSelect label="부원료 포함" options={options.subs} selected={filters.subInclude} onChange={(subInclude) => patch({ subInclude })} searchPlaceholder="포함할 부원료 검색" visibleCount={5} /></div>
          <div><TokenMultiSelect label="부원료 제외" options={options.subs} selected={filters.subExclude} onChange={(subExclude) => patch({ subExclude })} searchPlaceholder="제외할 부원료 검색" visibleCount={5} tone="danger" /></div>
        </FilterGroup>

        <FilterGroup title="원료 형태 · 기원" onViewResults={onViewResults} count={sourceCount + Number(!!filters.sourceNutrient)}
          summary={filters.sourceNutrient ? `${filters.sourceNutrient}${sourceCount ? ` · ${sourceCount}개 선택` : ''}` : sourceCount ? `${sourceCount}개 선택` : '영양성분별 공급 원료'}>
          <SourceFormPicker value={{ nutrient: filters.sourceNutrient, forms: filters.sourceForms, exclude: filters.sourceFormExclude, origins: filters.sourceOrigins }}
            onChange={(next) => patch({ sourceNutrient: next.nutrient, sourceForms: next.forms, sourceFormExclude: next.exclude, sourceOrigins: next.origins })}
            nutrients={options.sourceNutrients} forms={options.sourceForms} />
        </FilterGroup>

        <FilterGroup title="함량 · 규격 · 제조원" onViewResults={onViewResults} count={extraCount}
          summary={extraCount ? `${extraCount}개 조건 선택` : '수치 범위와 제조사 상세 선택'}>
          <div>
            <label htmlFor="marker" className="text-[13px] font-semibold text-ink">기능성 지표성분 함량</label>
            <select id="marker" value={markerKey} onChange={(event) => {
              const [name, unit] = event.target.value.split('|')
              patch({ marker: name ? { name, unit, min: null, max: null } : null })
            }} className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink">
              <option value="">지표성분 선택 안 함</option>
              {markers.map((marker) => <option key={`${marker.name}|${marker.unit}`} value={`${marker.name}|${marker.unit}`}>{marker.name} ({marker.unit}) · {formatInt(marker.count)}건</option>)}
            </select>
            <div className="mt-3"><RangeFields label="함량 범위" unit={filters.marker?.unit ?? '-'} min={filters.marker?.min ?? null} max={filters.marker?.max ?? null} disabled={!filters.marker}
              onChange={(min, max) => patch({ marker: filters.marker ? { ...filters.marker, min, max } : null }, 'marker-range')}
              hint={filters.marker ? undefined : '먼저 지표성분을 선택하세요.'} /></div>
          </div>
          <div><RangeFields label="규격 (1알 중량)" unit="mg" min={filters.weightMin} max={filters.weightMax}
            onChange={(weightMin, weightMax) => patch({ weightMin, weightMax }, 'weight-range')} hint="1알 중량이 확인된 정제·캡슐·환만 포함합니다." /></div>
          <div><TokenMultiSelect label="제조원" options={options.manufacturers} selected={filters.manufacturers} onChange={(manufacturers) => patch({ manufacturers })} searchPlaceholder="제조원 검색" visibleCount={5} /></div>
        </FilterGroup>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <FilterControls filters={filters} history={history} onChange={onChange} onReset={onReset} onRestore={onRestore} onUndo={onUndo} />
        {atList ? <button type="button" onClick={onJump} className="rounded-md px-2 py-2 text-[13px] font-medium text-accent-strong hover:bg-accent-soft">시장 분석 보기 ↑</button> : null}
      </div>
      </div>
    </section>
  )
}
