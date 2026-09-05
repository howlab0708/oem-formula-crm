import { EMPTY_FILTERS, type FilterState } from './filters'

export const FILTER_HISTORY_LIMIT = 20
export type FilterUpdate = FilterState | ((previous: FilterState) => FilterState)
export type FilterHistory = {
  current: FilterState
  previous: FilterState[]
  editing: string | null
}
export type FilterHistoryAction =
  | { type: 'change'; update: FilterUpdate; group?: string }
  | { type: 'restore'; index: number }
  | { type: 'end-edit' }
  | { type: 'clear' }

export const INITIAL_FILTER_HISTORY: FilterHistory = { current: EMPTY_FILTERS, previous: [], editing: null }

// 검색 조건만 보관한다. 제품 데이터나 영구 저장소는 사용하지 않는다.
export function filterHistoryReducer(state: FilterHistory, action: FilterHistoryAction): FilterHistory {
  if (action.type === 'clear') return INITIAL_FILTER_HISTORY
  if (action.type === 'end-edit') return state.editing === null ? state : { ...state, editing: null }
  if (action.type === 'restore') {
    const current = state.previous[action.index]
    if (!current) return state
    return { current, previous: state.previous.slice(0, action.index), editing: null }
  }
  const current = typeof action.update === 'function' ? action.update(state.current) : action.update
  if (JSON.stringify(current) === JSON.stringify(state.current)) return state
  const continuingEdit = action.group !== undefined && action.group === state.editing
  return {
    current,
    previous: continuingEdit ? state.previous : [...state.previous, state.current].slice(-FILTER_HISTORY_LIMIT),
    editing: action.group ?? null,
  }
}
