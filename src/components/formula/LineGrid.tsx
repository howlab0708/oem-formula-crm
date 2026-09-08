'use client'

/**
 * 2. 부자재비 / 3. 가공비 / 4. 분석비 표. 세 블록의 모양이 같아 한 컴포넌트로 쓴다.
 *
 * 수량 칸이 세 가지 뜻을 갖는다(`QuantityBasis`).
 *   세트당  병용기·단상자·라벨처럼 세트마다 하나 - 수량 = 세트 수 ÷ 입수(올림)
 *   낱개당  가공비처럼 정 단위 - 수량 = 총 정 수 ÷ 입수(올림)
 *   직접    제판비·목형비·분석비처럼 수량이 고정
 * 세트당·낱개당으로 두면 수량 구간(1,000 / 3,000 / 5,000set)을 바꿀 때 수량을
 * 손으로 다시 적지 않아도 된다. 엑셀에서 매번 고쳐야 했던 칸이다.
 */

import { useRef } from 'react'
import { formatWon } from '@/lib/formulaDesign/calc'
import type { LineCalc } from '@/lib/formulaDesign/calc'
import { LINE_PASTE_KEYS, parseClipboardMatrix, type LineBlock, type SheetAction } from '@/lib/formulaDesign/reducer'
import type { LineRow, QuantityBasis } from '@/lib/formulaDesign/types'
import { focusCellSoon, handleGridKeyDown } from './gridKeys'
import { cellClass, headClass, numberCellClass, rowNumberClass } from './cellStyles'

const COLUMNS = LINE_PASTE_KEYS.length

const BASIS_LABELS: { value: QuantityBasis; label: string }[] = [
  { value: 'set', label: '세트당' },
  { value: 'unit', label: '낱개당' },
  { value: 'fixed', label: '직접' },
]

type Props = {
  title: string
  block: LineBlock
  rows: LineRow[]
  calcs: LineCalc[]
  total: number
  /** 견적에서 뺀 줄들의 합. 초도·별도청구 금액. */
  excluded: number
  itemLabel: string
  dispatch: (action: SheetAction) => void
}

