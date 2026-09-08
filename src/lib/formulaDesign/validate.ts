/**
 * 배합 시트 입력 검증. 클라이언트와 API 라우트가 같은 함수를 쓴다.
 *
 * 숫자 칸은 문자열로 오간다(`types.ts` 참고). 여기서는 "숫자로 읽을 수 있는지" 와
 * 길이 상한만 본다 - 배합비율 합이 100 인지 같은 업무 규칙은 저장을 막지 않고
 * 화면에서 경고만 한다. 검토 중인 시트를 저장하지 못하면 엑셀보다 불편해진다.
 */

import type {
  FormulaSheet,
  LineRow,
  MaterialRow,
  OverheadMode,
  OverheadRow,
  PackagingSpec,
  QuantityBasis,
  QuoteSettings,
  RoundMode,
} from './types'

export const MAX_MATERIAL_ROWS = 200
export const MAX_LINE_ROWS = 60
export const MAX_TIERS = 6
export const TEXT_LIMIT = 300
export const LONG_TEXT_LIMIT = 2000
export const MEMO_LIMIT = 5000

export type FormulaInput = {
  company: string
  title: string
  noteId: string | null
  sheet: FormulaSheet
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(message: string): never {
  throw new Error(message)
}

function text(value: unknown, label: string, max = TEXT_LIMIT, required = false): string {
  if (value === undefined || value === null) {
    if (required) fail(`${label}을 입력해 주세요.`)
    return ''
  }
  if (typeof value !== 'string') fail(`${label}을 확인해 주세요.`)
  const trimmed = value.trim()
  if (required && !trimmed) fail(`${label}을 입력해 주세요.`)
  if (trimmed.length > max) fail(`${label}은 ${max.toLocaleString('ko-KR')}자 이내로 입력해 주세요.`)
  return trimmed
}

/** 숫자 칸. 빈칸은 허용하고, 값이 있으면 숫자로 읽히는지만 확인한다. */
function numeric(value: unknown, label: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : fail(`${label}을 숫자로 입력해 주세요.`)
  }
  if (typeof value !== 'string') fail(`${label}을 확인해 주세요.`)
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > 24) fail(`${label}이 너무 깁니다.`)
  if (!Number.isFinite(Number(trimmed.replace(/[,\s원%]/g, '')))) fail(`${label}을 숫자로 입력해 주세요.`)
  return trimmed
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}을 확인해 주세요.`)
  return value as Record<string, unknown>
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${label}을 확인해 주세요.`)
  if (value.length > max) fail(`${label}은 ${max}줄까지 저장할 수 있습니다.`)
  return value
}

function rowIdOf(value: unknown, index: number, prefix: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw && raw.length <= 40 ? raw : `${prefix}${index + 1}`
}

function materialRow(value: unknown, index: number): MaterialRow {
  const row = record(value, `${index + 1}번째 원료`)
  return {
    id: rowIdOf(row.id, index, 'm'),
    name: text(row.name, '원료명'),
    ratio: numeric(row.ratio, '배합비율'),
    usage: numeric(row.usage, '사용량'),
    unitPrice: numeric(row.unitPrice, '원료단가'),
    note: text(row.note, '비고'),
    ingredientId: text(row.ingredientId, '원료 DB 연결', 60) || undefined,
    functionality: text(row.functionality, '기능성내용', LONG_TEXT_LIMIT) || undefined,
    dailyIntake: text(row.dailyIntake, '일일섭취기준') || undefined,
    basis: text(row.basis, '기준 성분') || undefined,
    labelAmount: text(row.labelAmount, '표시량', 60),
    potency: numeric(row.potency, '역가'),
    overage: numeric(row.overage, '오버차지'),
    labelPercent: text(row.labelPercent, '기준치 대비', 40),
    functional: row.functional === true,
  }
}

function quantityBasis(value: unknown): QuantityBasis {
  return value === 'fixed' || value === 'unit' ? value : 'set'
}

function lineRow(value: unknown, index: number, label: string): LineRow {
  const row = record(value, `${label} ${index + 1}번째 항목`)
  return {
    id: rowIdOf(row.id, index, 'l'),
    label: text(row.label, `${label} 항목명`),
    unit: text(row.unit, '기준단위', 20),
    basis: quantityBasis(row.basis),
    quantity: numeric(row.quantity, '수량'),
    packSize: numeric(row.packSize, '입수') || '1',
    unitPrice: numeric(row.unitPrice, '단가'),
    note: text(row.note, '비고'),
    included: row.included !== false,
  }
}

