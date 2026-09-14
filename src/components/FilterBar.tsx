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
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors ${active
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

/**
 * 본문 맨 위의 조건 줄.
 *
 * 예전 좌측 조건 레일이 하던 일을 그대로 한다 - 자유 검색, 조건 묶음 4개,
 * 되돌리기·히스토리·초기화. 레일이 차지하던 한 칸을 본문에 돌려주고
 * 사이드바(화면 전환·즐겨찾기·데이터)와 역할이 겹치지 않게 갈랐다.
 */
export function FilterBar({ filters, onChange, onReset, history, onRestore, onUndo, onEndEdit, onViewResults, options, markers, resultCount, atList, onJump }: Props) {
  const patch = (next: Partial<FilterState>, group?: string) => onChange({ ...filters, ...next }, group)
  const markerKey = filters.marker ? `${filters.marker.name}|${filters.marker.unit}` : ''
  const mainSummary = [...filters.mains, ...filters.forms]
  const subSummary = [...filters.subInclude.map((value) => `포함 ${value}`), ...filters.subExclude.map((value) => `제외 ${value}`)]
  const sourceCount = filters.sourceForms.length + filters.sourceFormExclude.length + filters.sourceOrigins.length
  const extraCount = filters.manufacturers.length + Number(!!filters.marker) + Number(filters.weightMin !== null || filters.weightMax !== null)

  /*
   * 한 줄에 다 들어가지 않으면 아무 데서나 접히지 않고 두 줄로 나뉜다 -
   * 위는 '무엇으로 찾을지'(검색어·조건), 아래는 '찾은 다음 할 일'(기록·초기화·결과 보기).
   */
  return (
    <section aria-label="검색 조건" onBlurCapture={onEndEdit} className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
      <div className="flex flex-wrap items-center gap-2 2xl:flex-1">
      <label htmlFor="query" className="sr-only">제품명 · 브랜드명 · 제조원 검색</label>
      <input id="query" type="search" value={filters.query}
        onChange={(event) => patch({ query: event.target.value }, 'query')}
        placeholder="성분명, 제품명, 회사명 검색"
        className="h-9 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-3 sm:w-[17rem]" />

      <div aria-hidden className="hidden h-5 w-px bg-line sm:block" />

      <div className="flex flex-wrap items-center gap-1.5">
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
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <FilterControls filters={filters} history={history} onChange={onChange} onReset={onReset} onRestore={onRestore} onUndo={onUndo} />
        {/* 조건을 고른 다음 할 일. 이 화면에서 가장 중요한 단추이므로 색을 채운다. */}
        <button type="button" onClick={onJump}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong">
          {atList ? '시장 분석 보기' : `검색 결과 ${formatInt(resultCount)}건 보기`}
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            {atList ? <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></> : <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>}
          </svg>
        </button>
      </div>
    </section>
  )
}
