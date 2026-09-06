import type { FilterState } from './filters'
import { FORM_TYPES } from './types'
import { isRdaProfile } from './rda'

export type SavedSearchInput = {
  name: string; scope: 'private' | 'team'; filters: FilterState; rdaProfile: string
  generation: string | null; resultCount: number
}
export type SavedSearch = SavedSearchInput & { id: string; createdAt: string; canDelete: boolean }
export const validSearchId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('저장할 검색 조건을 확인해 주세요.')
  return value as Record<string, unknown>
}
const text = (v: unknown, max: number) => {
  if (typeof v !== 'string' || v.length > max) throw new Error('검색 조건의 글자 수를 확인해 주세요.')
  return v
}
const number = (v: unknown): number | null => {
  if (v === null) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('함량·중량 조건을 확인해 주세요.')
  return v
}
const list = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.length > 200) throw new Error('선택한 조건이 너무 많습니다.')
  return [...new Set(v.map(item => text(item, 500)))]
}
export function validateSavedSearch(value: unknown): SavedSearchInput {
  const body = object(value), f = object(body.filters)
  const forms = list(f.forms)
  if (forms.some(form => !(FORM_TYPES as readonly string[]).includes(form)) || !['all','any'].includes(String(f.mainMode))) throw new Error('제형·조합 조건을 확인해 주세요.')
  const marker = f.marker === null ? null : object(f.marker)
  const filters: FilterState = {
    query: text(f.query, 1000), mains: list(f.mains), mainMode: f.mainMode as 'all' | 'any',
    forms: forms as FilterState['forms'], manufacturers: list(f.manufacturers), subInclude: list(f.subInclude), subExclude: list(f.subExclude),
    weightMin: number(f.weightMin), weightMax: number(f.weightMax),
    marker: marker ? { name: text(marker.name, 500), unit: text(marker.unit, 50), min: number(marker.min), max: number(marker.max) } : null,
  }
  const name = text(body.name, 100).trim()
  if (!name || !['private','team'].includes(String(body.scope)) || !isRdaProfile(body.rdaProfile)) throw new Error('검색 이름·공개 범위·권장량 비교 대상을 확인해 주세요.')
  if (!Number.isSafeInteger(body.resultCount) || Number(body.resultCount) < 0) throw new Error('결과 건수를 확인해 주세요.')
  return { name, scope: body.scope as 'private' | 'team', filters, rdaProfile: body.rdaProfile,
    generation: body.generation === null ? null : text(body.generation, 150), resultCount: Number(body.resultCount) }
}
