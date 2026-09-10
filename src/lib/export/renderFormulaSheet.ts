'use client'

/**
 * 고객 배포용 배합 제안서를 A4 페이지 단위 캔버스로 그린다.
 *
 * 왜 화면 캡처(html2canvas)를 쓰지 않는가: 이 저장소의 브리핑 내보내기와 같은
 * 이유다. 한글 폰트 대체와 줄바꿈이 브라우저마다 달라 고객에게 가는 문서의
 * 줄 수가 달라진다. 캔버스에 직접 그리면 어디서 만들어도 같은 결과가 나온다.
 *
 * 페이지를 한 장씩 따로 그리는 이유: 한 장에 이어 그린 뒤 잘라 붙이면 표가
 * 페이지 경계에서 반으로 잘린다. 여기서는 줄을 그리기 전에 남은 높이를 보고
 * 모자라면 다음 장으로 넘긴다. 표가 넘어가면 머리글을 다시 그린다.
 *
 * 민감 정보 정책: 원료단가·금액·간접비·공급가는 절대 그리지 않는다. 고객이
 * 알아야 하는 값(최종 단가·합계·제안가·별도 청구 항목)만 선택적으로 넣는다.
 */

import { formatKg, formatWon, num, packageLabel, unitNoun } from '../formulaDesign/calc'
import type { Tier, Totals } from '../formulaDesign/calc'
import type { FormulaSheet } from '../formulaDesign/types'

/** A4 210×297mm 를 150dpi 로 그린다. */
const WIDTH = 1240
const HEIGHT = Math.round((WIDTH * 297) / 210)
const MARGIN = 76
const SCALE = 2
const CONTENT = WIDTH - MARGIN * 2

