'use client'

/**
 * 브리핑을 캔버스 한 장으로 그린다.
 *
 * 메신저로 바로 보낼 수 있는 세로형 카드(1080px 폭)를 만들고, 같은 캔버스를
 * PDF 에도 재사용한다. HTML 을 스크린샷하는 라이브러리를 쓰지 않는 이유는
 * 한글 폰트/레이아웃이 브라우저마다 어긋나는 것을 피하기 위해서다.
 */

import { formatDecimal, formatInt, formatMarkerValue, formatMilligrams, formatPercent } from '../format'
import type { Briefing } from './briefing'
import { loadExportImage } from './loadImage'
import { hasIssuer, type Issuer } from './issuer'

const WIDTH = 1080
const PADDING = 64
const SCALE = 2

type Palette = {
  surface: string
  sunken: string
  line: string
  ink: string
  ink2: string
  ink3: string
  mark: string
  markSoft: string
}

function readPalette(): Palette {
  const fallback: Palette = {
    surface: '#ffffff',
    sunken: '#f6f6f7',
    line: '#e4e4e7',
    ink: '#18181b',
    ink2: '#52525b',
    ink3: '#7b7b85',
    mark: '#2a78d6',
    markSoft: '#9ec5f4',
  }
  if (typeof window === 'undefined') return fallback

  const styles = getComputedStyle(document.documentElement)
  const read = (name: string, value: string) => styles.getPropertyValue(name).trim() || value

  return {
    surface: read('--color-surface', fallback.surface),
    sunken: read('--color-surface-sunken', fallback.sunken),
    line: read('--color-line', fallback.line),
    ink: read('--color-ink', fallback.ink),
    ink2: read('--color-ink-2', fallback.ink2),
    ink3: read('--color-ink-3', fallback.ink3),
    mark: read('--color-mark', fallback.mark),
    markSoft: read('--color-mark-soft', fallback.markSoft),
  }
}

const FONT_STACK = `'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif`

function font(size: number, weight: number = 400): string {
  return `${weight} ${size}px ${FONT_STACK}`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/(\s+)/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current + word
    if (ctx.measureText(candidate).width <= maxWidth || current === '') {
      current = candidate
    } else {
      lines.push(current.trimEnd())
      current = word.trimStart()
    }
  }
  if (current.trim()) lines.push(current.trimEnd())
  return lines
}

const ISSUER_BOX = 380
const ISSUER_LABEL = 96
const CARD_SEAL = 92

/**
 * 오른쪽 위 공급자 칸과 직인. 배합 제안서 PDF 와 같은 자리·같은 항목이다
 * (`renderFormulaSheet.ts` 의 같은 이름 함수). 이 카드도 고객에게 그대로 나가므로
 * 등록해 둔 표시가 여기에도 찍혀야 한다.
 *
 * 칸의 아래끝을 돌려준다. 제목은 로고와 이 칸 중 더 아래에서 시작한다.
 */
