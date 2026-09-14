'use client'

type Props = {
  label: string
  /** 값. 셀 수 없는 조건이면 `null` 을 주고 `emptyLabel` 로 이유를 적는다. */
  value: string | null
  /** 값 옆 단위. 값보다 작게 붙어 숫자 크기를 유지한다. */
  unit?: string
  context?: string
  /**
   * 값이 없을 때 그 자리에 적을 이유.
   * 큰 글씨의 '-' 는 카드가 비어 보이게만 하고 왜 비었는지는 말해 주지 않는다.
   */
  emptyLabel?: string
  /** 대시보드가 이끄는 단 하나의 숫자. 한 화면에 하나만 둔다. */
  hero?: boolean
}

export function StatTile({ label, value, unit, context, emptyLabel = '확인 가능한 자료 없음', hero = false }: Props) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-[13px] leading-5 font-medium text-ink-2">{label}</p>
      {value === null ? (
        <p className="mt-1.5 text-[15px] leading-6 font-medium text-ink-3 keep-all">{emptyLabel}</p>
      ) : (
        <p
          className={`mt-1.5 font-semibold text-ink keep-all ${
            hero ? 'text-[32px] leading-9' : 'text-[24px] leading-8'
          }`}
        >
          {value}
          {unit ? <span className="ml-1 text-[14px] font-medium text-ink-2">{unit}</span> : null}
        </p>
      )}
      {context ? (
        <p className="mt-1.5 text-[13px] leading-5 text-ink-2 keep-all">{context}</p>
      ) : null}
    </div>
  )
}
