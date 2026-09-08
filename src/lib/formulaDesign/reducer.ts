/**
 * 배합 시트 편집 상태.
 *
 * 셀 하나를 고칠 때 시트 전체를 새로 만들지 않고 해당 줄만 갈아 끼운다.
 * 원료 200줄 × 7칸을 타이핑하는 화면이라 입력 한 글자마다 전체를 복사하면
 * 커서가 밀리는 게 눈에 보인다.
 *
 * 붙여넣기(`paste`)는 엑셀에서 표를 그대로 긁어 오는 경로다. 탭·줄바꿈으로
 * 갈라 지금 칸부터 채우고, 줄이 모자라면 늘린다 - 엑셀에서 옮겨 오는 첫날의
 * 작업량이 이 동작 하나로 정해진다.
 */

import { fillRemainder } from './calc'
import { newLineRow, newMaterialRow, newOverheadRow } from './preset'
import type { FormulaSheet, LineRow, MaterialRow, OverheadRow, PackagingSpec, QuoteSettings } from './types'

/** 줄이 든 블록 이름. 원료비와 2·3·4 블록을 같은 방식으로 다룬다. */
export type LineBlock = 'packagingItems' | 'processItems' | 'analysisItems'

export type SheetAction =
  | { type: 'load'; sheet: FormulaSheet }
  | { type: 'memo'; value: string }
  | { type: 'spec'; key: keyof PackagingSpec; value: string }
  | { type: 'quote'; key: keyof QuoteSettings; value: string | string[] }
  | { type: 'material'; id: string; patch: Partial<MaterialRow> }
  | { type: 'line'; block: LineBlock; id: string; patch: Partial<LineRow> }
  | { type: 'overhead'; id: string; patch: Partial<OverheadRow> }
  | { type: 'add-material'; after?: string; count?: number }
  | { type: 'add-line'; block: LineBlock; after?: string }
  | { type: 'add-overhead' }
  | { type: 'remove'; block: 'materials' | LineBlock | 'overheads'; id: string }
  | { type: 'move'; block: 'materials' | LineBlock; id: string; delta: number }
  | { type: 'fill-remainder'; id: string }
  | {
      type: 'paste-materials'
      row: number
      column: number
      matrix: string[][]
      /**
       * 붙여넣은 원료명이 기능성 원료 DB 와 정확히 같을 때 얹을 기준 정보를 돌려준다.
       * 리듀서가 원료 DB 를 직접 알지 않도록 조회 함수만 받는다.
       */
      enrich?: (name: string) => Partial<MaterialRow> | null
    }
  | { type: 'paste-lines'; block: LineBlock; row: number; column: number; matrix: string[][] }

/** 붙여넣기가 채울 원료비 칸 순서. 화면의 열 순서와 같아야 한다. */
export const MATERIAL_PASTE_KEYS = ['name', 'ratio', 'usage', 'unitPrice', 'note'] as const
/** 붙여넣기가 채울 2·3·4 블록 칸 순서. */
export const LINE_PASTE_KEYS = ['label', 'unit', 'quantity', 'unitPrice', 'note'] as const

function replaceById<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  const index = rows.findIndex((row) => row.id === id)
  if (index < 0) return rows
  const next = rows.slice()
  next[index] = { ...next[index], ...patch }
  return next
}

function insertAfter<T extends { id: string }>(rows: T[], after: string | undefined, made: T[]): T[] {
  const index = after ? rows.findIndex((row) => row.id === after) : -1
  if (index < 0) return [...rows, ...made]
  return [...rows.slice(0, index + 1), ...made, ...rows.slice(index + 1)]
}

function move<T extends { id: string }>(rows: T[], id: string, delta: number): T[] {
  const index = rows.findIndex((row) => row.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= rows.length) return rows
  const next = rows.slice()
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row)
  return next
}

/** 마지막 한 줄은 남긴다. 표가 완전히 비면 어디에 입력해야 할지 알 수 없다. */
function removeById<T extends { id: string }>(rows: T[], id: string, keepLast = true): T[] {
  if (keepLast && rows.length <= 1) return rows
  return rows.filter((row) => row.id !== id)
}

/**
 * 붙여넣은 표를 지정한 칸부터 채운다. 클립보드 표가 화면보다 크면 줄을 늘린다.
 * 열이 남으면 그 열은 건드리지 않는다(비고만 있는 표를 붙여도 앞칸이 지워지지 않는다).
 */
