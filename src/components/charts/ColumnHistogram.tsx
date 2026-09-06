'use client'

import { useState } from 'react'

export type ColumnDatum = {
  key: string
  label: string
  value: number
  /** 툴팁 본문. 없으면 label · value 로 만든다. */
  hint?: string
}

type Props = {
  data: ColumnDatum[]
  ariaLabel: string
  valueSuffix?: string
  /** 평균·중앙값 기준선. position 은 0(첫 칸 중앙) ~ data.length-1(마지막 칸 중앙) 사이 실수. */
  reference?: { position: number; label: string }
  /** x축 라벨을 몇 칸마다 찍을지. 칸이 많을 때 라벨 충돌을 막는다. */
  labelEvery?: number
}

const PLOT_HEIGHT = 140
/** 막대 안에 값을 넣어도 읽히는 최소 높이 비율 */
const INSIDE_LABEL_MIN = 30

/**
 * 세로 막대 히스토그램.
 *
 * 분포의 모양(어디에 몰려 있는가)이 읽는 사람의 과제라 값을 전부 찍지 않고
 * 최빈 구간 하나만 직접 라벨한다. 나머지는 호버와 '표' 보기로 읽는다.
 */
export function ColumnHistogram({
  data,
  ariaLabel,
  valueSuffix = '건',
  reference,
  labelEvery,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0)
  const step = labelEvery ?? (data.length > 10 ? 2 : 1)
  const active = hovered !== null ? data[hovered] : null
  const referenceLeft =
    reference && data.length > 0 ? ((reference.position + 0.5) / data.length) * 100 : null

  return (
    <div>
      {/* 위 여백은 기준선 라벨 자리다. 축 라벨까지 포함해 카드 안에서 잘리지 않게 잡는다. */}
      <div className="relative pt-5" role="img" aria-label={ariaLabel}>
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          {/* 눈금선 - 표면에서 한 단계만 떨어진 실선 */}
          <div className="pointer-events-none absolute inset-0">
            {[0, 0.5, 1].map((ratio) => (
              <div
                key={ratio}
                className="absolute inset-x-0 border-t border-line"
                style={{ top: `${ratio * 100}%` }}
              />
            ))}
          </div>

          <div className="flex h-full items-end gap-[2px]">
            {data.map((datum, index) => {
              const height = (datum.value / max) * 100
              const isPeak = index === peakIndex && datum.value > 0
              const inside = height >= INSIDE_LABEL_MIN

              return (
                <div
                  key={datum.key}
                  className="relative flex h-full flex-1 items-end"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered((prev) => (prev === index ? null : prev))}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered((prev) => (prev === index ? null : prev))}
                  tabIndex={0}
                  aria-label={`${datum.label} ${datum.value}${valueSuffix}`}
                >
                  {isPeak ? (
                    <span
                      className={`pointer-events-none absolute whitespace-nowrap text-[11px] font-medium tnum ${
                        // 첫·마지막 칸은 칸 바깥쪽 끝에 붙여 그림 영역을 넘지 않게 한다.
                        index === 0
                          ? 'left-0'
                          : index === data.length - 1
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2'
                      } ${inside ? 'rounded-[3px] px-1 text-white' : 'text-ink'}`}
                      style={{
                        bottom: inside
                          ? `calc(${height}% - 18px)`
                          : `calc(${height}% + 4px)`,
                        // 좁은 화면에서는 라벨이 막대보다 넓어진다. 막대 색을 깔아 두어야
                        // 삐져나온 흰 글씨가 흰 배경에 묻히지 않는다.
                        backgroundColor: inside
                          ? hovered === index
                            ? 'var(--color-accent-strong)'
                            : 'var(--color-mark)'
                          : undefined,
                      }}
                    >
                      {datum.value.toLocaleString('ko-KR')}
                    </span>
                  ) : null}
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max(height, datum.value > 0 ? 2 : 0)}%`,
                      backgroundColor:
                        hovered === index ? 'var(--color-accent-strong)' : 'var(--color-mark)',
                    }}
                  />
                </div>
              )
            })}
          </div>

          {referenceLeft !== null && reference ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 border-l border-ink-3"
              style={{ left: `${referenceLeft}%` }}
            >
              {/* 기준선이 오른쪽 끝에 서면 라벨을 선 왼쪽으로 넘겨 그림 밖으로 나가지 않게 한다. */}
              <span
                className={`absolute -top-5 whitespace-nowrap text-[10px] leading-4 font-medium text-ink-2 ${
                  referenceLeft > 70 ? 'right-1.5' : 'left-1.5'
                }`}
              >
                {reference.label}
              </span>
            </div>
          ) : null}
        </div>

        {active && hovered !== null ? (
          <div
            className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] whitespace-nowrap text-ink shadow-[0_2px_8px_rgba(24,24,27,0.08)]"
            style={{ left: `${((hovered + 0.5) / data.length) * 100}%` }}
          >
            {active.hint ?? `${active.label} · ${active.value.toLocaleString('ko-KR')}${valueSuffix}`}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex gap-[2px] border-t border-line pt-2">
        {data.map((datum, index) => (
          <div
            key={datum.key}
            className="flex-1 truncate text-center text-[10px] leading-4 text-ink-3 tnum"
          >
            {index % step === 0 || index === data.length - 1 ? datum.label : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
