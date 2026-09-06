'use client'

import { ChartCard } from '@/components/charts/ChartCard'
import { ColumnHistogram } from '@/components/charts/ColumnHistogram'
import { HorizontalBars } from '@/components/charts/HorizontalBars'
import { DashboardSummaryCards } from '@/components/DashboardSummaryCards'
import type { DashboardSummary } from '@/lib/dashboardSummary'
import { MainIngredientCharts } from '@/components/MainIngredientCharts'
import type { Briefing } from '@/lib/export/briefing'
import type { MarkerFilter } from '@/lib/filters'
import { formatDecimal, formatInt, formatMarkerValue, formatPercent } from '@/lib/format'
import type { FormType } from '@/lib/types'

type Props = {
  briefing: Briefing
  rdaProfile: string
  onRdaProfileChange: (value: string) => void
  summary: DashboardSummary
  selectedMarker: MarkerFilter | null
  onToggleForm: (form: FormType) => void
  onToggleSub: (name: string) => void
  onSelectCombo: (names: string[]) => void
  onSelectMains: (names: string[]) => void
}

export function BriefingDashboard({
  briefing,
  summary,
  rdaProfile,
  onRdaProfileChange,
  selectedMarker,
  onToggleForm,
  onToggleSub,
  onSelectCombo,
  onSelectMains,
}: Props) {
  const empty = briefing.referenceCount === 0

  const subHistogram = briefing.subHistogram.map((bin) => ({
    key: bin.label,
    label: bin.label,
    value: bin.count,
    hint: `부원료 ${bin.label}종 · ${formatInt(bin.count)}건 (${formatPercent(
      briefing.referenceCount ? bin.count / briefing.referenceCount : 0,
    )})`,
  }))

  const marker = briefing.marker
  const markerBins = marker?.histogram ?? []
  const markerReference = marker
    ? medianPosition(markerBins, marker.median)
    : null

  return (
    <section aria-label="상담 브리핑 대시보드" className="flex flex-col gap-4">
      <DashboardSummaryCards briefing={briefing} summary={summary} rdaProfile={rdaProfile} onRdaProfileChange={onRdaProfileChange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="시장 다빈도 제형"
          caption="조건에 맞는 레퍼런스의 제형 점유율. 막대를 누르면 해당 제형으로 좁힙니다."
          isEmpty={empty}
          table={{
            columns: ['제형', '건수', '비중'],
            rows: briefing.formMix.map((item) => [
              item.label,
              formatInt(item.count),
              formatPercent(item.share, 1),
            ]),
          }}
        >
          <HorizontalBars
            ariaLabel="제형별 점유율"
            labelWidth="min(5.5rem, 30%)"
            data={briefing.formMix.map((item) => ({
              key: item.label,
              label: item.label,
              value: item.count,
              valueLabel: `${formatPercent(item.share)} · ${formatInt(item.count)}건`,
              hint: `${item.label} ${formatInt(item.count)}건 (${formatPercent(item.share, 1)})`,
            }))}
            onSelect={(datum) => onToggleForm(datum.label as FormType)}
          />
        </ChartCard>

        <MainIngredientCharts briefing={briefing} onSelect={onSelectMains} />

        <ChartCard
          title="부원료 투입 개수 분포"
          caption="한 제품에 들어간 부원료 종수. 배합 난이도와 원가 구조를 가늠하는 값입니다."
          note="부형제(셀룰로오스·스테아린산마그네슘·피막제 등)는 제외하고 셉니다."
          isEmpty={empty || subHistogram.length === 0}
          table={{
            columns: ['부원료 종수', '건수'],
            rows: briefing.subHistogram.map((bin) => [`${bin.label}종`, formatInt(bin.count)]),
          }}
        >
          <ColumnHistogram
            ariaLabel="부원료 투입 개수 분포"
            data={subHistogram}
            reference={{
              // 칸 i 는 '부원료 i종'을 뜻하므로 평균값 자체가 곧 칸 좌표다.
              position: Math.min(briefing.subCount.average, briefing.subHistogram.length - 1),
              label: `평균 ${formatDecimal(briefing.subCount.average, 1)}종`,
            }}
          />
        </ChartCard>

        <ChartCard
          title="다빈도 부원료"
          caption="레퍼런스에서 가장 자주 쓰인 부원료. 막대를 누르면 포함 조건으로 겁니다."
          isEmpty={empty || briefing.topSubs.length === 0}
          emptyMessage="집계할 부원료가 없습니다."
          table={{
            columns: ['부원료', '건수', '채택률'],
            rows: briefing.topSubs.map((item) => [
              item.label,
              formatInt(item.count),
              formatPercent(item.share, 1),
            ]),
          }}
        >
          <HorizontalBars
            ariaLabel="다빈도 부원료"
            labelWidth="min(9rem, 38%)"
            data={briefing.topSubs.map((item) => ({
              key: item.label,
              label: item.label,
              value: item.count,
              valueLabel: `${formatPercent(item.share)} · ${formatInt(item.count)}건`,
              hint: `${item.label} ${formatInt(item.count)}건 (${formatPercent(item.share, 1)})`,
            }))}
            onSelect={(datum) => onToggleSub(datum.label)}
          />
        </ChartCard>

        <ChartCard
          title="다빈도 부원료 조합"
          caption="같은 제품에 함께 들어간 부원료 쌍. 막대를 누르면 두 원료를 동시에 겁니다."
          note="2건 이상 동시 등장한 조합만 표시합니다."
          isEmpty={empty || briefing.topCombos.length === 0}
          emptyMessage="반복 등장하는 조합이 아직 없습니다. 조건을 넓혀 보세요."
          table={{
            columns: ['조합', '동시 등장', '비중'],
            rows: briefing.topCombos.map((item) => [
              item.label,
              formatInt(item.count),
              formatPercent(item.share, 1),
            ]),
          }}
        >
          <HorizontalBars
            ariaLabel="다빈도 부원료 조합"
            labelWidth="min(13rem, 42%)"
            data={briefing.topCombos.map((item) => ({
              key: item.label,
              label: item.label,
              value: item.count,
              valueLabel: `${formatInt(item.count)}건`,
              hint: `${item.label} · ${formatInt(item.count)}건 동시 등장`,
            }))}
            onSelect={(datum) => onSelectCombo(datum.label.split(' + '))}
          />
        </ChartCard>
      </div>

      {selectedMarker ? (
        <ChartCard
          title={`${selectedMarker.name} 함량 분포`}
          caption={
            marker
              ? `표본 ${formatInt(marker.sampleSize)}건 · 중앙값 ${formatMarkerValue(
                  marker.median,
                  marker.unit,
                )} · 사분위 ${formatMarkerValue(marker.p25, marker.unit)}~${formatMarkerValue(
                  marker.p75,
                  marker.unit,
                )}`
              : '지표성분 함량을 읽을 수 있는 레퍼런스가 부족합니다.'
          }
          note="왼쪽 조건에서 지표성분을 지정하면 해당 성분 기준으로 다시 그립니다."
          isEmpty={!marker || markerBins.length === 0}
          emptyMessage="함량 표기를 해석할 수 있는 레퍼런스가 2건 미만입니다."
          table={{
            columns: [`구간 (${selectedMarker.unit})`, '건수'],
            rows: markerBins.map((bin) => [bin.label, formatInt(bin.count)]),
          }}
        >
          <ColumnHistogram
            ariaLabel={`${selectedMarker.name} 함량 분포`}
            data={markerBins.map((bin) => ({
              key: bin.label,
              label: bin.label,
              // 축에는 구간의 시작값만 찍는다. `0~1,000` 은 칸 폭보다 길어 잘려 나간다.
              axisLabel: Number.isInteger(bin.from) ? formatInt(bin.from) : formatDecimal(bin.from, 1),
              value: bin.count,
              hint: `${bin.label}${selectedMarker.unit} · ${formatInt(bin.count)}건`,
            }))}
            reference={
              markerReference !== null && marker
                ? {
                    position: markerReference,
                    label: `중앙값 ${formatMarkerValue(marker.median, marker.unit)}`,
                  }
                : undefined
            }
          />
        </ChartCard>
      ) : null}
    </section>
  )
}

/** 중앙값이 몇 번째 칸의 어디쯤에 놓이는지(칸 인덱스 기준 실수 좌표). */
function medianPosition(
  bins: Array<{ from: number; to: number }>,
  median: number,
): number | null {
  if (bins.length === 0) return null
  const index = bins.findIndex((bin) => median >= bin.from && median < bin.to)
  if (index < 0) return bins.length - 1
  const bin = bins[index]
  const span = bin.to - bin.from
  const fraction = span > 0 ? (median - bin.from) / span : 0.5
  return index + fraction - 0.5
}