function spec(value: unknown): PackagingSpec {
  const row = record(value, '포장 단위')
  return {
    productName: text(row.productName, '제품명'),
    customer: text(row.customer, '고객사'),
    foodType: text(row.foodType, '식품유형', 60),
    form: text(row.form, '제형', 40),
    packaging: text(row.packaging, '포장 형태', 100),
    unitWeightMg: numeric(row.unitWeightMg, '1정 중량'),
    unitsPerSet: numeric(row.unitsPerSet, '1세트 개수'),
    setCount: numeric(row.setCount, '수량(set)'),
    lossPercent: numeric(row.lossPercent, 'Loss율'),
    intakeGuide: text(row.intakeGuide, '섭취방법', LONG_TEXT_LIMIT),
    shelfLife: text(row.shelfLife, '유통기한', 100),
    quotedOn: text(row.quotedOn, '견적일', 40),
    validity: text(row.validity, '견적 유효기간', 100),
  }
}

function overheadMode(value: unknown): OverheadMode {
  return value === 'rate' || value === 'perSet' || value === 'perUnit' ? value : 'amount'
}

function overheadRow(value: unknown, index: number): OverheadRow {
  const row = record(value, `${index + 1}번째 간접비`)
  return {
    id: rowIdOf(row.id, index, 'o'),
    label: text(row.label, '간접비 항목명', 60),
    mode: overheadMode(row.mode),
    value: numeric(row.value, '간접비 값'),
    note: text(row.note, '비고'),
  }
}

function roundMode(value: unknown): RoundMode {
  return value === 'floor' || value === 'ceil' ? value : 'round'
}

function quote(value: unknown): QuoteSettings {
  const row = record(value, '견적 설정')
  return {
    overheads: list(row.overheads, '간접비', MAX_LINE_ROWS).map(overheadRow),
    vatRate: numeric(row.vatRate, '부가세율'),
    roundUnit: numeric(row.roundUnit, '단가 절사 단위') || '1',
    roundMode: roundMode(row.roundMode),
    tiers: list(row.tiers, '수량 구간', MAX_TIERS).map((tier, index) => numeric(tier, `${index + 1}번째 수량 구간`)),
    conditions: text(row.conditions, '견적 조건', MEMO_LIMIT),
  }
}

export function validateSheet(value: unknown): FormulaSheet {
  const sheet = record(value, '배합 시트')
  const lines = (key: string, label: string) =>
    list(sheet[key], label, MAX_LINE_ROWS).map((row, index) => lineRow(row, index, label))
  return {
    spec: spec(sheet.spec),
    materials: list(sheet.materials, '원료', MAX_MATERIAL_ROWS).map(materialRow),
    packagingItems: lines('packagingItems', '부자재비'),
    processItems: lines('processItems', '가공비'),
    analysisItems: lines('analysisItems', '분석비'),
    quote: quote(sheet.quote),
    memo: text(sheet.memo, '메모', MEMO_LIMIT),
  }
}

export function validateFormulaInput(value: unknown): FormulaInput {
  const body = record(value, '배합비')
  const noteId = typeof body.noteId === 'string' && UUID.test(body.noteId) ? body.noteId : null
  if (body.noteId && !noteId) fail('연결할 노트 주소를 확인해 주세요.')
  return {
    company: text(body.company, '회사명', 100, true).replace(/\s+/g, ' '),
    title: text(body.title, '배합비 제목', 150, true),
    noteId,
    sheet: validateSheet(body.sheet),
  }
}

/** 원료단가 기억장에 올릴 목록. 이름과 단가가 모두 있는 줄만 남긴다. */
export function validatePriceRows(value: unknown): { name: string; unitPrice: number; note: string }[] {
  const rows = list(value, '원료단가', MAX_MATERIAL_ROWS)
  const result: { name: string; unitPrice: number; note: string }[] = []
  for (const [index, entry] of rows.entries()) {
    const row = record(entry, `${index + 1}번째 원료단가`)
    const name = text(row.name, '원료명')
    const price = Number(numeric(row.unitPrice, '원료단가').replace(/[,\s원]/g, ''))
    if (!name || !Number.isFinite(price) || price <= 0) continue
    result.push({ name, unitPrice: price, note: text(row.note, '비고') })
  }
  return result
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