export function LineGrid({ title, block, rows, calcs, total, excluded, itemLabel, dispatch }: Props) {
  const gridRef = useRef<HTMLTableElement>(null)
  const patch = (id: string, next: Partial<LineRow>) => dispatch({ type: 'line', block, id, patch: next })

  return (
    <section aria-labelledby={`line-grid-${block}`} className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h3 id={`line-grid-${block}`} className="text-[14px] font-semibold text-ink">
          {title}
        </h3>
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-ink-3">
            소계 <span className="tnum font-medium text-ink">{formatWon(total)}</span>원
            {excluded > 0 ? <span className="ml-2">별도청구 {formatWon(excluded)}원</span> : null}
          </p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'add-line', block })
              focusCellSoon(gridRef.current, rows.length, 0)
            }}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            항목 추가
          </button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table data-grid ref={gridRef} className="w-full min-w-[52rem] border-collapse text-[13px]">
          <caption className="sr-only">{title} 입력 표</caption>
          <thead>
            <tr>
              <th scope="col" className={`${headClass} w-9`} aria-label="줄 번호" />
              <th scope="col" className={`${headClass} min-w-[14rem] text-left`}>{itemLabel}</th>
              <th scope="col" className={`${headClass} w-20`}>기준단위</th>
              <th scope="col" className={`${headClass} w-24`}>수량 기준</th>
              <th scope="col" className={`${headClass} w-20`}>입수</th>
              <th scope="col" className={`${headClass} w-24`}>수량</th>
              <th scope="col" className={`${headClass} w-24`}>단가(원)</th>
              <th scope="col" className={`${headClass} w-28`}>금액(원)</th>
              <th scope="col" className={`${headClass} min-w-[9rem] text-left`}>비고</th>
              <th scope="col" className={`${headClass} w-20`}>견적 포함</th>
              <th scope="col" className={`${headClass} w-10`} aria-label="줄 삭제" />
            </tr>
          </thead>
          <tbody>
            {calcs.map((calc, rowIndex) => {
              const row = calc.row
              const cell = (column: number) => ({
                'data-cell': `${rowIndex}:${column}`,
                onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) =>
                  handleGridKeyDown(event, {
                    row: rowIndex,
                    column,
                    rowCount: rows.length,
                    columnCount: COLUMNS,
                    onAddRow: () => dispatch({ type: 'add-line', block, after: row.id }),
                    onMoveRow: (delta: number) => dispatch({ type: 'move', block, id: row.id, delta }),
                  }),
                onPaste: (event: React.ClipboardEvent) => {
                  const matrix = parseClipboardMatrix(event.clipboardData.getData('text/plain'))
                  if (!matrix) return
                  event.preventDefault()
                  dispatch({ type: 'paste-lines', block, row: rowIndex, column, matrix })
                },
              })
              const fixed = row.basis === 'fixed'
              return (
                <tr key={row.id} className={`border-t border-line ${row.included ? '' : 'bg-surface-muted'}`}>
                  <td className={rowNumberClass}>{rowIndex + 1}</td>
                  <td className="p-0">
                    <input
                      {...cell(0)}
                      value={row.label}
                      aria-label={`${rowIndex + 1}번째 ${itemLabel}`}
                      onChange={(event) => patch(row.id, { label: event.target.value })}
                      className={cellClass}
                    />
                  </td>
                  <td className="p-0">
                    <input
                      {...cell(1)}
                      value={row.unit}
                      aria-label={`${rowIndex + 1}번째 항목 기준단위`}
                      onChange={(event) => patch(row.id, { unit: event.target.value })}
                      className={`${cellClass} text-center`}
                    />
                  </td>
                  <td className="p-0">
                    <select
                      value={row.basis}
                      aria-label={`${rowIndex + 1}번째 항목 수량 기준`}
                      onChange={(event) => patch(row.id, { basis: event.target.value as QuantityBasis })}
                      className={`${cellClass} cursor-pointer`}
                    >
                      {BASIS_LABELS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-0">
                    <input
                      value={fixed ? '' : row.packSize}
                      disabled={fixed}
                      inputMode="numeric"
                      aria-label={`${rowIndex + 1}번째 항목 입수`}
                      title="한 개에 몇 세트(또는 몇 정)가 들어가는지. 카톤 200개입이면 200."
                      onChange={(event) => patch(row.id, { packSize: event.target.value })}
                      className={`${cellClass} text-right tnum disabled:bg-surface-muted`}
                    />
                  </td>
                  <td className="p-0">
                    {fixed ? (
                      <input
                        {...cell(2)}
                        value={row.quantity}
                        inputMode="numeric"
                        aria-label={`${rowIndex + 1}번째 항목 수량`}
                        onChange={(event) => patch(row.id, { quantity: event.target.value })}
                        className={`${cellClass} text-right tnum`}
                      />
                    ) : (
                      <span className={`${numberCellClass} block text-ink-2`} title="수량 기준과 입수로 자동 계산됩니다.">
                        {calc.quantity.toLocaleString('ko-KR')}
                      </span>
                    )}
                  </td>
                  <td className="p-0">
                    <input
                      {...cell(3)}
                      value={row.unitPrice}
                      inputMode="decimal"
                      aria-label={`${rowIndex + 1}번째 항목 단가(원)`}
                      onChange={(event) => patch(row.id, { unitPrice: event.target.value })}
                      className={`${cellClass} text-right tnum`}
                    />
                  </td>
                  <td className={`${numberCellClass} ${row.included ? '' : 'text-ink-3 line-through'}`}>
                    {formatWon(calc.amount)}
                  </td>
                  <td className="p-0">
                    <input
                      {...cell(4)}
                      value={row.note}
                      aria-label={`${rowIndex + 1}번째 항목 비고`}
                      onChange={(event) => patch(row.id, { note: event.target.value })}
                      className={cellClass}
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(event) => patch(row.id, { included: event.target.checked })}
                      aria-label={`${rowIndex + 1}번째 항목을 견적 합계에 포함`}
                      title="끄면 금액이 소계에서 빠지고 고객용 PDF 의 ‘별도 청구 항목’ 으로 옮겨집니다."
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'remove', block, id: row.id })}
                      aria-label={`${rowIndex + 1}번째 항목 삭제`}
                      className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
            {calcs.length === 0 ? (
              <tr className="border-t border-line">
                <td colSpan={11} className="px-3 py-6 text-center text-[13px] text-ink-3">
                  항목이 없습니다. ‘항목 추가’ 로 시작하거나 엑셀 표를 붙여넣으세요.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
