'use client'

/**
 * 1. 원료비 표.
 *
 * 엑셀 견적서의 원료비 블록을 그대로 옮긴 표다. 열 순서(원료명 → 배합비율 →
 * 배합량 → 사용량 → 단가 → 금액 → 비고)를 엑셀과 같게 두어 옮겨 적을 때 눈이
 * 헤매지 않게 했다. 배합량·금액은 계산 결과라 입력란이 아니다.
 *
 * 원료명 칸은 기능성 원료 DB 자동완성이다. 고르면 일일섭취기준·기능성내용·기준
 * 성분이 함께 붙고, 지난 견적에서 쓴 단가가 있으면 단가까지 채운다.
 */

import { useRef, useState } from 'react'
import { formatKg, formatRatio, formatWon, num } from '@/lib/formulaDesign/calc'
import type { MaterialCalc, Totals } from '@/lib/formulaDesign/calc'
import { MATERIAL_PASTE_KEYS, parseClipboardMatrix, type SheetAction } from '@/lib/formulaDesign/reducer'
import { exactSuggestion, suggestIngredients, type Suggestion, type SuggestionIndex } from '@/lib/formulaDesign/suggest'
import type { MaterialRow } from '@/lib/formulaDesign/types'
import { focusCellSoon, handleGridKeyDown } from './gridKeys'
import { cellClass, headClass, numberCellClass, rowNumberClass } from './cellStyles'

/** 화면 열 순서. 붙여넣기 키 순서(`MATERIAL_PASTE_KEYS`)와 같아야 한다. */
const COLUMNS = MATERIAL_PASTE_KEYS.length

type Props = {
  materials: MaterialRow[]
  totals: Totals
  /** 포장 단위 블록에 적힌 Loss율(%). 소계 줄의 각주에 그대로 보여준다. */
  lossPercent: string
  index: SuggestionIndex
  dispatch: (action: SheetAction) => void
}

