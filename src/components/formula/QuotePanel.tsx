'use client'

/**
 * 간접비 · 견적 요약 · 수량 구간.
 *
 * 엑셀의 ‘포장단위당 견적금액’ 표에 해당한다. 간접비 항목이 공장마다 달라
 * (일반관리비·기업이윤 / +품질관리비 / 고정비(물류포함)) 고정 칸이 아니라 목록으로 뒀고,
 * 산출 방식은 ‘무엇의 몇 %’ 를 이름으로 적은 아홉 가지 중에서 고른다 - 방식·기준·앞선
 * 항목 포함을 칸 세 개로 나누면 조합이 24 가지가 되어 배우지 않고는 쓸 수 없다.
 */

import { formatWon, formatWonDecimal, num, overheadBaseOf } from '@/lib/formulaDesign/calc'
import type { Tier, Totals } from '@/lib/formulaDesign/calc'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type {
  OverheadBase,
  OverheadMode,
  OverheadRow,
  QuoteSettings,
  QuoteTier,
  RoundMode,
} from '@/lib/formulaDesign/types'

const fieldClass = 'rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink'

/**
 * 간접비 산출 방식. `방식 × 기준 × 앞선 간접비 포함` 을 사람이 읽는 이름 하나로 묶었다.
 * 고를 수 있는 조합은 그대로고 손잡이만 셋에서 하나로 줄었다 - 실제 견적서에 나오는
 * 방식이 아래 아홉 가지고, 어느 금액에 %를 거는지가 이름에 그대로 적혀 있다.
 */
type Recipe = {
  id: string
  label: string
  hint: string
  suffix: string
  mode: OverheadMode
  base?: OverheadBase
  includePrior?: boolean
}

const RECIPES: Recipe[] = [
  { id: 'amount', label: '금액 그대로', hint: '견적서에 적힌 금액을 그대로 씁니다.', suffix: '원', mode: 'amount' },
  { id: 'perSet', label: '세트당 단가', hint: '세트 수를 곱합니다.', suffix: '원', mode: 'perSet' },
  { id: 'perUnit', label: '낱개당 단가', hint: '총 낱개 수(정)를 곱합니다.', suffix: '원', mode: 'perUnit' },
  { id: 'rate:total', label: '원가 합계의 %', hint: '1~4 블록 + 재고비에 %를 겁니다.', suffix: '%', mode: 'rate', base: 'total' },
  {
    id: 'rate:total:prior',
    label: '원가 합계 + 위 항목의 %',
    hint: '원가 합계에 이 줄보다 위에 있는 간접비를 더한 금액에 %를 겁니다.',
    suffix: '%', mode: 'rate', base: 'total', includePrior: true,
  },
  { id: 'rate:process', label: '가공비의 %', hint: '가공비만 기준으로 %를 겁니다.', suffix: '%', mode: 'rate', base: 'process' },
  {
    id: 'rate:process:prior',
    label: '가공비 + 위 항목의 %',
    hint: '가공비에 이 줄보다 위에 있는 간접비를 더한 금액에 %를 겁니다.',
    suffix: '%', mode: 'rate', base: 'process', includePrior: true,
  },
  { id: 'rate:material', label: '원료비의 %', hint: '원료비만 기준으로 %를 겁니다.', suffix: '%', mode: 'rate', base: 'material' },
  {
    id: 'rate:material:prior',
    label: '원료비 + 위 항목의 %',
    hint: '원료비에 이 줄보다 위에 있는 간접비를 더한 금액에 %를 겁니다.',
    suffix: '%', mode: 'rate', base: 'material', includePrior: true,
  },
]

const recipeIdOf = (row: OverheadRow): string =>
  row.mode === 'rate' ? `rate:${row.base ?? 'total'}${row.includePrior ? ':prior' : ''}` : row.mode

const recipeOf = (row: OverheadRow): Recipe =>
  RECIPES.find((item) => item.id === recipeIdOf(row)) ?? RECIPES[0]

