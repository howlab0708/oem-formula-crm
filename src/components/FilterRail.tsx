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
  onEndEdit: () => void
  onViewResults: () => void
  activeCount: number
  options: {
    mains: Option[]
    forms: Option[]
    manufacturers: Option[]
    subs: Option[]
    sourceNutrients: Array<{ value: string; count: number }>
    sourceForms: SourceFormOption[]
  }
  markers: MarkerOption[]
  savedSearches?: ReactNode
  importer: ReactNode
}

function FilterGroup({ title, summary, active, children, onViewResults }: {
  title: string; summary: string; active: boolean; children: ReactNode; onViewResults: () => void
}) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" aria-haspopup="dialog" title={summary} onClick={() => setOpen(true)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? 'border-accent-line bg-accent-soft' : 'border-line hover:bg-surface-sunken'}`}>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        {active ? <span className="mt-0.5 block truncate text-[12px] text-accent-strong">{summary}</span> : null}
      </span>
      <span aria-hidden className="text-ink-3">›</span>
    </button>
    {open ? <Modal title={title} onClose={() => setOpen(false)} footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-3">선택한 조건이 바로 반영됩니다.</span>
        <button type="button" onClick={() => { setOpen(false); onViewResults() }} className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-strong">결과 보기</button>
      </div>
    }><div className="space-y-5 divide-y divide-line [&>div+div]:pt-5">{children}</div></Modal> : null}
  </>
}

export function FilterRail({ filters, onChange, onReset, history, onRestore, onEndEdit, onViewResults, activeCount, options, markers, savedSearches, importer }: Props) {
  const patch = (next: Partial<FilterState>, group?: string) => onChange({ ...filters, ...next }, group)
  const markerKey = filters.marker ? `${filters.marker.name}|${filters.marker.unit}` : ''
  const mainSummary = [...filters.mains, ...filters.forms]
  const subSummary = [...filters.subInclude.map((value) => `포함 ${value}`), ...filters.subExclude.map((value) => `제외 ${value}`)]
  const sourceCount = filters.sourceForms.length + filters.sourceFormExclude.length + filters.sourceOrigins.length
  const extraCount = filters.manufacturers.length + Number(!!filters.marker) + Number(filters.weightMin !== null || filters.weightMax !== null)

  return (
    <aside aria-label="검색필터와 즐겨찾기" onBlurCapture={onEndEdit} className="flex h-full flex-col overflow-y-auto scroll-contain border-r border-line bg-surface">
      <div className="border-b border-line bg-surface-sunken p-4">{importer}</div>
      <div className="px-4 pb-3 pt-5">
        <h2 className="mb-3 text-[17px] font-semibold text-ink">검색필터</h2>
        <label htmlFor="query" className="mb-2 mt-3 block text-[12px] font-medium text-ink-2">제품명 · 브랜드명 · 제조원 검색</label>
        <input id="query" type="search" value={filters.query}
          onChange={(event) => patch({ query: event.target.value }, 'query')}
          placeholder="성분명, 제품명, 회사명 검색"
          className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3" />
      </div>
      {savedSearches}
      <section aria-label="상세 검색필터" className="space-y-2 border-t border-line px-4 py-4">
        <h3 className="mb-2 text-[13px] font-semibold text-ink">상세 필터</h3>
        <FilterGroup title="주원료 · 제형" onViewResults={onViewResults} active={mainSummary.length > 0} summary={mainSummary.join(' · ') || '성분 조합과 제품 형태'}>
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
        <FilterGroup title="부원료 포함 · 제외" onViewResults={onViewResults} active={subSummary.length > 0} summary={subSummary.join(' · ') || '필요한 원료와 제외할 원료'}>
          <div><TokenMultiSelect label="부원료 포함" options={options.subs} selected={filters.subInclude} onChange={(subInclude) => patch({ subInclude })} searchPlaceholder="포함할 부원료 검색" visibleCount={5} /></div>
          <div><TokenMultiSelect label="부원료 제외" options={options.subs} selected={filters.subExclude} onChange={(subExclude) => patch({ subExclude })} searchPlaceholder="제외할 부원료 검색" visibleCount={5} tone="danger" /></div>
        </FilterGroup>
        <FilterGroup title="원료 형태 · 기원" onViewResults={onViewResults} active={!!filters.sourceNutrient || sourceCount > 0} summary={filters.sourceNutrient ? `${filters.sourceNutrient}${sourceCount ? ` · ${sourceCount}개 선택` : ''}` : sourceCount ? `${sourceCount}개 선택` : '영양성분별 공급 원료'}>
          <SourceFormPicker value={{ nutrient: filters.sourceNutrient, forms: filters.sourceForms, exclude: filters.sourceFormExclude, origins: filters.sourceOrigins }}
            onChange={(next) => patch({ sourceNutrient: next.nutrient, sourceForms: next.forms, sourceFormExclude: next.exclude, sourceOrigins: next.origins })}
            nutrients={options.sourceNutrients} forms={options.sourceForms} />
        </FilterGroup>
        <FilterGroup title="함량 · 규격 · 제조원" onViewResults={onViewResults} active={extraCount > 0} summary={extraCount ? `${extraCount}개 조건 선택` : '수치 범위와 제조사 상세 선택'}>
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
      </section>
      <FilterControls filters={filters} history={history} activeCount={activeCount} onChange={onChange} onReset={onReset} onRestore={onRestore} />
    </aside>
  )
}