export function MaterialGrid({ materials, totals, lossPercent, index, dispatch }: Props) {
  const gridRef = useRef<HTMLTableElement>(null)

  const patch = (id: string, next: Partial<MaterialRow>) => dispatch({ type: 'material', id, patch: next })

  /**
   * 후보에서 기준 정보만 뽑는다. 원료명은 여기 넣지 않는다 -
   * 원료명은 발주·투입에 쓰는 이름이라 공전 이름으로 바꾸면 배합표가 틀어진다
   * (산화아연을 투입하고 원료명을 아연으로 적을 수는 없다). 공전 이름은 기준 성분으로 간다.
   */
  const standardsOf = (found: Suggestion): Partial<MaterialRow> => ({
    ingredientId: found.ingredientId,
    basis: found.basis,
    dailyIntake: found.dailyIntake,
    functionality: found.functionality,
    functional: found.source === 'ingredient',
    unitPrice: found.unitPrice ? String(found.unitPrice) : '',
    note: found.note ?? '',
  })

  /** 목록에서 고른 후보를 줄에 얹는다. 단가·비고는 비어 있을 때만 채운다. */
  const applySuggestion = (row: MaterialRow, suggestion: Suggestion) => {
    const standards = standardsOf(suggestion)
    patch(row.id, {
      ...standards,
      // 고른 후보의 이름을 쓴다. 원료 형태로 연결된 후보는 연구원이 친 이름을 그대로 담고 있다.
      name: suggestion.name,
      functional: suggestion.source === 'ingredient' ? true : row.functional,
      unitPrice: row.unitPrice || standards.unitPrice || '',
      note: row.note || standards.note || '',
    })
  }

  /** 직접 입력·붙여넣은 이름에 기준 정보만 얹는다(이름은 건드리지 않는다). */
  const standardsFor = (name: string): Partial<MaterialRow> | null => {
    const found = exactSuggestion(index, name)
    return found ? standardsOf(found) : null
  }

  /** 목록에서 고르지 않고 적어 넣은 이름을 공전 원료에 연결한다. 연결되지 않으면 그대로 둔다. */
  const attachStandards = (row: MaterialRow, name: string) => {
    const standards = standardsFor(name)
    if (!standards) return
    patch(row.id, {
      ...standards,
      // 이미 켜 둔 기능성 표시는 끄지 않는다.
      functional: standards.functional || row.functional,
      unitPrice: row.unitPrice || standards.unitPrice || '',
      note: row.note || standards.note || '',
    })
  }

  const onPaste = (event: React.ClipboardEvent, rowIndex: number, column: number) => {
    const matrix = parseClipboardMatrix(event.clipboardData.getData('text/plain'))
    if (!matrix) return
    event.preventDefault()
    dispatch({ type: 'paste-materials', row: rowIndex, column, matrix, enrich: standardsFor })
  }

  const keyOptions = (rowIndex: number, column: number, id: string) => ({
    row: rowIndex,
    column,
    rowCount: materials.length,
    columnCount: COLUMNS,
    onAddRow: () => dispatch({ type: 'add-material', after: id }),
    onMoveRow: (delta: number) => dispatch({ type: 'move', block: 'materials', id, delta }),
  })

  return (
    <section aria-labelledby="material-grid-title" className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h3 id="material-grid-title" className="text-[14px] font-semibold text-ink">
            1. 원료비
          </h3>
          <p className="text-[12px] text-ink-3">
            총 배합량 {formatKg(totals.totalBatchKg, 2)}kg (순 {formatKg(totals.netBatchKg, 2)}kg + Loss {num(lossPercent)}%)
            {' · '}Enter 아래 칸 · Alt+↑↓ 줄 이동 · 엑셀 표 붙여넣기 지원
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RatioBadge gap={totals.ratioGap} sum={totals.ratioSum} />
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'add-material' })
              focusCellSoon(gridRef.current, materials.length, 0)
            }}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            원료 추가
          </button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table data-grid ref={gridRef} className="w-full min-w-[62rem] border-collapse text-[13px]">
          <caption className="sr-only">
            원료명, 배합비율, 배합량, 사용량, 원료단가, 금액, 비고 순서의 배합비 입력 표
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${headClass} w-9`} aria-label="줄 번호" />
              <th scope="col" className={`${headClass} min-w-[13rem] text-left`}>원료명</th>
              <th scope="col" className={`${headClass} w-24`}>배합비율(%)</th>
              <th scope="col" className={`${headClass} w-24`}>배합량(kg)</th>
              <th scope="col" className={`${headClass} w-24`}>사용량(kg)</th>
              <th scope="col" className={`${headClass} w-24`}>원료단가(원)</th>
              <th scope="col" className={`${headClass} w-28`}>금액(원)</th>
              <th scope="col" className={`${headClass} min-w-[9rem] text-left`}>비고</th>
              <th scope="col" className={`${headClass} w-20`}>기능성</th>
              <th scope="col" className={`${headClass} w-16`} aria-label="줄 삭제" />
            </tr>
          </thead>
          <tbody>
            {totals.materials.map((calc, rowIndex) => (
              <MaterialRowView
                key={calc.row.id}
                calc={calc}
                rowIndex={rowIndex}
                index={index}
                gridRef={gridRef}
                keyOptions={keyOptions}
                onPaste={onPaste}
                onPatch={patch}
                onApply={applySuggestion}
                onAttachStandards={attachStandards}
                onRemove={() => dispatch({ type: 'remove', block: 'materials', id: calc.row.id })}
                onFillRemainder={() => dispatch({ type: 'fill-remainder', id: calc.row.id })}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-sunken font-medium">
              <td className="px-2 py-2" />
              <th scope="row" className="px-2 py-2 text-left">소계</th>
              <td className={numberCellClass}>{formatRatio(totals.ratioSum)}</td>
              <td className={numberCellClass}>{formatKg(totals.batchSumKg, 2)}</td>
              <td className={numberCellClass}>{formatKg(totals.usageSumKg, 2)}</td>
              <td className={numberCellClass} />
              <td className={numberCellClass}>{formatWon(totals.materialCost)}</td>
              <td className="px-2 py-2 text-[12px] text-ink-3" colSpan={3}>
                Loss {num(lossPercent)}% UP · 부가세 별도
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

function RatioBadge({ gap, sum }: { gap: number; sum: number }) {
  const settled = Math.abs(gap) < 0.00005
  return (
    <p
      role="status"
      className={`rounded-md px-2 py-1 text-[12px] tnum ${
        settled ? 'bg-accent-soft text-accent-strong' : 'bg-danger-soft text-danger'
      }`}
    >
      {settled ? `배합비율 합 ${formatRatio(sum)}%` : `잔량 ${formatRatio(gap)}%`}
    </p>
  )
}

type RowProps = {
  calc: MaterialCalc
  rowIndex: number
  index: SuggestionIndex
  gridRef: React.RefObject<HTMLTableElement | null>
  keyOptions: (rowIndex: number, column: number, id: string) => Parameters<typeof handleGridKeyDown>[1]
  onPaste: (event: React.ClipboardEvent, rowIndex: number, column: number) => void
  onPatch: (id: string, patch: Partial<MaterialRow>) => void
  onApply: (row: MaterialRow, suggestion: Suggestion) => void
  onAttachStandards: (row: MaterialRow, name: string) => void
  onRemove: () => void
  onFillRemainder: () => void
}

function MaterialRowView({
  calc,
  rowIndex,
  index,
  keyOptions,
  onPaste,
  onPatch,
  onApply,
  onAttachStandards,
  onRemove,
  onFillRemainder,
}: RowProps) {
  const { row } = calc
  const cell = (column: number) => ({
    'data-cell': `${rowIndex}:${column}`,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => handleGridKeyDown(event, keyOptions(rowIndex, column, row.id)),
    onPaste: (event: React.ClipboardEvent) => onPaste(event, rowIndex, column),
  })

  return (
    <tr className="border-t border-line">
      <td className={rowNumberClass}>{rowIndex + 1}</td>
      <td className="p-0">
        <IngredientNameCell
          row={row}
          index={index}
          cellProps={cell(0)}
          onChange={(name) => onPatch(row.id, { name })}
          onApply={(suggestion) => onApply(row, suggestion)}
          onAttach={(name) => onAttachStandards(row, name)}
        />
      </td>
      <td className="p-0">
        <input
          {...cell(1)}
          value={row.ratio}
          inputMode="decimal"
          aria-label={`${rowIndex + 1}번째 원료 배합비율(%)`}
          onChange={(event) => onPatch(row.id, { ratio: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
      </td>
      <td className={`${numberCellClass} text-ink-2`} title="배합비율 × 총 배합량">
        {formatKg(calc.batchKg)}
      </td>
      <td className="p-0">
        <input
          {...cell(2)}
          value={row.usage}
          inputMode="decimal"
          placeholder={formatKg(calc.batchKg)}
          aria-label={`${rowIndex + 1}번째 원료 사용량(kg) 직접 입력`}
          title="비우면 배합량을 그대로 씁니다. 팩 단위로 올릴 때만 입력하세요."
          onChange={(event) => onPatch(row.id, { usage: event.target.value })}
          className={`${cellClass} text-right tnum ${calc.overridden ? 'bg-accent-soft' : ''}`}
        />
      </td>
      <td className="p-0">
        <input
          {...cell(3)}
          value={row.unitPrice}
          inputMode="numeric"
          aria-label={`${rowIndex + 1}번째 원료 단가(원)`}
          onChange={(event) => onPatch(row.id, { unitPrice: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
      </td>
      <td className={numberCellClass}>{formatWon(calc.amount)}</td>
      <td className="p-0">
        <input
          {...cell(4)}
          value={row.note}
          aria-label={`${rowIndex + 1}번째 원료 비고`}
          onChange={(event) => onPatch(row.id, { note: event.target.value })}
          className={cellClass}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <label className="inline-flex items-center gap-1 text-[12px] text-ink-3">
          <input
            type="checkbox"
            checked={row.functional}
            onChange={(event) => onPatch(row.id, { functional: event.target.checked })}
            aria-label={`${rowIndex + 1}번째 원료를 기능성 주원료로 표시`}
          />
          표시
        </label>
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-center">
        <button
          type="button"
          onClick={onFillRemainder}
          title="이 줄에 남은 배합비율을 채웁니다(부형제 조정)"
          className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-surface-sunken"
        >
          잔량
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${rowIndex + 1}번째 원료 줄 삭제`}
          className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

