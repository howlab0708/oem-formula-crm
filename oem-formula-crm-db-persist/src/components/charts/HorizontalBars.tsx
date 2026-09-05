'use client'

export type BarDatum = {
  key: string
  label: string
  value: number
  valueLabel: string
  /** false 면 같은 계열의 옅은 단계로 그린다(맥락용 막대). */
  emphasis?: boolean
  hint?: string
}

type Props = {
  data: BarDatum[]
  /** 라벨 열 폭. 성분명처럼 긴 문자열은 넓게 준다. */
  labelWidth?: string
  ariaLabel: string
  onSelect?: (datum: BarDatum) => void
}

/**
 * 가로 막대. 크기 비교가 목적이라 단일 계열(blue) 한 색만 쓴다.
 * 값은 전부 오른쪽 열에 직접 표기하므로 호버가 값을 가두지 않는다.
 */
export function HorizontalBars({ data, labelWidth = '9.5rem', ariaLabel, onSelect }: Props) {
  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <ul className="flex flex-col gap-1.5" aria-label={ariaLabel}>
      {data.map((datum) => {
        const content = (
          <BarRowContent datum={datum} labelWidth={labelWidth} widthPercent={(datum.value / max) * 100} />
        )
        const title = datum.hint ?? `${datum.label} · ${datum.valueLabel}`

        return (
          <li key={datum.key}>
            {onSelect ? (
              <button
                type="button"
                title={title}
                onClick={() => onSelect(datum)}
                className="flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-sunken"
              >
                {content}
              </button>
            ) : (
              <div title={title} className="flex w-full items-center gap-3 px-1.5 py-1">
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function BarRowContent({
  datum,
  labelWidth,
  widthPercent,
}: {
  datum: BarDatum
  labelWidth: string
  widthPercent: number
}) {
  return (
    <>
      <span
        className="shrink-0 truncate text-[12px] leading-5 text-ink-2"
        style={{ width: labelWidth }}
      >
        {datum.label}
      </span>
      <span className="relative h-5 flex-1 rounded-[3px] bg-surface-sunken">
        <span
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{
            width: `${Math.max(widthPercent, 1.5)}%`,
            backgroundColor:
              datum.emphasis === false ? 'var(--color-mark-soft)' : 'var(--color-mark)',
          }}
        />
      </span>
      <span className="w-24 shrink-0 text-right text-[12px] leading-5 font-medium text-ink tnum">
        {datum.valueLabel}
      </span>
    </>
  )
}
