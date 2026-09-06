'use client'

import { useId, useState, type ReactNode } from 'react'

export type TableView = {
  columns: string[]
  rows: Array<Array<string | number>>
}

type Props = {
  title: string
  /** 차트가 무엇을 그렸는지 한 줄. 단일 계열 차트는 이 문장이 범례를 대신한다. */
  caption?: string
  /** 표본 수, 계산 규칙 등 각주 */
  note?: string
  table: TableView
  children: ReactNode
  isEmpty?: boolean
  emptyMessage?: string
}

/**
 * 차트 한 장의 껍데기.
 * 모든 차트는 '표' 토글을 함께 갖는다 - 색·길이로만 값을 전달하지 않기 위해서다.
 */
export function ChartCard({
  title,
  caption,
  note,
  table,
  children,
  isEmpty,
  emptyMessage = '조건에 맞는 데이터가 없습니다.',
}: Props) {
  const [mode, setMode] = useState<'chart' | 'table'>('chart')
  const panelId = useId()

  return (
    <section className="flex flex-col rounded-lg border border-line bg-surface">
      <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h3 className="text-[14px] leading-5 font-semibold text-ink keep-all">{title}</h3>
          {caption ? (
            <p className="mt-1 text-[13px] leading-4 text-ink-3 keep-all">{caption}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 rounded-md border border-line p-0.5">
          {(['chart', 'table'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              aria-controls={panelId}
              onClick={() => setMode(value)}
              className={`rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                mode === value
                  ? 'bg-surface-sunken text-ink'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {value === 'chart' ? '차트' : '표'}
            </button>
          ))}
        </div>
      </header>

      <div id={panelId} className="flex-1 px-5 pb-5">
        {isEmpty ? (
          <p className="py-10 text-center text-[13px] text-ink-3">{emptyMessage}</p>
        ) : mode === 'chart' ? (
          children
        ) : (
          <DataTable table={table} />
        )}
      </div>

      {note ? (
        <p className="border-t border-line px-5 py-3 text-[12px] leading-4 text-ink-3 keep-all">
          {note}
        </p>
      ) : null}
    </section>
  )
}

function DataTable({ table }: { table: TableView }) {
  return (
    <div className="max-h-72 overflow-auto scroll-contain rounded-md border border-line">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {table.columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={`sticky top-0 border-b border-line bg-surface-muted px-3 py-2 font-medium text-ink-2 ${
                  index === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-line last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-3 py-2 ${
                    cellIndex === 0 ? 'text-left text-ink keep-all' : 'text-right text-ink-2 tnum'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