/** 원료명 입력 + 자동완성 목록. 목록은 입력 중에만 뜨고 방향키·Enter 로 고른다. */
function IngredientNameCell({
  row,
  index,
  cellProps,
  onChange,
  onApply,
  onAttach,
}: {
  row: MaterialRow
  index: SuggestionIndex
  cellProps: Record<string, unknown>
  onChange: (name: string) => void
  onApply: (suggestion: Suggestion) => void
  onAttach: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = open ? suggestIngredients(index, row.name) : []
  const linked = row.ingredientId || row.dailyIntake

  const choose = (suggestion: Suggestion) => {
    onApply(suggestion)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        {...cellProps}
        value={row.name}
        aria-label="원료명"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls={`suggest-${row.id}`}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setActive(0)}
        onBlur={() => {
          // 클릭으로 고르는 경우가 있어 한 틱 뒤에 닫는다.
          setTimeout(() => setOpen(false), 120)
          // 목록에서 고르지 않고 직접 적은 이름도 공전 원료로 연결되면 기준 정보를 얹는다.
          // 이름은 그대로 둔다 - 적어 넣은 원료명이 발주에 쓰는 이름이다.
          if (!row.ingredientId && row.name) onAttach(row.name)
        }}
        onKeyDown={(event) => {
          if (open && matches.length) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
              return
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              choose(matches[active])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              return
            }
          }
          ;(cellProps.onKeyDown as (event: React.KeyboardEvent<HTMLInputElement>) => void)(event)
        }}
        className={`${cellClass} ${linked ? 'font-medium text-ink' : ''}`}
      />
      {open && matches.length ? (
        <ul
          id={`suggest-${row.id}`}
          role="listbox"
          className="absolute left-0 top-full z-40 max-h-64 w-[26rem] overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {matches.map((suggestion, position) => (
            <li key={suggestion.key} role="option" aria-selected={position === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
                onMouseEnter={() => setActive(position)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[13px] ${
                  position === active ? 'bg-accent-soft text-accent-strong' : 'text-ink'
                }`}
              >
                <span className="keep-all">{suggestion.name}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{suggestion.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