async function drawIssuer(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  issuer: Issuer,
  top: number,
): Promise<number> {
  const rows = [
    { label: '등록번호', value: issuer.registration },
    { label: '상호', value: issuer.company },
    { label: '대표자', value: issuer.ceo },
    { label: '주소', value: issuer.address },
    { label: '연락처', value: issuer.contact },
  ].filter((row) => row.value.trim())
  if (!rows.length && !issuer.seal) return top

  const left = WIDTH - PADDING - ISSUER_BOX
  const seal = issuer.seal ? await loadExportImage(issuer.seal, '직인') : null
  // 직인 자리를 비워 두고 접는다. 안 그러면 긴 주소가 인영 아래로 들어가 안 읽힌다.
  const valueWidth = ISSUER_BOX - ISSUER_LABEL - 28 - (seal ? CARD_SEAL - 8 : 0)
  ctx.font = font(15)
  const wrapped = rows.map((row) => ({ ...row, lines: wrap(ctx, row.value, valueWidth) }))
  const height = Math.max(
    wrapped.reduce((sum, row) => sum + Math.max(1, row.lines.length) * 22, 0) + 34,
    seal ? CARD_SEAL + 38 : 0,
  )

  ctx.fillStyle = palette.sunken
  ctx.fillRect(left, top, ISSUER_BOX, height)
  ctx.strokeStyle = palette.line
  ctx.lineWidth = 1
  ctx.strokeRect(left + 0.5, top + 0.5, ISSUER_BOX - 1, height - 1)

  ctx.fillStyle = palette.ink3
  ctx.font = font(13, 600)
  ctx.fillText('공 급 자', left + 14, top + 22)

  let y = top + 46
  let companyRowY = y
  for (const row of wrapped) {
    ctx.fillStyle = palette.ink3
    ctx.font = font(14)
    ctx.fillText(row.label, left + 14, y)
    ctx.fillStyle = palette.ink2
    ctx.font = font(15, row.label === '상호' ? 600 : 400)
    row.lines.forEach((line, index) => ctx.fillText(line, left + ISSUER_LABEL, y + index * 22))
    if (row.label === '상호') companyRowY = y
    y += Math.max(1, row.lines.length) * 22
  }

  if (seal) {
    const scale = Math.min(CARD_SEAL / seal.width, CARD_SEAL / seal.height)
    const w = seal.width * scale
    const h = seal.height * scale
    const x = left + ISSUER_BOX - w - 12
    const sealY = Math.min(Math.max(top + 26, companyRowY - h / 2 + 2), top + height - h - 8)
    ctx.drawImage(seal, x, sealY, w, h)
  }
  return top + height
}

