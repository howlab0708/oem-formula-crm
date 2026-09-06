'use client'

import { useEffect, useRef, useState } from 'react'
import { formatInt, formatMilligrams } from '@/lib/format'
import type { Product } from '@/lib/types'

type Props = {
  product: Product | null
  /** 현재 결과 안에서의 위치 (0-based). 없으면 -1 */
  position: number
  total: number
  onClose: () => void
  onStep: (delta: number) => void
  onFilterBySub: (name: string) => void
  onMatchFormula: (product: Product) => void
}

/**
 * 우측 슬라이드오버.
 *
 * 화면 중앙을 덮는 모달 대신 오른쪽에서 밀려 들어온다. 뒤의 리스트를 가리지 않고
 * (넓은 화면에서는 본문이 그만큼 좁아진다), 위/아래 키로 다음 제품을 계속
 * 넘겨볼 수 있어 검색 결과의 맥락이 끊기지 않는다.
 */
export function DetailPanel({
  product,
  position,
  total,
  onClose,
  onStep,
  onFilterBySub,
  onMatchFormula,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const open = product !== null

  // 닫는 동안에도 내용을 잠시 붙들어 둔다. 그러지 않으면 패널이 미끄러져 나가기 전에
  // 안이 텅 비어 '사라지는' 것처럼 보인다.
  const [rendered, setRendered] = useState<Product | null>(product)
  if (product !== null && product !== rendered) {
    // 렌더 중 상태 조정(React 가 권장하는 파생 상태 패턴). 즉시 다시 렌더된다.
    setRendered(product)
  }
  useEffect(() => {
    if (product) return
    const id = window.setTimeout(() => setRendered(null), 220)
    return () => window.clearTimeout(id)
  }, [product])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (typing) return
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault()
        onStep(1)
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault()
        onStep(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onStep])

  // 목록 위치가 바뀌면 패널 본문은 처음부터 읽는다.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [rendered?.id])

  return (
    <div
      role="dialog"
      aria-modal={false}
      aria-label="레퍼런스 상세"
      aria-hidden={!open}
      className={`fixed inset-y-0 right-0 z-40 flex w-[min(34rem,100vw)] flex-col border-l border-line bg-surface shadow-[-8px_0_24px_rgba(24,24,27,0.06)] transition-transform duration-200 ease-out ${
        open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`}
    >
      {rendered ? (
        <>
          <header className="border-b border-line px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-[16px] leading-6 font-semibold text-ink keep-all">
                  {rendered.name}
                </h2>
                <p className="mt-1 text-[13px] text-ink-3">{rendered.manufacturer}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="상세 닫기"
                className="shrink-0 rounded-md border border-line px-2 py-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-sunken"
              >
                닫기 (Esc)
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[12px] text-ink-3 tnum">
                {position >= 0 ? `${formatInt(position + 1)} / ${formatInt(total)}` : '-'}
              </p>
              <div className="flex gap-1.5">
                <StepButton label="이전 (↑)" onClick={() => onStep(-1)} disabled={position <= 0} />
                <StepButton
                  label="다음 (↓)"
                  onClick={() => onStep(1)}
                  disabled={position < 0 || position >= total - 1}
                />
              </div>
            </div>
          </header>

          <div ref={panelRef} className="flex-1 overflow-y-auto scroll-contain px-6 py-5">
            <Row label="제조원" value={rendered.manufacturer} />
            {rendered.brand ? <Row label="브랜드명" value={rendered.brand} /> : null}
            <Row
              label="제형 및 규격"
              value={`${rendered.form} · ${rendered.weightLabel}`}
              sub={
                rendered.formRaw && rendered.formRaw !== rendered.form
                  ? `원본 표기: ${rendered.formRaw}`
                  : undefined
              }
            />
            <Row label="1알 중량" value={formatMilligrams(rendered.unitWeightMg)} sub={rendered.intakeMethod || undefined} />

            <Block label="기능성 주원료">
              {rendered.mainIngredients.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {rendered.mainIngredients.map((name) => (
                    <li
                      key={name}
                      className="rounded border border-accent-line bg-accent-soft px-2 py-1 text-[13px] text-accent-strong"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">표기 없음</p>
              )}
            </Block>

            <Block label="지표성분 상세 함량">
              {rendered.markers.length ? (
                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {rendered.markers.map((marker) => (
                      <tr key={`${marker.name}-${marker.unit}`} className="border-b border-line last:border-b-0">
                        <td className="py-2 pr-3 text-ink-2 keep-all">{marker.name}</td>
                        <td className="py-2 text-right font-medium text-ink tnum">
                          {marker.value.toLocaleString('ko-KR')}
                          {marker.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {rendered.mainDetail ? (
                <p className="mt-2 text-[13px] leading-5 text-ink-3 keep-all">
                  원문: {rendered.mainDetail}
                </p>
              ) : rendered.markers.length === 0 ? (
                <p className="text-[13px] text-ink-3">표기 없음</p>
              ) : null}
            </Block>

            <Block
              label={`부원료 전체 내역 (${formatInt(rendered.subIngredients.length)}종)`}
              hint="누르면 해당 부원료를 포함 조건으로 겁니다."
            >
              {rendered.subIngredients.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {rendered.subIngredients.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => onFilterBySub(name)}
                        className="rounded border border-line bg-surface px-2 py-1 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-sunken"
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">표기 없음</p>
              )}
            </Block>

            {rendered.reportNo || rendered.reportedAt || rendered.primaryFunction ? (
              <Block label="신고 정보">
                <dl className="flex flex-col gap-1.5 text-[13px]">
                  {rendered.reportNo ? (
                    <MetaRow term="신고번호" description={rendered.reportNo} />
                  ) : null}
                  {rendered.reportedAt ? (
                    <MetaRow term="신고일자" description={rendered.reportedAt} />
                  ) : null}
                  {rendered.primaryFunction ? (
                    <MetaRow term="주된 기능성" description={rendered.primaryFunction} />
                  ) : null}
                </dl>
              </Block>
            ) : null}
          </div>

          <footer className="border-t border-line px-6 py-4">
            <button
              type="button"
              onClick={() => onMatchFormula(rendered)}
              className="w-full rounded-md bg-accent px-3 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-accent-strong"
            >
              해당 배합비로 조건 맞추기
            </button>
            <p className="mt-2 text-[12px] leading-4 text-ink-3 keep-all">
              주원료와 제형을 이 제품과 동일하게 맞춰 유사 레퍼런스를 다시 검색합니다.
            </p>
          </footer>
        </>
      ) : null}
    </div>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:text-ink-3 disabled:hover:bg-surface"
    >
      {label}
    </button>
  )
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex gap-4 border-b border-line py-3.5 first:pt-0">
      <span className="w-28 shrink-0 text-[13px] font-medium text-ink-3">{label}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] leading-5 text-ink keep-all">{value}</span>
        {sub ? <span className="mt-0.5 block text-[12px] text-ink-3">{sub}</span> : null}
      </span>
    </div>
  )
}

function Block({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-line py-4 last:border-b-0">
      <h3 className="text-[13px] font-medium text-ink-3">{label}</h3>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function MetaRow({ term, description }: { term: string; description: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-3">{term}</dt>
      <dd className="min-w-0 flex-1 text-ink-2 keep-all">{description}</dd>
    </div>
  )
}