const FONT_STACK = `'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif`
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT_STACK}`

const INK = '#18181b'
const INK_2 = '#52525b'
const INK_3 = '#7b7b85'
const LINE = '#e4e4e7'
const SUNKEN = '#f6f6f7'
const ACCENT = '#1c5cab'

export type SheetExportOptions = {
  logo?: string | null
  /** 최종 단가·합계·제안가를 넣는다. 원가 내역은 어떤 경우에도 넣지 않는다. */
  showPrice: boolean
  /** 별도 청구(초도비용) 항목을 넣는다. */
  showExtras: boolean
  /** 수량 구간별 단가 표를 넣는다. */
  showTiers: boolean
  /** 문서 제목 */
  title: string
}

export const DEFAULT_SHEET_EXPORT: SheetExportOptions = {
  logo: null,
  showPrice: true,
  showExtras: true,
  showTiers: true,
  title: '배합 제안서',
}

type Page = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }

/** 페이지를 넘기며 그리는 커서. `space` 로 남은 높이를 확인한다. */
class Sheet {
  pages: Page[] = []
  ctx!: CanvasRenderingContext2D
  y = MARGIN

  constructor() {
    this.addPage()
  }

  addPage(): void {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH * SCALE
    canvas.height = HEIGHT * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('PDF 캔버스를 만들지 못했습니다.')
    ctx.scale(SCALE, SCALE)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.textBaseline = 'alphabetic'
    this.pages.push({ canvas, ctx })
    this.ctx = ctx
    this.y = MARGIN
  }

  /** 이 높이가 들어가지 않으면 다음 장으로 넘긴다. 넘겼으면 true. */
  space(height: number): boolean {
    if (this.y + height <= HEIGHT - MARGIN) return false
    this.addPage()
    return true
  }

  text(value: string, x: number, size: number, weight = 400, color = INK): void {
    this.ctx.fillStyle = color
    this.ctx.font = font(size, weight)
    this.y += size
    this.ctx.fillText(value, x, this.y)
  }

  rule(): void {
    this.ctx.fillStyle = LINE
    this.ctx.fillRect(MARGIN, this.y, CONTENT, 1)
    this.y += 1
  }
}

/** 줄바꿈. 어절 단위로 접고, 한 어절이 줄보다 길면 글자 단위로 자른다. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    const flush = () => {
      if (current.trim()) lines.push(current.trimEnd())
      current = ''
    }
    for (const chunk of paragraph.split(/(\s+)/)) {
      if (!chunk) continue
      let piece = chunk
      if (current && ctx.measureText(current + piece).width > maxWidth) {
        flush()
        piece = piece.trimStart()
      }
      current += piece
      // 공백 없이 이어지는 한글 문장은 어절로 갈리지 않으므로 글자 단위로 접는다.
      while (ctx.measureText(current).width > maxWidth && current.length > 1) {
        let cut = current.length - 1
        while (cut > 1 && ctx.measureText(current.slice(0, cut)).width > maxWidth) cut -= 1
        lines.push(current.slice(0, cut))
        current = current.slice(cut)
      }
    }
    flush()
  }
  return lines.length ? lines : ['']
}

function sectionTitle(sheet: Sheet, label: string): void {
  // 제목만 남고 내용이 다음 장으로 넘어가지 않게 표 머리글과 첫 줄 자리까지 확보한다.
  sheet.space(120)
  sheet.y += 14
  sheet.text(label, MARGIN, 16, 700, ACCENT)
  sheet.y += 8
  sheet.rule()
  sheet.y += 6
}

/** 두 칸짜리 정보 표(항목 · 값). */
function infoTable(sheet: Sheet, rows: [string, string][]): void {
  const labelWidth = 150
  for (const [label, value] of rows) {
    if (!value) continue
    sheet.ctx.font = font(13)
    const lines = wrap(sheet.ctx, value, CONTENT - labelWidth - 16)
    const height = Math.max(28, lines.length * 20 + 8)
    sheet.space(height)
    // 페이지가 넘어갔을 수 있으므로 그릴 대상은 여기서 잡는다. 먼저 잡으면 이전
    // 장의 여백 밖에 그려져 화면에서 사라진다.
    const ctx = sheet.ctx
    const top = sheet.y
    ctx.fillStyle = SUNKEN
    ctx.fillRect(MARGIN, top, labelWidth, height)
    ctx.fillStyle = INK_2
    ctx.font = font(13, 500)
    ctx.fillText(label, MARGIN + 12, top + 19)
    ctx.fillStyle = INK
    ctx.font = font(13)
    lines.forEach((line, index) => ctx.fillText(line, MARGIN + labelWidth + 14, top + 19 + index * 20))
    ctx.fillStyle = LINE
    ctx.fillRect(MARGIN, top + height, CONTENT, 1)
    sheet.y = top + height + 1
  }
}

type Column = { label: string; width: number; align?: 'left' | 'right' }

/** 표 머리글. 페이지가 넘어가면 다시 그린다. */
function tableHead(sheet: Sheet, columns: Column[]): void {
  // 머리글만 남고 줄이 다음 장으로 넘어가지 않도록 첫 줄 자리까지 본다.
  sheet.space(62)
  const ctx = sheet.ctx
  const top = sheet.y
  ctx.fillStyle = SUNKEN
  ctx.fillRect(MARGIN, top, CONTENT, 30)
  ctx.fillStyle = INK_2
  ctx.font = font(12, 600)
  let x = MARGIN + 12
  for (const column of columns) {
    if (column.align === 'right') ctx.textAlign = 'right'
    ctx.fillText(column.label, column.align === 'right' ? x + column.width - 24 : x, top + 20)
    ctx.textAlign = 'left'
    x += column.width
  }
  ctx.fillStyle = LINE
  ctx.fillRect(MARGIN, top + 30, CONTENT, 1)
  sheet.y = top + 31
}

function tableRow(sheet: Sheet, columns: Column[], cells: string[], strong = false): void {
  sheet.ctx.font = font(13)
  // 각 칸을 접었을 때 가장 높은 칸에 맞춰 줄 높이를 정한다.
  const wrapped = cells.map((cell, index) => wrap(sheet.ctx, cell || '-', columns[index].width - 24))
  const height = Math.max(...wrapped.map((lines) => lines.length)) * 20 + 12
  if (sheet.space(height)) tableHead(sheet, columns)
  // 페이지가 넘어갔을 수 있으므로 그릴 대상은 여기서 잡는다.
  const ctx = sheet.ctx
  const top = sheet.y
  let x = MARGIN + 12
  wrapped.forEach((lines, index) => {
    const column = columns[index]
    ctx.fillStyle = strong ? INK : index === 0 ? INK : INK_2
    ctx.font = font(13, strong || index === 0 ? 500 : 400)
    ctx.textAlign = column.align === 'right' ? 'right' : 'left'
    const drawX = column.align === 'right' ? x + column.width - 24 : x
    lines.forEach((line, lineIndex) => ctx.fillText(line, drawX, top + 20 + lineIndex * 20))
    ctx.textAlign = 'left'
    x += column.width
  })
  ctx.fillStyle = LINE
  ctx.fillRect(MARGIN, top + height, CONTENT, 1)
  sheet.y = top + height + 1
}

async function drawHeader(sheet: Sheet, spec: FormulaSheet['spec'], options: SheetExportOptions): Promise<void> {
  if (options.logo) {
    const logo = new Image()
    logo.src = options.logo
    await logo.decode().catch(() => {
      throw new Error('로고를 그리지 못했습니다. 이미지를 다시 선택해 주세요.')
    })
    const scale = Math.min(200 / logo.width, 56 / logo.height)
    sheet.ctx.drawImage(logo, MARGIN, sheet.y, logo.width * scale, logo.height * scale)
    sheet.y += 56 + 14
  }
  sheet.text(options.title, MARGIN, 26, 700)
  sheet.y += 10
  const subtitle = [spec.customer ? `${spec.customer} 귀중` : '', spec.productName].filter(Boolean).join(' · ')
  if (subtitle) sheet.text(subtitle, MARGIN, 15, 500, INK_2)
  const dates = [spec.quotedOn ? `견적일 ${spec.quotedOn}` : '', spec.validity ? `유효기간 ${spec.validity}` : '']
    .filter(Boolean)
    .join(' · ')
  if (dates) sheet.text(dates, MARGIN, 12, 400, INK_3)
  sheet.y += 12
  sheet.rule()
}

/** 페이지 아래쪽에 쪽 번호와 각주를 넣는다. */
function drawFooters(pages: Page[]): void {
  pages.forEach((page, index) => {
    const ctx = page.ctx
    ctx.fillStyle = LINE
    ctx.fillRect(MARGIN, HEIGHT - MARGIN + 22, CONTENT, 1)
    ctx.fillStyle = INK_3
    ctx.font = font(11)
    ctx.fillText(
      '최종 배합·함량은 처방 검토와 원료 수급 확인 후 확정됩니다. 표시 문구는 건강기능식품 공전 원문 기준입니다.',
      MARGIN,
      HEIGHT - MARGIN + 42,
    )
    ctx.textAlign = 'right'
    ctx.fillText(`${index + 1} / ${pages.length}`, WIDTH - MARGIN, HEIGHT - MARGIN + 42)
    ctx.textAlign = 'left'
  })
}

/**
 * 배합 제안서를 페이지별 캔버스로 그린다.
 * `downloadPagesAsPdf` 에 그대로 넘겨 A4 PDF 로 저장한다.
 */
export async function renderFormulaSheetPages(
  sheet: FormulaSheet,
  totals: Totals,
  tiers: Tier[],
  options: SheetExportOptions = DEFAULT_SHEET_EXPORT,
): Promise<HTMLCanvasElement[]> {
  if (typeof document !== 'undefined' && 'fonts' in document) await document.fonts.ready

  const spec = sheet.spec
  const noun = unitNoun(spec.form)
  const page = new Sheet()
  await drawHeader(page, spec, options)

  // ── 제품 규격 ───────────────────────────────────────────────
  sectionTitle(page, '제품 규격')
  infoTable(page, [
    ['제품명', spec.productName],
    ['식품유형', spec.foodType],
    ['제형 · 규격', [spec.form, packageLabel(spec)].filter(Boolean).join(' · ')],
    ['포장 형태', spec.packaging],
    ['섭취방법', spec.intakeGuide],
    ['유통기한', spec.shelfLife],
    ['발주 수량', totals.setCount > 0 ? `${totals.setCount.toLocaleString('ko-KR')} set (총 ${totals.totalUnits.toLocaleString('ko-KR')}${noun})` : ''],
  ])

  // ── 구성 및 포장지 ──────────────────────────────────────────
  const functional = totals.materials.filter((item) => item.row.functional)
  if (functional.length) {
    sectionTitle(page, '구성 및 포장지')
    const columns: Column[] = [
      { label: '기능성원료', width: 210 },
      { label: '일일섭취기준', width: 190 },
      { label: '표시량', width: 150 },
      { label: '기능성내용', width: CONTENT - 550 },
    ]
    tableHead(page, columns)
    for (const item of functional) {
      const label = [item.row.labelAmount, item.row.labelPercent ? `(${item.row.labelPercent})` : '']
        .filter(Boolean)
        .join(' ')
      tableRow(page, columns, [
        item.row.basis || item.row.name,
        item.row.dailyIntake ?? '',
        label,
        item.row.functionality ?? '',
      ])
    }
  }

  // ── 최종 배합표 ─────────────────────────────────────────────
  // 배합비율·단가·금액은 넣지 않는다. 고객에게 주는 것은 원료 구성과 표시량이다.
  sectionTitle(page, '최종 배합표')
  const named = totals.materials.filter((item) => item.row.name.trim())
  const functionalNames = named.filter((item) => item.row.functional)
  const subNames = named.filter((item) => !item.row.functional)
  if (functionalNames.length) {
    const columns: Column[] = [
      { label: '기능성 주원료', width: 320 },
      { label: '표시량 (1일 섭취량 기준)', width: 240 },
      { label: '비고', width: CONTENT - 560 },
    ]
    tableHead(page, columns)
    for (const item of functionalNames) {
      tableRow(page, columns, [item.row.name, item.row.labelAmount || '-', item.row.note])
    }
  }
  if (subNames.length) {
    page.y += 12
    page.space(60)
    page.text('부원료 구성', MARGIN, 13, 600, INK_2)
    page.y += 4
    const ctx = page.ctx
    ctx.font = font(13)
    for (const line of wrap(ctx, subNames.map((item) => item.row.name).join(', '), CONTENT)) {
      page.space(22)
      page.text(line, MARGIN, 13, 400, INK)
      page.y += 4
    }
    page.y += 4
    page.text('원료 구성은 제형과 관능에 따라 변경될 수 있습니다.', MARGIN, 11, 400, INK_3)
  }

  // ── 견적 금액 ───────────────────────────────────────────────
  if (options.showPrice) {
    sectionTitle(page, '견적 금액')
    const columns: Column[] = [
      { label: '구분', width: 300 },
      { label: '수량 (set)', width: 200, align: 'right' },
      { label: '단가 (원)', width: 200, align: 'right' },
      { label: '금액 (VAT 별도)', width: CONTENT - 700, align: 'right' },
    ]
    tableHead(page, columns)
    tableRow(
      page,
      columns,
      [
        [spec.productName || '제품', packageLabel(spec)].filter(Boolean).join(' '),
        totals.setCount.toLocaleString('ko-KR'),
        formatWon(totals.unitPrice),
        formatWon(totals.quoteTotal),
      ],
      true,
    )
    // 제안가는 절사 전 공급가에 부가세를 걸어 구하므로(견적서와 같은 방식) 절사한 단가에
    // 10% 를 곱한 값과 몇 원 어긋날 수 있다. 고객에게 보내는 표는 세 줄이 서로 맞아야
    // 하니 부가세를 제안가에서 되짚어 적는다.
    tableRow(page, columns, ['부가세', '', '', formatWon(totals.proposalTotal - totals.quoteTotal)])
    tableRow(
      page,
      columns,
      ['결제 금액 (VAT 포함)', '', formatWon(totals.proposalPerSet), formatWon(totals.proposalTotal)],
      true,
    )

    if (options.showTiers && tiers.length > 1) {
      page.y += 14
      page.space(60)
      page.text('수량 구간별 단가', MARGIN, 13, 600, INK_2)
      page.y += 6
      const tierColumns: Column[] = [
        { label: '수량 (set)', width: 220, align: 'right' },
        { label: '단가 (원)', width: 220, align: 'right' },
        { label: '금액 (VAT 별도)', width: 260, align: 'right' },
        { label: '비고', width: CONTENT - 700 },
      ]
      tableHead(page, tierColumns)
      for (const tier of tiers) {
        tableRow(page, tierColumns, [
          tier.setCount.toLocaleString('ko-KR'),
          formatWon(tier.unitPrice),
          formatWon(tier.quoteTotal),
          tier.row.note,
        ])
      }
    }
  }

  // ── 별도 청구 항목 ──────────────────────────────────────────
  if (options.showExtras) {
    const extras = [...totals.packaging, ...totals.process, ...totals.analysis].filter(
      (item) => !item.counted && item.row.label.trim(),
    )
    if (extras.length) {
      sectionTitle(page, '별도 청구 항목 (초도 1회성 비용)')
      const columns: Column[] = [
        { label: '항목', width: 340 },
        { label: '수량', width: 160, align: 'right' },
        { label: '금액 (원)', width: 220, align: 'right' },
        { label: '비고', width: CONTENT - 720 },
      ]
      tableHead(page, columns)
      for (const item of extras) {
        tableRow(page, columns, [
          item.row.label,
          `${item.quantity.toLocaleString('ko-KR')}${item.row.unit}`,
          item.amount > 0 ? formatWon(item.amount) : '실비',
          item.row.note,
        ])
      }
    }
  }

  // ── 견적 조건 ───────────────────────────────────────────────
  const conditions = sheet.quote.conditions
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (conditions.length) {
    sectionTitle(page, '견적 조건')
    const ctx = page.ctx
    ctx.font = font(13)
    for (const condition of conditions) {
      for (const [index, line] of wrap(ctx, condition, CONTENT - 20).entries()) {
        page.space(22)
        page.text(`${index === 0 ? '· ' : '  '}${line}`, MARGIN, 13, 400, INK_2)
        page.y += 3
      }
    }
  }

  // ── 원료별 상세(참고) ───────────────────────────────────────
  // 1정당 투입량은 배합 근거로 고객이 자주 요구한다. 단가·금액은 넣지 않는다.
  if (functional.length) {
    sectionTitle(page, '기능성 원료 1회분 투입량 (참고)')
    const columns: Column[] = [
      { label: '원료명', width: 380 },
      { label: `1${noun}당 투입량 (mg)`, width: 260, align: 'right' },
      { label: '표시량', width: CONTENT - 640, align: 'right' },
    ]
    tableHead(page, columns)
    for (const item of functional) {
      tableRow(page, columns, [item.row.name, formatKg(item.mgPerUnit, 3), item.row.labelAmount || '-'])
    }
    page.y += 8
    page.space(30)
    page.text(
      `1회분 중량 ${num(spec.unitWeightMg).toLocaleString('ko-KR')}mg 기준 · 염·혼합제제는 표시량과 투입량이 다릅니다.`,
      MARGIN,
      11,
      400,
      INK_3,
    )
  }

  drawFooters(page.pages)
  return page.pages.map((item) => item.canvas)
}
