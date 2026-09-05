/**
 * 화면·텍스트·이미지·PDF 가 같은 숫자를 말하도록, 브리핑 내용을 한 곳에서 만든다.
 * 대시보드는 이 객체를 그리고, 내보내기는 같은 객체를 렌더한다.
 */

import {
  formDistribution,
  markerSummary,
  subIngredientCountStats,
  topManufacturers,
  topSubCombos,
  topSubIngredients,
  weightSummary,
  type CountItem,
  type MarkerSummary,
} from '../analytics'
import { filterChips, type FilterState } from '../filters'
import { formatDecimal, formatInt, formatMarkerValue, formatMg, formatPercent, formatToday } from '../format'
import type { Product } from '../types'

export type Briefing = {
  generatedAt: string
  conditions: Array<{ group: string; label: string }>
  referenceCount: number
  totalCount: number
  standardForm: CountItem | null
  formMix: CountItem[]
  subCount: { average: number; median: number; max: number }
  subHistogram: Array<{ label: string; bucket: number; count: number }>
  topSubs: CountItem[]
  topCombos: CountItem[]
  marker: MarkerSummary | null
  medianWeightMg: number | null
  topManufacturers: CountItem[]
}

export function buildBriefing(
  products: Product[],
  filters: FilterState,
  totalCount: number,
): Briefing {
  const formMix = formDistribution(products)
  const subStats = subIngredientCountStats(products)
  const weight = weightSummary(products)

  const marker = filters.marker
    ? markerSummary(products, filters.marker.name, filters.marker.unit)
    : null

  return {
    generatedAt: formatToday(),
    conditions: filterChips(filters).map((chip) => ({ group: chip.group, label: chip.label })),
    referenceCount: products.length,
    totalCount,
    standardForm: formMix[0] ?? null,
    formMix,
    subCount: { average: subStats.average, median: subStats.median, max: subStats.max },
    subHistogram: subStats.histogram,
    topSubs: topSubIngredients(products, 8),
    topCombos: topSubCombos(products, 6),
    marker,
    medianWeightMg: weight?.median ?? null,
    topManufacturers: topManufacturers(products, 5),
  }
}

/** 고객에게 그대로 붙여 넣을 수 있는 텍스트. 메신저 폭을 고려해 한 줄을 짧게 유지한다. */
export function briefingToText(briefing: Briefing): string {
  const lines: string[] = []
  lines.push('[OEM 배합 설계 브리핑]')
  lines.push(`· 작성일 ${briefing.generatedAt}`)

  const conditions = briefing.conditions.length
    ? briefing.conditions.map((c) => `${c.group} ${c.label}`).join(' / ')
    : '조건 미지정(전체)'
  lines.push(`· 검토 조건: ${conditions}`)
  lines.push(
    `· 시장 레퍼런스: ${formatInt(briefing.referenceCount)}건 (전체 ${formatInt(
      briefing.totalCount,
    )}건 중)`,
  )

  if (briefing.standardForm) {
    lines.push(
      `· 시장 표준 제형: ${briefing.standardForm.label} (${formatPercent(
        briefing.standardForm.share,
      )} 채택)`,
    )
  }

  const formMix = briefing.formMix
    .slice(0, 3)
    .map((item) => `${item.label} ${formatPercent(item.share)}`)
    .join(', ')
  if (formMix) lines.push(`· 제형 분포: ${formMix}`)

  if (briefing.medianWeightMg !== null) {
    lines.push(`· 표준 규격(중앙값): ${formatMg(briefing.medianWeightMg)}`)
  }

  if (briefing.marker) {
    const m = briefing.marker
    lines.push(
      `· ${m.name} 시장 표준 함량: ${formatMarkerValue(m.median, m.unit)} ` +
        `(사분위 ${formatMarkerValue(m.p25, m.unit)}~${formatMarkerValue(m.p75, m.unit)}, n=${m.sampleSize})`,
    )
  }

  lines.push(
    `· 평균 부원료 투입: ${formatDecimal(briefing.subCount.average, 1)}종 ` +
      `(중앙값 ${formatDecimal(briefing.subCount.median, 0)}종, 부형제 제외)`,
  )

  if (briefing.topSubs.length) {
    lines.push(
      `· 다빈도 부원료: ${briefing.topSubs
        .slice(0, 5)
        .map((item) => `${item.label}(${formatPercent(item.share)})`)
        .join(', ')}`,
    )
  }

  if (briefing.topCombos.length) {
    lines.push(
      `· 다빈도 조합: ${briefing.topCombos
        .slice(0, 3)
        .map((item) => `${item.label} ${formatInt(item.count)}건`)
        .join(' / ')}`,
    )
  }

  if (briefing.topManufacturers.length) {
    lines.push(
      `· 주요 제조원: ${briefing.topManufacturers
        .slice(0, 3)
        .map((item) => `${item.label}(${formatInt(item.count)}건)`)
        .join(', ')}`,
    )
  }

  lines.push('※ 식약처 품목제조보고 공개 데이터 기준. 최종 배합은 처방 검토 후 확정됩니다.')
  return lines.join('\n')
}
