'use client'

import { useEffect, useRef } from 'react'
import { Modal } from '@/components/Modal'
import { ProductProvenanceSection } from '@/components/IngredientProvenance'
import { formatInt, formatMilligrams } from '@/lib/format'
import { ORIGIN_LABELS, originOfForm, productSources } from '@/lib/ingredientSource'
import type { Product } from '@/lib/types'
import { useProductTraceability } from '@/lib/useProductTraceability'

type Props = {
  product: Product | null
  /** 현재 결과 안에서의 위치 (0-based). 없으면 -1 */
  position: number
  total: number
  onClose: () => void
  onStep: (delta: number) => void
  onFilterBySub: (name: string) => void
  onMatchFormula: (product: Product) => void
  onCreateQuote: (product: Product) => void
}

/** 선택한 레퍼런스를 배경과 구분되는 팝업에서 확인한다. */
export function DetailPanel({
  product,
  position,
  total,
  onClose,
  onStep,
  onFilterBySub,
  onMatchFormula,
  onCreateQuote,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const open = product !== null

  const trace = useProductTraceability(product)
  const rendered = trace.product

  // 판정 결과는 제품별로 캐시되므로(productSources) 여기서 매 렌더 계산해도 값싸다.
  const sources = rendered ? productSources(rendered) : null
  const sourceRows = sources
    ? [...sources.forms.entries()]
        .map(([nutrient, forms]) => ({ nutrient, forms: [...forms].sort((a, b) => a.localeCompare(b, 'ko')) }))
        .sort((a, b) => a.nutrient.localeCompare(b.nutrient, 'ko'))
    : []
  const excipientForms = sources ? [...sources.excipientForms] : []

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
    panelRef.current?.parentElement?.scrollTo({ top: 0 })
  }, [rendered?.id])

  if (!rendered) return null

  return (
    <Modal title={`레퍼런스 상세 · ${rendered.name}`} onClose={onClose} footer={
          <div>
            <button
              type="button"
              onClick={() => onCreateQuote(rendered)}
              disabled={trace.loading}
              className="w-full rounded-md bg-accent px-3 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {trace.loading ? '원료 정보 확인 중…' : <>이 제품으로 견적 만들기 <span aria-hidden>→</span></>}
            </button>
            <p className="mt-2 text-[12px] leading-4 text-ink-3 keep-all">
              원료·규격과 확인된 원료사·원산지를 함께 가져옵니다. 배합비율·단가를 입력해 견적을 완성하세요.
            </p>
            <button type="button" onClick={() => onMatchFormula(rendered)}
              className="mt-3 w-full rounded-md border border-line px-3 py-2 text-[13px] text-ink-2 hover:bg-surface-sunken">
              같은 원료·제형으로 제품 더 찾기
            </button>
          </div>
    }>
          <header className="border-b border-line pb-4">
            <div className="flex items-center justify-between gap-3">
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

          <div ref={panelRef} className="py-4">
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

            <ProductProvenanceSection key={rendered.id} product={rendered} loading={trace.loading} error={trace.error} onRetry={trace.retry} />

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

            {/* 원재료명에 적힌 형태를 성분별로 되짚어 준다 - 같은 아연도 산화아연과
                건조효모는 취급·단가·라벨 소구가 다르다. */}
            <Block label="영양성분 원료 형태">
              {sourceRows.length ? (
                <table className="w-full border-collapse text-[13px]">
                  <tbody>
                    {sourceRows.map((row) => (
                      <tr key={row.nutrient} className="border-b border-line last:border-b-0">
                        <td className="py-2 pr-3 align-top text-ink-2 keep-all">{row.nutrient}</td>
                        <td className="py-2 text-right text-ink keep-all">
                          {row.forms.map((form) => {
                            const origin = originOfForm(form)
                            return (
                              <span key={form} className="block">
                                {form}
                                {/* 형태 이름이 이미 '(형태 미표기)' 라고 말하면 같은 말을 두 번 쓰지 않는다. */}
                                {origin === 'unspecified' ? null : (
                                  <span className="ml-1.5 text-[12px] text-ink-3">{ORIGIN_LABELS[origin]}</span>
                                )}
                              </span>
                            )
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[13px] text-ink-3">원재료명에서 영양성분 원료를 찾지 못했습니다.</p>
              )}
              {/* 영양원으로 세지 않은 이유를 남긴다. 조용히 빼면 왜 칼슘이 안 잡히는지 알 수 없다. */}
              {excipientForms.length > 0 ? (
                <p className="mt-2 text-[12px] leading-4 text-ink-3 keep-all">
                  부형제로 판정해 영양원에서 뺀 원료: {excipientForms.join(' · ')}
                </p>
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


    </Modal>
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