/** 브리핑 카드를 그린 캔버스를 돌려준다. 폰트 로딩이 끝난 뒤 호출해야 한다. */
export async function renderBriefingCard(
  briefing: Briefing,
  options: { logo?: string | null; issuer?: Issuer | null; sourceLines?: string[]; customer?: boolean } = {},
): Promise<HTMLCanvasElement> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    await document.fonts.ready
  }

  const palette = readPalette()
  const scratch = document.createElement('canvas')
  scratch.width = WIDTH * SCALE
  scratch.height = 3000 * SCALE
  const ctx = scratch.getContext('2d')
  if (!ctx) throw new Error('캔버스를 생성하지 못했습니다.')

  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = palette.surface
  ctx.fillRect(0, 0, WIDTH, 3000)
  ctx.textBaseline = 'alphabetic'

  const contentWidth = WIDTH - PADDING * 2
  let y = PADDING

  // ── 우리 회사 표시(로고 · 공급자 칸 · 직인) ──────────────
  const headTop = y
  let logoBottom = y
  if (options.logo) {
    const logo = await loadExportImage(options.logo, '로고')
    const scale = Math.min(200/logo.width, 64/logo.height)
    ctx.drawImage(logo, PADDING, y, logo.width*scale, logo.height*scale)
    logoBottom = y + 64
  }
  const issuer = options.issuer && hasIssuer(options.issuer) ? options.issuer : null
  const issuerBottom = issuer ? await drawIssuer(ctx, palette, issuer, headTop) : y
  y = Math.max(logoBottom, issuerBottom)
  if (y > headTop) y += 18

  // ── 헤더 ────────────────────────────────────────────────
  ctx.fillStyle = palette.ink
  ctx.font = font(34, 700)
  ctx.fillText('OEM 배합 설계 브리핑', PADDING, (y += 34))

  ctx.fillStyle = palette.ink3
  ctx.font = font(16)
  ctx.fillText(
    `${briefing.generatedAt} 작성${options.customer ? ' · 고객용 보기' : ''}`,
    PADDING,
    (y += 28),
  )

  for (const line of options.sourceLines ?? []) {
    for (const part of wrap(ctx, line, contentWidth)) ctx.fillText(part, PADDING, (y += 23))
  }
  y += 24
  ctx.fillStyle = palette.line
  ctx.fillRect(PADDING, y, contentWidth, 1)
  y += 32

  // ── 검토 조건 ───────────────────────────────────────────
  y = drawSectionLabel(ctx, palette, '검토 조건', PADDING, y)
  const conditionText = briefing.conditions.length
    ? briefing.conditions.map((c) => `${c.group} · ${c.label}`).join('    ')
    : '조건 미지정 (전체 데이터)'
  ctx.font = font(18)
  ctx.fillStyle = palette.ink
  for (const line of wrap(ctx, conditionText, contentWidth)) {
    ctx.fillText(line, PADDING, (y += 26))
  }
  y += 30

  // ── KPI 3칸 ─────────────────────────────────────────────
  const gap = 16
  const tileWidth = (contentWidth - gap * 2) / 3
  const tileHeight = 118
  const tiles: Array<[string, string, string]> = [
    [
      '시장 레퍼런스',
      `${formatInt(briefing.referenceCount)}건`,
      `전체 ${formatInt(briefing.totalCount)}건 중`,
    ],
    [
      '시장 표준 제형',
      briefing.standardForm?.label ?? '-',
      briefing.standardForm ? `${formatPercent(briefing.standardForm.share)} 채택` : '데이터 없음',
    ],
    [
      '평균 부원료 투입',
      `${formatDecimal(briefing.subCount.average, 1)}종`,
      `중앙값 ${formatDecimal(briefing.subCount.median, 0)}종 · 부형제 제외`,
    ],
  ]

  tiles.forEach(([label, value, context], index) => {
    const x = PADDING + index * (tileWidth + gap)
    ctx.fillStyle = palette.sunken
    roundRect(ctx, x, y, tileWidth, tileHeight, 10)
    ctx.fill()

    ctx.fillStyle = palette.ink3
    ctx.font = font(14, 500)
    ctx.fillText(label, x + 20, y + 32)

    ctx.fillStyle = palette.ink
    ctx.font = font(30, 700)
    ctx.fillText(value, x + 20, y + 72)

    ctx.fillStyle = palette.ink3
    ctx.font = font(13)
    ctx.fillText(truncate(ctx, context, tileWidth - 40), x + 20, y + 98)
  })
  y += tileHeight + 38

  // ── 제형 분포 ───────────────────────────────────────────
  if (briefing.formMix.length) {
    y = drawSectionLabel(ctx, palette, '시장 다빈도 제형', PADDING, y)
    y = drawBars(
      ctx,
      palette,
      briefing.formMix.slice(0, 5).map((item) => ({
        label: item.label,
        value: item.count,
        valueLabel: `${formatPercent(item.share)} · ${formatInt(item.count)}건`,
      })),
      PADDING,
      y + 10,
      contentWidth,
    )
    y += 26
  }

  // ── 지표성분 표준 함량 ──────────────────────────────────
  if (briefing.marker) {
    const m = briefing.marker
    y = drawSectionLabel(ctx, palette, '지표성분 시장 표준 함량', PADDING, y)
    ctx.fillStyle = palette.ink
    ctx.font = font(20, 600)
    ctx.fillText(`${m.name} ${formatMarkerValue(m.median, m.unit)}`, PADDING, (y += 30))
    ctx.fillStyle = palette.ink3
    ctx.font = font(15)
    ctx.fillText(
      `중앙값 기준 · 사분위 ${formatMarkerValue(m.p25, m.unit)}~${formatMarkerValue(
        m.p75,
        m.unit,
      )} · 표본 ${formatInt(m.sampleSize)}건`,
      PADDING,
      (y += 24),
    )
    y += 34
  }

  if (briefing.medianWeightMg !== null) {
    y = drawSectionLabel(ctx, palette, '1알 중량', PADDING, y)
    ctx.fillStyle = palette.ink
    ctx.font = font(20, 600)
    ctx.fillText(`${formatMilligrams(briefing.medianWeightMg)} (중앙값) · 환산 가능 ${formatInt(briefing.weightSampleSize)}건`, PADDING, (y += 30))
    y += 30
  }

  // ── 다빈도 부원료 ───────────────────────────────────────
  if (briefing.topSubs.length) {
    y = drawSectionLabel(ctx, palette, '다빈도 부원료', PADDING, y)
    y = drawBars(
      ctx,
      palette,
      briefing.topSubs.slice(0, 5).map((item) => ({
        label: item.label,
        value: item.count,
        valueLabel: `${formatPercent(item.share)} · ${formatInt(item.count)}건`,
      })),
      PADDING,
      y + 10,
      contentWidth,
    )
    y += 26
  }

  // ── 인기 조합 ───────────────────────────────────────────
  if (briefing.topCombos.length) {
    y = drawSectionLabel(ctx, palette, '다빈도 부원료 조합', PADDING, y)
    ctx.font = font(18)
    for (const combo of briefing.topCombos.slice(0, 4)) {
      y += 28
      ctx.fillStyle = palette.ink
      ctx.fillText(truncate(ctx, combo.label, contentWidth - 140), PADDING, y)
      ctx.fillStyle = palette.ink3
      ctx.textAlign = 'right'
      ctx.fillText(`${formatInt(combo.count)}건`, WIDTH - PADDING, y)
      ctx.textAlign = 'left'
    }
    y += 34
  }

  // ── 각주 ────────────────────────────────────────────────
  ctx.fillStyle = palette.line
  ctx.fillRect(PADDING, y, contentWidth, 1)
  y += 26
  ctx.fillStyle = palette.ink3
  ctx.font = font(14)
  for (const line of wrap(
    ctx,
    options.sourceLines ? '본 자료는 위에 표시된 출처에서 집계한 시장 현황입니다. 최종 배합·함량은 처방 검토 및 원료 수급 확인 후 확정됩니다.' : '본 자료는 식약처 품목제조보고 공개 데이터에서 집계한 시장 현황입니다. 최종 배합·함량은 처방 검토 및 원료 수급 확인 후 확정됩니다.',
    contentWidth,
  )) {
    ctx.fillText(line, PADDING, (y += 22))
  }
  y += PADDING

  return crop(scratch, y)
}

