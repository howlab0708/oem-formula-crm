'use client'

import { StatTile } from '@/components/StatTile'
import type { Briefing } from '@/lib/export/briefing'
import { DASHBOARD_REFERENCE, type DashboardSummary } from '@/lib/dashboardSummary'
import { RDA_PROFILES, RDA_SOURCE, RDA_VERSION } from '@/lib/rda'
import { formatInt, formatMilligrams, formatPercent } from '@/lib/format'

const amount = (value: number, unit: string) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}${unit}`
export function DashboardSummaryCards({ briefing, summary, rdaProfile, onRdaProfileChange }: {
  briefing: Briefing; summary: DashboardSummary; rdaProfile: string; onRdaProfileChange: (value: string) => void
}) {
  const { unitWeight, content } = summary
  const empty = briefing.referenceCount === 0
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="시장 배합비 핵심 지표">
        <StatTile label="시장 표준 제형" value={briefing.standardForm?.label ?? '-'} context={briefing.standardForm
          ? `${formatPercent(briefing.standardForm.share)} 채택 · ${formatInt(briefing.standardForm.count)}건` : '데이터 없음'} />
        <StatTile label="표준 1회분 중량" value={formatMilligrams(unitWeight.median)} context={unitWeight.count
          ? `최소 물리적 단위의 중앙값 · 확인 ${formatInt(unitWeight.count)} / ${formatInt(briefing.referenceCount)}건`
          : empty ? '데이터 없음' : '1정·1캡슐·1포의 중량 확인 필요'} />
        <div className="rounded-lg border border-accent/25 bg-surface px-5 py-4">
          <p className="text-[11px] leading-4 font-medium text-ink-3">핵심원료 고함량 제품 비율</p>
          <p className="mt-1.5 text-[24px] leading-8 font-semibold text-ink">{content.highShare === null ? '-' : formatPercent(content.highShare, 1)}</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-2">{empty ? '데이터 없음' : '권장량 100% 이상인 제품의 비율'}</p>
          <p className="mt-1 text-[11px] leading-4 text-ink-3">함량 확인 {formatInt(content.productCount)}건 · 권장량 비교 가능 {formatInt(content.comparableCount)}건</p>
          <label className="mt-2 block text-[11px] text-ink-3">권장량 비교 대상
            <select value={rdaProfile} onChange={e => onRdaProfileChange(e.target.value)} className="mt-1 w-full rounded border border-line bg-surface p-1 text-ink-2">
              {RDA_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <StatTile label="데이터 규모" value={formatInt(briefing.referenceCount)} unit="건" context={`전체 ${formatInt(briefing.totalCount)}건 중 조건 일치`} />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface px-5 py-3 text-[12px] text-ink-2" aria-label="시장 참여 지표">
        <p>개별인정형 원료 포함 <strong className="ml-1 text-ink">{summary.recognizedShare === null ? '-' : formatPercent(summary.recognizedShare, 1)}</strong>
          <span className="ml-2 text-ink-3">확인 {formatInt(summary.recognizedCount)} / {formatInt(briefing.referenceCount)}건</span></p>
        <p>참여 제조사 <strong className="ml-1 text-ink">{formatInt(summary.manufacturerCount)}개</strong>
          <span className="ml-2 text-ink-3">제조사 확인 {formatInt(summary.manufacturerKnownCount)}건</span></p>
      </div>

      <details className="group rounded-lg border border-line bg-surface text-[12px] text-ink-2">
        <summary className="cursor-pointer px-5 py-3 font-medium text-ink focus-visible:outline-2 focus-visible:outline-accent">원료별 1일 함량과 집계 기준 확인</summary>
        <div className="border-t border-line px-5 py-4">
          <p className="leading-5 keep-all">현재 조건에 맞는 제품에서 선택한 지표성분을 우선 표시합니다. 지표성분을 선택하지 않았다면 선택한 주원료, 주원료도 선택하지 않았다면 전체 지표성분을 집계합니다. 함량이 확인된 표본 수가 많은 순서입니다.</p>
          {content.rows.length ? <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full min-w-[620px] text-left text-[12px]">
              <caption className="sr-only">주원료 지표성분별 하루 함량 중앙값과 권장섭취량</caption>
              <thead className="sticky top-0 bg-surface text-ink-3"><tr>{['지표성분', '1일 함량 중앙값', '권장섭취량', '고함량 제품 비율', '함량 확인 / 비교 가능'].map(label => <th scope="col" key={label} className="border-b border-line px-3 py-2 font-medium">{label}</th>)}</tr></thead>
              <tbody>{content.rows.map(row => <tr key={row.key}>
                <th scope="row" className="border-b border-line px-3 py-2 font-medium text-ink">{row.name}</th>
                <td className="border-b border-line px-3 py-2 tabular-nums">{amount(row.median, row.unit)}</td>
                <td className="border-b border-line px-3 py-2">{row.rda === null ? '권장섭취량 없음·미등록' : amount(row.rda, row.rdaUnit)}</td>
                <td className="border-b border-line px-3 py-2">{row.highShare === null ? '비교 불가' : formatPercent(row.highShare, 1)}</td>
                <td className="border-b border-line px-3 py-2 whitespace-nowrap">{formatInt(row.count)} / {formatInt(row.comparableCount)}건</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="mt-3 rounded bg-canvas p-3">{empty ? '조건에 맞는 제품이 없습니다.' : '현재 조건에서 1일 함량을 확정할 수 있는 표본이 없습니다. 섭취방법과 지표성분의 함량 기준을 함께 확인해야 합니다.'}</p>}
          <ul className="mt-4 list-disc space-y-1 pl-4 text-[11px] leading-5 text-ink-3">
            <li>표준 1회분은 1정·1캡슐·1포 등 최소 물리적 단위입니다. 명시된 단위 중량 또는 총 내용량 ÷ 물리적 개수만 사용하며, 일수·하루 섭취 횟수로 나누지 않습니다. 정제·캡슐과 액상의 복합 포장, 제형에 맞는 개수를 확인할 수 없는 표본은 제외합니다.</li>
            <li>참고 범위 밖 표본: 정제(200~1,200mg) {formatInt(unitWeight.rangeChecks.tablet.outside)} / {formatInt(unitWeight.rangeChecks.tablet.count)}건, 캡슐(300~800mg) {formatInt(unitWeight.rangeChecks.capsule.outside)} / {formatInt(unitWeight.rangeChecks.capsule.count)}건. 범위 밖 값도 제거하지 않고 집계합니다.</li>
            <li>성분의 1일 함량은 해당 성분의 표시량 분모와 하루 총중량 또는 명시된 1일 함량으로 계산합니다. 원료 분말 전체의 투입 중량과는 다릅니다.</li>
            <li>고함량 제품 비율 = 선택된 원료 중 권장섭취량 100% 이상인 성분이 하나라도 있는 제품 수 ÷ 권장량 비교 가능한 제품 수. 한 제품은 한 번만 셉니다.</li>
            <li>{RDA_VERSION}의 성인 성별·연령별 권장섭취량(RNI, 요청하신 RDA에 해당)을 사용합니다. 충분섭취량·상한섭취량·식약처 기능성 범위로 대체하지 않습니다. 임신·수유부 기준은 포함하지 않습니다.</li>
            <li>권장섭취량이 없거나 미등록인 원료, 하루 함량·단위가 불명확한 표본은 비교에서 제외합니다. 비타민A는 RAE, 엽산은 DFE 당량 표기가 확인되어야 비교합니다.</li>
            <li>개별인정형 비율은 원료명의 개별인정형 표기 또는 기존 원료 목록의 인정 원료명과 정확히 일치한 제품 수 ÷ 조건 일치 제품 수입니다. 고시형과 동명이거나 미확인인 원료는 이름만으로 추정하지 않습니다. 제조사는 공백 차이를 통합하고 미상 표기를 제외합니다.</li>
          </ul>
          <a href={RDA_SOURCE} target="_blank" rel="noreferrer" className="mt-3 mr-4 inline-block text-[11px] underline underline-offset-2">{RDA_VERSION} · 권장섭취량 출처</a>
          <a href={DASHBOARD_REFERENCE.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] underline underline-offset-2">식약처 건강기능식품 공전 · 기존 원료 자료 검토일 {DASHBOARD_REFERENCE.reviewedOn}</a>
        </div>
      </details>
    </div>
  )
}