/** 고른 이름 하나를 방식·기준·앞선 포함 세 칸으로 되돌린다. */
const recipePatch = (recipe: Recipe): Partial<OverheadRow> => ({
  mode: recipe.mode,
  base: recipe.base ?? 'total',
  includePrior: recipe.includePrior ?? false,
})

const ROUND_UNITS = ['1', '10', '100', '1000']
const ROUND_MODES: { value: RoundMode; label: string }[] = [
  { value: 'round', label: '반올림' },
  { value: 'floor', label: '절사' },
  { value: 'ceil', label: '올림' },
]

type Props = {
  quote: QuoteSettings
  totals: Totals
  tiers: Tier[]
  dispatch: (action: SheetAction) => void
}

export function QuotePanel({ quote, totals, tiers, dispatch }: Props) {
  const setQuote = (key: keyof QuoteSettings, value: string) => dispatch({ type: 'quote', key, value })
  const patch = (id: string, next: Partial<OverheadRow>) => dispatch({ type: 'overhead', id, patch: next })
  const patchTier = (id: string, next: Partial<QuoteTier>) => dispatch({ type: 'tier', id, patch: next })

  const bases = { total: totals.baseCost, process: totals.processCost, material: totals.materialCost }
  // 수량 구간은 세트 수만 바꿔 다시 계산한다. 총액으로 적은 간접비는 그때 함께 늘지
  // 않아 구간이 커질수록 단가가 실제보다 낮게 나온다 - 그 상태를 짚어 준다.
  const frozen = totals.overheads.filter((item) => item.row.mode === 'amount' && item.amount > 0)
  const tierWarning = tiers.length > 0 && frozen.length > 0
  const emptyOverheads = totals.overheads.filter((item) => !String(item.row.value ?? '').trim())

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section aria-labelledby="overhead-title" className="rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div>
            <h3 id="overhead-title" className="text-[14px] font-semibold text-ink">
              간접비
            </h3>
            <p className="text-[12px] text-ink-3">
              항목마다 산출 방식을 고르면 무엇에 얼마를 걸었는지 금액 아래에 그대로 적힙니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'add-overhead' })}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            항목 추가
          </button>
        </header>

        <ul className="divide-y divide-line">
          {totals.overheads.map((item, position) => {
            const recipe = recipeOf(item.row)
            const isRate = item.row.mode === 'rate'
            // 이 줄 위쪽 간접비의 합계. ‘위 항목’ 을 기준에 넣은 줄에 더해진다.
            const prior = totals.overheads.slice(0, position).reduce((sum, prev) => sum + prev.amount, 0)
            const baseAmount = overheadBaseOf(item.row, bases, prior)
            const name = item.row.label || '간접비'
            return (
              <li key={item.row.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input
                  value={item.row.label}
                  aria-label="간접비 항목명"
                  placeholder="예: 일반관리비"
                  onChange={(event) => patch(item.row.id, { label: event.target.value })}
                  className={`${fieldClass} min-w-0 flex-1`}
                />
                <select
                  value={recipe.id}
                  aria-label={`${name} 산출 방식`}
                  title={recipe.hint}
                  onChange={(event) => {
                    const next = RECIPES.find((option) => option.id === event.target.value)
                    if (next) patch(item.row.id, recipePatch(next))
                  }}
                  className={`${fieldClass} w-[13rem]`}
                >
                  {RECIPES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1">
                  <input
                    value={item.row.value}
                    inputMode="decimal"
                    aria-label={`${name} 값 (${recipe.suffix})`}
                    onChange={(event) => patch(item.row.id, { value: event.target.value })}
                    className={`${fieldClass} w-20 text-right tnum`}
                  />
                  <span className="text-[12px] text-ink-3">{recipe.suffix}</span>
                </span>
                <span className="w-36 text-right">
                  <span className="block text-[13px] tnum text-ink">{formatWon(item.amount)}원</span>
                  {isRate ? (
                    <span className="block text-[11px] tnum text-ink-3">{formatWon(baseAmount)}원의 {item.row.value || 0}%</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'remove', block: 'overheads', id: item.row.id })}
                  aria-label={`${item.row.label || '간접비'} 항목 삭제`}
                  className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  ✕
                </button>
              </li>
            )
          })}
          {totals.overheads.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-ink-3">
              간접비 항목이 없습니다. 일반관리비·기업이윤 등을 추가하세요.
            </li>
          ) : null}
        </ul>

        {emptyOverheads.length > 0 ? (
          <p role="status" className="border-t border-line bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {emptyOverheads.map((item) => item.row.label || '간접비').join(' · ')} 값이 비어 있어 0원으로 계산됩니다 —
            마진 없는 견적이 나갑니다.
          </p>
        ) : null}

        {/* 공장마다 한 번 정하고 다시 건드리지 않는 값들. 한 묶음으로 모아 둔다. */}
        <fieldset className="border-t border-line px-3 py-3">
          <legend className="text-[12px] font-semibold text-ink-2">견적 마무리 규칙</legend>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
            <label className="block">
              <span className="block text-[12px] text-ink-2">부가세율</span>
              <span className="flex items-center gap-1">
                <input
                  value={quote.vatRate}
                  inputMode="decimal"
                  onChange={(event) => setQuote('vatRate', event.target.value)}
                  className={`${fieldClass} w-16 text-right tnum`}
                />
                <span className="text-[12px] text-ink-3">%</span>
              </span>
            </label>
            <label className="block">
              <span className="block text-[12px] text-ink-2">재고비</span>
              <span className="flex items-center gap-1">
                <input
                  value={quote.stockRate}
                  inputMode="decimal"
                  placeholder="없음"
                  aria-describedby="stock-hint"
                  onChange={(event) => setQuote('stockRate', event.target.value)}
                  className={`${fieldClass} w-16 text-right tnum`}
                />
                <span className="text-[12px] text-ink-3">%</span>
              </span>
              <span id="stock-hint" className="mt-0.5 block text-[11px] text-ink-3">
                원료비+부자재비에 걸립니다
              </span>
            </label>
            <div>
              <span className="block text-[12px] text-ink-2">최종 단가 끝자리</span>
              <span className="mt-0.5 flex items-center gap-1">
                <select
                  value={quote.roundUnit}
                  aria-label="최종 단가를 맞출 자리"
                  onChange={(event) => setQuote('roundUnit', event.target.value)}
                  className={fieldClass}
                >
                  {ROUND_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {Number(unit).toLocaleString('ko-KR')}원
                    </option>
                  ))}
                </select>
                <select
                  value={quote.roundMode}
                  aria-label="최종 단가 끝자리 처리"
                  onChange={(event) => setQuote('roundMode', event.target.value)}
                  className={fieldClass}
                >
                  {ROUND_MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        </fieldset>

        <div className="border-t border-line px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-[13px] font-semibold text-ink">수량 구간별 단가</h4>
              <p id="tier-hint" className="text-[11px] text-ink-3">
                대량 고객에게 깎아 주는 만큼을 구간마다 적습니다. 공장이 낮춰 준 항목에{' '}
                <span className="font-medium">할인율을 그대로</span> 넣으세요 — 가공비 8% 인하면 <b>8</b>. 비워 두면
                수량만 바꿔 다시 계산합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'add-tier' })}
              className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
            >
              구간 추가
            </button>
          </div>

          {quote.tiers.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[13px]">
                <caption className="sr-only">수량 구간별 할인율 입력</caption>
                <thead>
                  <tr className="text-[11px] text-ink-3">
                    <th scope="col" rowSpan={2} className="px-1 pb-1 text-right align-bottom font-medium">
                      수량(set)
                    </th>
                    <th scope="colgroup" colSpan={3} className="border-b border-line px-1 pb-1 text-center font-medium">
                      할인율 (%) · 공장이 낮춰 준 항목에만
                    </th>
                    <th scope="col" rowSpan={2} className="px-1 pb-1 text-left align-bottom font-medium">
                      근거
                    </th>
                    <th scope="col" rowSpan={2} className="px-1 py-1" aria-label="구간 삭제" />
                  </tr>
                  <tr className="text-[11px] text-ink-3">
                    <th scope="col" className="px-1 pt-1 text-right font-normal">원료비</th>
                    <th scope="col" className="px-1 pt-1 text-right font-normal">부자재비</th>
                    <th scope="col" className="px-1 pt-1 text-right font-normal">가공비</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.tiers.map((tier, position) => {
                    const label = tier.setCount.trim() || `${position + 1}번째 구간`
                    const discountCell = (
                      key: 'materialDiscount' | 'packagingDiscount' | 'processDiscount',
                      name: string,
                    ) => (
                      <td className="px-1 py-1">
                        <input
                          value={tier[key]}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`${label} ${name} 할인율(%)`}
                          title={`${name}를 몇 % 낮춰 받는지. 8 이면 8% 인하.`}
                          onChange={(event) => patchTier(tier.id, { [key]: event.target.value })}
                          className={`${fieldClass} w-full text-right tnum ${
                            num(tier[key]) > 0 ? 'text-accent-strong' : ''
                          }`}
                        />
                      </td>
                    )
                    return (
                      <tr key={tier.id}>
                        <td className="px-1 py-1">
                          <input
                            value={tier.setCount}
                            inputMode="numeric"
                            placeholder="3000"
                            aria-label={`${label} 수량(set)`}
                            onChange={(event) => patchTier(tier.id, { setCount: event.target.value })}
                            className={`${fieldClass} w-full text-right tnum`}
                          />
                        </td>
                        {discountCell('materialDiscount', '원료비')}
                        {discountCell('packagingDiscount', '부자재비')}
                        {discountCell('processDiscount', '가공비')}
                        <td className="px-1 py-1">
                          <input
                            value={tier.note}
                            placeholder="예: 공장 구두 확인 09-10"
                            aria-label={`${label} 비고`}
                            onChange={(event) => patchTier(tier.id, { note: event.target.value })}
                            className={`${fieldClass} w-full`}
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'remove', block: 'tiers', id: tier.id })}
                            aria-label={`${label} 삭제`}
                            className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {tierWarning ? (
            <p role="status" className="mt-2 rounded-md bg-danger-soft px-2 py-1 text-[11px] text-danger">
              ‘금액 그대로’ 로 적은 간접비({frozen.map((item) => item.row.label || '간접비').join(' · ')})는 수량이 늘어도
              그대로여서 구간 단가가 실제보다 낮게 나옵니다. 산출 방식을 ‘가공비의 %’ 처럼 바꾸면 수량에 따라 함께
              움직입니다.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="summary-title" className="rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-3 py-2">
          <h3 id="summary-title" className="text-[14px] font-semibold text-ink">
            견적 요약
          </h3>
          <p className="text-[12px] text-ink-3">
            {totals.setCount > 0 ? `${totals.setCount.toLocaleString('ko-KR')}set 기준` : '수량(set)을 입력하세요'}
          </p>
        </header>

        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">항목별 금액과 세트당 단가</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-ink-2">
              <th scope="col" className="px-3 py-1.5 text-left font-medium">항목</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">금액(원)</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">set당(원)</th>
            </tr>
          </thead>
          <tbody>
            {totals.perSet.map((entry, position) => (
              <tr key={`${entry.label}-${position}`} className="border-b border-line/70">
                <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-2">
                  {entry.label}
                </th>
                <td className="px-3 py-1.5 text-right tnum">{formatWon(entry.total)}</td>
                <td className="px-3 py-1.5 text-right tnum">{formatWonDecimal(entry.perSet)}</td>
              </tr>
            ))}
            <tr className="border-b border-line bg-surface-sunken font-medium">
              <th scope="row" className="px-3 py-2 text-left">공급가 (VAT 별도)</th>
              <td className="px-3 py-2 text-right tnum">{formatWon(totals.supplyTotal)}</td>
              <td className="px-3 py-2 text-right tnum">{formatWonDecimal(totals.supplyPerSet)}</td>
            </tr>
            <tr className="border-b border-line">
              <th scope="row" className="px-3 py-2 text-left text-accent-strong">
                최종 단가
                <span className="ml-1 text-[11px] font-normal text-ink-3">
                  {Number(quote.roundUnit || 1).toLocaleString('ko-KR')}원 {ROUND_MODES.find((m) => m.value === quote.roundMode)?.label}
                </span>
              </th>
              <td className="px-3 py-2 text-right tnum">{formatWon(totals.quoteTotal)}</td>
              <td className="px-3 py-2 text-right text-[15px] font-semibold tnum text-accent-strong">
                {formatWon(totals.unitPrice)}
              </td>
            </tr>
            <tr>
              <th scope="row" className="px-3 py-2 text-left">
                제안가 (VAT 포함)
                <span className="ml-1 text-[11px] font-normal text-ink-3">절사 전 공급가 기준</span>
              </th>
              <td className="px-3 py-2 text-right tnum">{formatWon(totals.proposalTotal)}</td>
              <td className="px-3 py-2 text-right font-medium tnum">{formatWon(totals.proposalPerSet)}</td>
            </tr>
          </tbody>
        </table>

        {totals.excludedCost > 0 ? (
          <p className="border-t border-line px-3 py-2 text-[12px] text-ink-2">
            별도 청구(초도비용 등) <span className="tnum font-medium">{formatWon(totals.excludedCost)}</span>원은 위 금액에
            포함되지 않았습니다.
          </p>
        ) : null}

        {tiers.length ? (
          <div className="border-t border-line px-3 py-2">
            <h4 className="text-[12px] font-medium text-ink-2">수량 구간별 단가</h4>
            <table className="mt-1 w-full border-collapse text-[13px]">
              <caption className="sr-only">수량 구간별 최종 단가, 할인 전 단가와의 차이, 합계</caption>
              <thead>
                <tr className="text-[12px] text-ink-3">
                  <th scope="col" className="py-1 text-left font-medium">수량(set)</th>
                  <th scope="col" className="py-1 text-right font-medium">단가(원)</th>
                  <th scope="col" className="py-1 text-right font-medium">할인 전 대비</th>
                  <th scope="col" className="py-1 text-right font-medium">합계(VAT 별도)</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => {
                  // 할인을 걸지 않았을 때의 단가와 비교해 실제 할인 폭을 그대로 보여 준다.
                  const gap = tier.unitPrice - tier.basePrice
                  const percent = tier.basePrice > 0 ? (gap / tier.basePrice) * 100 : 0
                  return (
                    <tr key={tier.row.id} className={tier.current ? 'font-medium text-accent-strong' : ''}>
                      <th scope="row" className="py-1 text-left font-normal tnum">
                        {tier.setCount.toLocaleString('ko-KR')}
                        {tier.current ? <span className="ml-1 text-[11px]">현재</span> : null}
                      </th>
                      <td className="py-1 text-right tnum">{formatWon(tier.unitPrice)}</td>
                      <td className={`py-1 text-right tnum text-[12px] ${gap < 0 ? 'text-accent-strong' : 'text-ink-3'}`}>
                        {gap === 0 ? '—' : `${formatWon(gap)}원 (${percent.toFixed(1)}%)`}
                      </td>
                      <td className="py-1 text-right tnum">{formatWon(tier.quoteTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <label className="block border-t border-line px-3 py-3">
          <span className="block text-[12px] font-medium text-ink-2">견적 조건 (고객용 PDF 에 들어갑니다)</span>
          <textarea
            value={quote.conditions}
            rows={5}
            onChange={(event) => setQuote('conditions', event.target.value)}
            placeholder={'부가세 별도입니다.\n초도 1회성 비용은 별도 청구됩니다.'}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-3"
          />
        </label>
      </section>
    </div>
  )
}
