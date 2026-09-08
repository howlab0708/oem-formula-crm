'use client'

/**
 * 간접비 · 견적 요약 · 수량 구간.
 *
 * 엑셀의 ‘포장단위당 견적금액’ 표에 해당한다. 간접비 항목이 공장마다 달라
 * (일반관리비·기업이윤 / +품질관리비 / 고정비(물류포함)) 고정 칸이 아니라 목록으로 뒀고,
 * 산출 방식도 총액·원가 대비 %·세트당 단가·낱개당 단가 네 가지를 고를 수 있다.
 */

import { formatWon, formatWonDecimal } from '@/lib/formulaDesign/calc'
import type { Tier, Totals } from '@/lib/formulaDesign/calc'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type { OverheadMode, OverheadRow, QuoteSettings, RoundMode } from '@/lib/formulaDesign/types'

const fieldClass = 'rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink'

const MODES: { value: OverheadMode; label: string; suffix: string }[] = [
  { value: 'amount', label: '총액', suffix: '원' },
  { value: 'rate', label: '원가 대비', suffix: '%' },
  { value: 'perSet', label: '세트당', suffix: '원' },
  { value: 'perUnit', label: '낱개당', suffix: '원' },
]

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
  const setQuote = (key: keyof QuoteSettings, value: string | string[]) => dispatch({ type: 'quote', key, value })
  const patch = (id: string, next: Partial<OverheadRow>) => dispatch({ type: 'overhead', id, patch: next })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section aria-labelledby="overhead-title" className="rounded-lg border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div>
            <h3 id="overhead-title" className="text-[14px] font-semibold text-ink">
              간접비
            </h3>
            <p className="text-[12px] text-ink-3">
              ‘원가 대비 %’ 는 1~4 블록 합계({formatWon(totals.baseCost)}원)를 기준으로 계산합니다.
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
          {totals.overheads.map((item) => {
            const mode = MODES.find((option) => option.value === item.row.mode) ?? MODES[0]
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
                  value={item.row.mode}
                  aria-label={`${item.row.label || '간접비'} 산출 방식`}
                  onChange={(event) => patch(item.row.id, { mode: event.target.value as OverheadMode })}
                  className={fieldClass}
                >
                  {MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1">
                  <input
                    value={item.row.value}
                    inputMode="decimal"
                    aria-label={`${item.row.label || '간접비'} 값`}
                    onChange={(event) => patch(item.row.id, { value: event.target.value })}
                    className={`${fieldClass} w-24 text-right tnum`}
                  />
                  <span className="text-[12px] text-ink-3">{mode.suffix}</span>
                </span>
                <span className="w-28 text-right text-[13px] tnum text-ink">{formatWon(item.amount)}원</span>
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

        <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 py-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-ink-2">부가세율 (%)</span>
            <input
              value={quote.vatRate}
              inputMode="decimal"
              onChange={(event) => setQuote('vatRate', event.target.value)}
              className={`${fieldClass} w-20 text-right tnum`}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-ink-2">최종 단가 자리</span>
            <select
              value={quote.roundUnit}
              onChange={(event) => setQuote('roundUnit', event.target.value)}
              className={fieldClass}
            >
              {ROUND_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {Number(unit).toLocaleString('ko-KR')}원
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-ink-2">처리</span>
            <select
              value={quote.roundMode}
              onChange={(event) => setQuote('roundMode', event.target.value)}
              className={fieldClass}
            >
              {ROUND_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[12rem] flex-1">
            <span className="block text-[12px] font-medium text-ink-2">수량 구간 (set, 쉼표로 구분)</span>
            <input
              value={quote.tiers.join(', ')}
              placeholder="1000, 3000, 5000"
              aria-describedby="tier-hint"
              onChange={(event) =>
                setQuote(
                  'tiers',
                  event.target.value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean),
                )
              }
              className={`${fieldClass} w-full tnum`}
            />
            <span id="tier-hint" className="mt-0.5 block text-[11px] text-ink-3">
              수량만 바꿔 단가를 다시 계산합니다. 사용량을 직접 입력한 줄은 배합량 기준으로 봅니다.
            </span>
          </label>
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
              <th scope="row" className="px-3 py-2 text-left">제안가 (VAT 포함)</th>
              <td className="px-3 py-2 text-right tnum">{formatWon(totals.paymentTotal)}</td>
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
              <caption className="sr-only">수량 구간별 최종 단가와 합계</caption>
              <thead>
                <tr className="text-[12px] text-ink-3">
                  <th scope="col" className="py-1 text-left font-medium">수량(set)</th>
                  <th scope="col" className="py-1 text-right font-medium">단가(원)</th>
                  <th scope="col" className="py-1 text-right font-medium">합계(VAT 별도)</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.setCount} className={tier.current ? 'font-medium text-accent-strong' : ''}>
                    <th scope="row" className="py-1 text-left font-normal tnum">
                      {tier.setCount.toLocaleString('ko-KR')}
                      {tier.current ? <span className="ml-1 text-[11px]">현재</span> : null}
                    </th>
                    <td className="py-1 text-right tnum">{formatWon(tier.unitPrice)}</td>
                    <td className="py-1 text-right tnum">{formatWon(tier.quoteTotal)}</td>
                  </tr>
                ))}
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
