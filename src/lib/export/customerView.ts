import type { Briefing } from './briefing'

export type ExportVisibility = { manufacturerCondition: boolean; manufacturers: boolean; subExclude: boolean }
export const DEFAULT_EXPORT_VISIBILITY: ExportVisibility = { manufacturerCondition: false, manufacturers: false, subExclude: false }
export const EXPORT_FIELDS: Array<{ key: keyof ExportVisibility; label: string }> = [
  { key: 'manufacturerCondition', label: '제조사 선택조건' },
  { key: 'manufacturers', label: '주요 제조원 목록 (텍스트)' },
  { key: 'subExclude', label: '부원료 제외조건' },
]
/** Redact the shared export model before text, clipboard, PNG and PDF renderers. */
export function customerBriefing(briefing: Briefing, enabled: boolean, hide: ExportVisibility): Briefing {
  if (!enabled) return briefing
  const conditions = briefing.conditions.filter(c => !(hide.manufacturerCondition && c.group === '제조원') && !(hide.subExclude && c.group === '부원료 제외'))
  if (!conditions.length && briefing.conditions.length) conditions.push({ group: '안내', label: '선택한 내부 조건 숨김 · 결과에는 적용됨' })
  return { ...briefing, conditions, topManufacturers: hide.manufacturers ? [] : briefing.topManufacturers }
}
