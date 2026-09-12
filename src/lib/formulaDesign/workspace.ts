import type { Product } from '../types'
import type { SheetExportOptions } from '../export/renderFormulaSheet'
import { draftFromProduct } from './fromProduct'
import { emptySheet } from './preset'
import type { FormulaRecord, FormulaSheet } from './types'

export type FormulaDraft = {
  sheet: FormulaSheet
  reference: Product | null
  company: string
  title: string
  noteId: string | null
  saved: Pick<FormulaRecord, 'id' | 'version' | 'updatedAt'> | null
  dirty: boolean
  exportOptions?: SheetExportOptions
}

export function newFormulaDraft(product?: Product | null): FormulaDraft {
  const imported = product ? draftFromProduct(product) : null
  return { sheet: imported?.sheet ?? emptySheet(), reference: product ?? null, company: '',
    title: imported?.title ?? '', noteId: null, saved: null, dirty: Boolean(product) }
}

export function recordFormulaDraft(record: FormulaRecord): FormulaDraft {
  return { sheet: structuredClone(record.sheet), reference: null, company: record.company, title: record.title,
    noteId: record.noteId, saved: { id: record.id, version: record.version, updatedAt: record.updatedAt }, dirty: false }
}

/** 사본은 새 저장 항목이다. 원본의 서버 id·버전을 이어받아 덮어쓰지 않는다. */
export function duplicateFormulaDraft(draft: FormulaDraft): FormulaDraft {
  return { ...structuredClone(draft), title: `${draft.title.trim() || draft.sheet.spec.productName || '배합비'} · 사본`.slice(0, 150), saved: null, dirty: true }
}

/** CSV 행 id는 데이터 교체 시 재사용되므로 신고번호·제조소·제품명까지 대조한다. */
export function formulaReferenceKey(product: Product | null): string | null {
  return product ? JSON.stringify([product.id, product.reportNo ?? '', product.manufacturer, product.name]) : null
}

export type FormulaTabMeta = { title: string; referenceKey: string | null; savedId: string | null; dirty: boolean; busy: boolean }
export type FormulaTab = { id: string; number: number; initialDraft: FormulaDraft; meta: FormulaTabMeta }
export type FormulaWorkspace = { tabs: FormulaTab[]; activeId: string; nextNumber: number }

function tabFromDraft(number: number, draft: FormulaDraft): FormulaTab {
  return { id: `sheet-${number}`, number, initialDraft: draft, meta: {
    title: draft.title || draft.reference?.name || draft.sheet.spec.productName,
    referenceKey: formulaReferenceKey(draft.reference), savedId: draft.saved?.id ?? null, dirty: draft.dirty, busy: false,
  } }
}

export function createFormulaWorkspace(draft: FormulaDraft): FormulaWorkspace {
  const tab = tabFromDraft(1, draft)
  return { tabs: [tab], activeId: tab.id, nextNumber: 2 }
}

type Action =
  | { type: 'open'; draft: FormulaDraft }
  | { type: 'activate'; id: string }
  | { type: 'metadata'; id: string; meta: FormulaTabMeta }
  | { type: 'close'; id: string; emptyDraft: FormulaDraft }

/** 입력 내용은 고유 키를 가진 편집기 안에 유지하고, 여기서는 탭 상태만 관리한다. */
export function formulaWorkspaceReducer(state: FormulaWorkspace, action: Action): FormulaWorkspace {
  switch (action.type) {
    case 'open': {
      // 같은 저장 항목을 두 편집기에서 덮어쓰지 않도록 기존 탭을 연다.
      const existing = action.draft.saved && state.tabs.find(tab => tab.meta.savedId === action.draft.saved!.id)
      if (existing) return { ...state, activeId: existing.id }
      const tab = tabFromDraft(state.nextNumber, action.draft)
      return { tabs: [...state.tabs, tab], activeId: tab.id, nextNumber: state.nextNumber + 1 }
    }
    case 'activate':
      return action.id !== state.activeId && state.tabs.some(tab => tab.id === action.id) ? { ...state, activeId: action.id } : state
    case 'metadata': {
      const tab = state.tabs.find(item => item.id === action.id)
      if (!tab || (Object.keys(action.meta) as (keyof FormulaTabMeta)[]).every(key => tab.meta[key] === action.meta[key])) return state
      return { ...state, tabs: state.tabs.map(item => item.id === action.id ? { ...item, meta: action.meta } : item) }
    }
    case 'close': {
      const index = state.tabs.findIndex(tab => tab.id === action.id)
      if (index < 0) return state
      const tabs = state.tabs.filter(tab => tab.id !== action.id)
      if (!tabs.length) {
        const tab = tabFromDraft(state.nextNumber, action.emptyDraft)
        return { tabs: [tab], activeId: tab.id, nextNumber: state.nextNumber + 1 }
      }
      return { ...state, tabs, activeId: action.id === state.activeId ? tabs[Math.min(index, tabs.length - 1)].id : state.activeId }
    }
  }
}
