'use client'

import { useId, useState, type ReactNode } from 'react'
import { FoldButton } from '@/components/FoldButton'
import { useCollapsedCard } from '@/hooks/useCollapsedCard'

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
 *
 * 카드마다 접을 수 있다. 접은 상태는 제목을 열쇠로 브라우저에 남는다
 * (`lib/collapsedCards.ts`) - 조건 레일의 묶음과 같은 방식으로, 처음에는 펼쳐 두고
 * 접는 것은 사용자 몫이다. 내보내기(텍스트·이미지·PDF)는 화면을 찍지 않고 같은
 * 브리핑 객체를 다시 그리므로, 접어 둔 카드도 내보낸 자료에는 그대로 들어간다.
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

  const [collapsed, setCollapsed] = useCollapsedCard(title)

  return (
    // 대시보드는 2열 격자다. 격자 칸은 기본적으로 줄 높이만큼 늘어나므로, 접은 카드는
    // 늘어나지 않게 붙여 둔다 - 그러지 않으면 옆 카드 높이만큼 빈 상자가 남는다.
    <section
      className={`flex flex-col rounded-lg border border-line bg-surface ${collapsed ? 'self-start' : ''}`}
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
        <div className="min-w-0">
          {/* 제목 줄 전체가 여는 버튼이다. 조건 레일의 묶음과 같은 조작으로 맞춘다. */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls={panelId}
            className="-mx-1.5 -my-1 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-sunken"
          >
            <span
              aria-hidden
              className={`grid h-5 w-5 shrink-0 place-items-center text-[13px] text-ink-3 transition-transform ${
                collapsed ? '' : 'rotate-90'
              }`}
            >
              ▶
            </span>
            <h3 className="min-w-0 text-[14px] leading-5 font-semibold text-ink keep-all">{title}</h3>
          </button>
          {/* 설명은 차트가 무엇을 그렸는지 말하는 문장이라, 접었으면 함께 감춘다. */}
          {caption && !collapsed ? (
            <p className="mt-1 pl-[26px] text-[13px] leading-4 text-ink-3 keep-all">{caption}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 차트·표 토글은 본문을 가리키므로 접었으면 감춘다. 여닫는 버튼은 남긴다. */}
          {!collapsed ? (
            <div className="flex rounded-md border border-line p-0.5">
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
          ) : null}
          <FoldButton
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            label={title}
            controls={panelId}
          />
        </div>
      </header>

      <div id={panelId} hidden={collapsed} className="flex-1 px-5 pb-5">
        {isEmpty ? (
          <p className="py-10 text-center text-[13px] text-ink-3">{emptyMessage}</p>
        ) : mode === 'chart' ? (
          children
        ) : (
          <DataTable table={table} />
        )}
      </div>

      {note && !collapsed ? (
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