function pasteInto<T extends { id: string }>(
  rows: T[],
  row: number,
  column: number,
  matrix: string[][],
  keys: readonly string[],
  make: () => T,
): T[] {
  const next = rows.slice()
  matrix.forEach((cells, offset) => {
    const index = row + offset
    while (next.length <= index) next.push(make())
    const patch: Record<string, string> = {}
    cells.forEach((cell, cellOffset) => {
      const key = keys[column + cellOffset]
      if (key) patch[key] = cell.trim()
    })
    next[index] = { ...next[index], ...patch }
  })
  return next
}

export function sheetReducer(state: FormulaSheet, action: SheetAction): FormulaSheet {
  switch (action.type) {
    case 'load':
      return action.sheet
    case 'memo':
      return { ...state, memo: action.value }
    case 'spec':
      return { ...state, spec: { ...state.spec, [action.key]: action.value } }
    case 'quote':
      return { ...state, quote: { ...state.quote, [action.key]: action.value } }
    case 'material':
      return { ...state, materials: replaceById(state.materials, action.id, action.patch) }
    case 'line':
      return { ...state, [action.block]: replaceById(state[action.block], action.id, action.patch) }
    case 'overhead':
      return { ...state, quote: { ...state.quote, overheads: replaceById(state.quote.overheads, action.id, action.patch) } }
    case 'add-material':
      return {
        ...state,
        materials: insertAfter(
          state.materials,
          action.after,
          Array.from({ length: action.count ?? 1 }, () => newMaterialRow()),
        ),
      }
    case 'add-line':
      return { ...state, [action.block]: insertAfter(state[action.block], action.after, [newLineRow()]) }
    case 'add-overhead':
      return { ...state, quote: { ...state.quote, overheads: [...state.quote.overheads, newOverheadRow()] } }
    case 'remove':
      if (action.block === 'overheads') {
        return {
          ...state,
          quote: { ...state.quote, overheads: removeById(state.quote.overheads, action.id, false) },
        }
      }
      // 원료비와 2·3·4 블록은 줄 모양이 달라도 삭제·이동은 id 만 본다.
      return { ...state, [action.block]: removeById<{ id: string }>(state[action.block], action.id) }
    case 'move':
      return { ...state, [action.block]: move<{ id: string }>(state[action.block], action.id, action.delta) }
    case 'fill-remainder':
      return { ...state, materials: fillRemainder(state.materials, action.id) }
    case 'paste-materials': {
      const pasted = pasteInto(
        state.materials,
        action.row,
        action.column,
        action.matrix,
        MATERIAL_PASTE_KEYS,
        newMaterialRow,
      )
      const enrich = action.enrich
      if (!enrich) return { ...state, materials: pasted }
      // 이번에 붙여넣은 줄만 손댄다. 손으로 고쳐 둔 다른 줄을 되돌리지 않는다.
      const last = action.row + action.matrix.length - 1
      return {
        ...state,
        materials: pasted.map((row, index) => {
          if (index < action.row || index > last || row.ingredientId || !row.name) return row
          const extra = enrich(row.name)
          if (!extra) return row
          // 붙여넣은 값이 우선이고, 비어 있는 칸만 DB 값으로 채운다.
          return {
            ...row,
            ...extra,
            unitPrice: row.unitPrice || extra.unitPrice || '',
            note: row.note || extra.note || '',
          }
        }),
      }
    }
    case 'paste-lines':
      return {
        ...state,
        [action.block]: pasteInto(
          state[action.block],
          action.row,
          action.column,
          action.matrix,
          LINE_PASTE_KEYS,
          // 붙여넣기로 생기는 줄은 수량을 직접 입력하는 상태로 둔다.
          () => newLineRow({ basis: 'fixed' }),
        ),
      }
    default:
      return state
  }
}

/** 클립보드 텍스트를 표로 읽는다. 엑셀·구글시트는 탭으로 칸을, 줄바꿈으로 줄을 나눈다. */
export function parseClipboardMatrix(text: string): string[][] | null {
  if (!text.includes('\t') && !text.includes('\n')) return null
  const rows = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (!rows.length) return null
  return rows.map((row) => row.split('\t'))
}