function drawSectionLabel(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  text: string,
  x: number,
  y: number,
): number {
  ctx.fillStyle = palette.ink2
  ctx.font = font(15, 600)
  ctx.fillText(text, x, y)
  return y + 6
}

type BarInput = { label: string; value: number; valueLabel: string }

function drawBars(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  data: BarInput[],
  x: number,
  y: number,
  width: number,
): number {
  const labelWidth = 190
  const valueWidth = 170
  const trackWidth = width - labelWidth - valueWidth - 32
  const rowHeight = 34
  const barHeight = 18
  const max = Math.max(...data.map((d) => d.value), 1)
  let cursor = y

  for (const datum of data) {
    const centerY = cursor + rowHeight / 2

    ctx.fillStyle = palette.ink2
    ctx.font = font(16)
    ctx.textBaseline = 'middle'
    ctx.fillText(truncate(ctx, datum.label, labelWidth - 12), x, centerY)

    const trackX = x + labelWidth
    ctx.fillStyle = palette.sunken
    roundRect(ctx, trackX, centerY - barHeight / 2, trackWidth, barHeight, 3)
    ctx.fill()

    const barWidth = Math.max((datum.value / max) * trackWidth, 4)
    ctx.fillStyle = palette.mark
    roundRectRightRounded(ctx, trackX, centerY - barHeight / 2, barWidth, barHeight, 4)
    ctx.fill()

    ctx.fillStyle = palette.ink
    ctx.font = font(15, 500)
    ctx.textAlign = 'right'
    ctx.fillText(datum.valueLabel, x + width, centerY)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    cursor += rowHeight
  }

  return cursor
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function roundRectRightRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, [0, radius, radius, 0])
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let result = text
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result}…`
}

function crop(source: HTMLCanvasElement, height: number): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = WIDTH * SCALE
  output.height = Math.round(height * SCALE)
  const ctx = output.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, 0, 0, output.width, output.height, 0, 0, output.width, output.height)
  return output
}
