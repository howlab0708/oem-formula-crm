'use client'

import { ChartCard } from '@/components/charts/ChartCard'
import { ColumnHistogram } from '@/components/charts/ColumnHistogram'
import { HorizontalBars } from '@/components/charts/HorizontalBars'
import { formatDecimal, formatInt, formatPercent } from '@/lib/format'
import type { Briefing } from '@/lib/export/briefing'

export function MainIngredientCharts({ briefing, onSelect }: {
  briefing: Briefing
  onSelect: (names: string[]) => void
}) {
  const { stats, topIngredients, topCombos } = briefing.main
  return <>
    <ChartCard title="주원료 투입 개수 분포"
      caption="한 제품에 들어간 주원료 종수. 현재 검색 조건에 맞는 레퍼런스를 집계합니다."
      note="같은 주원료의 중복 표기는 한 번만 셉니다. 0종은 주원료 미확인, 10+는 10종 이상입니다."
      isEmpty={briefing.referenceCount === 0}
      table={{ columns: ['주원료 종수', '건수', '비중'], rows: stats.histogram.map((bin) => [
        `${bin.label}종`, formatInt(bin.count), formatPercent(bin.count / briefing.referenceCount, 1),
      ]) }}>
      <ColumnHistogram ariaLabel="주원료 투입 개수 분포" data={stats.histogram.map((bin) => ({
        key: bin.label, label: bin.label, value: bin.count,
        hint: `주원료 ${bin.label}종 · ${formatInt(bin.count)}건`,
      }))} reference={{ position: Math.min(stats.average, stats.histogram.length - 1), label: `평균 ${formatDecimal(stats.average, 1)}종` }} />
    </ChartCard>
    <ChartCard title="다빈도 주원료" caption="레퍼런스에서 자주 쓰인 주원료. 막대를 누르면 해당 주원료로 검색합니다."
      isEmpty={topIngredients.length === 0} emptyMessage="집계할 주원료가 없습니다."
      table={{ columns: ['주원료', '건수', '채택률'], rows: topIngredients.map((item) => [item.label, formatInt(item.count), formatPercent(item.share, 1)]) }}>
      <HorizontalBars ariaLabel="다빈도 주원료" labelWidth="min(9rem, 38%)" data={topIngredients.map((item) => ({
        key: item.label, label: item.label, value: item.count,
        valueLabel: `${formatPercent(item.share)} · ${formatInt(item.count)}건`,
        hint: `${item.label} · ${formatInt(item.count)}건 (${formatPercent(item.share, 1)})`,
      }))} onSelect={(datum) => onSelect([datum.label])} />
    </ChartCard>
    <ChartCard title="다빈도 주원료 조합" caption="같은 제품에 함께 들어간 주원료 쌍. 막대를 누르면 두 원료로 검색합니다."
      note="2건 이상 동시 등장한 조합만 표시합니다. 선택 시 주원료 조건이 해당 조합으로 바뀝니다."
      isEmpty={topCombos.length === 0} emptyMessage="반복 등장하는 주원료 조합이 없습니다. 조건을 넓혀 보세요."
      table={{ columns: ['조합', '동시 등장', '비중'], rows: topCombos.map((item) => [item.label, formatInt(item.count), formatPercent(item.share, 1)]) }}>
      <HorizontalBars ariaLabel="다빈도 주원료 조합" labelWidth="min(13rem, 42%)" data={topCombos.map((item, index) => ({
        key: String(index), label: item.label, value: item.count, valueLabel: `${formatInt(item.count)}건`,
        hint: `${item.label} · ${formatInt(item.count)}건 동시 등장`,
      }))} onSelect={(datum) => onSelect(topCombos[Number(datum.key)].ingredients)} />
    </ChartCard>
  </>
}
