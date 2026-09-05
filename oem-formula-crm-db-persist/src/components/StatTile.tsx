'use client'

type Props = {
  label: string
  value: string
  /** 값 옆 단위. 값보다 작게 붙어 숫자 크기를 유지한다. */
  unit?: string
  context?: string
  /** 대시보드가 이끄는 단 하나의 숫자. 한 화면에 하나만 둔다. */
  hero?: boolean
}

export function StatTile({ label, value, unit, context, hero = false }: Props) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-[11px] leading-4 font-medium text-ink-3">{label}</p>
      <p
        className={`mt-1.5 font-semibold text-ink keep-all ${
          hero ? 'text-[32px] leading-9' : 'text-[20px] leading-7'
        }`}
      >
        {value}
        {unit ? <span className="ml-1 text-[13px] font-medium text-ink-2">{unit}</span> : null}
      </p>
      {context ? (
        <p className="mt-1 text-[11px] leading-4 text-ink-3 keep-all">{context}</p>
      ) : null}
    </div>
  )
}
