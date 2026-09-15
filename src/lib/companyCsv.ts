import { decodeBuffer, parseCsv } from './csv'
import { FIELD_LABELS, mapHeaders, rowToProduct, type HeaderMapping, type SchemaField } from './csvSchema'
import type { Product } from './types'
import { isQuoteCsv, quoteFromCsv } from './companyQuoteCsv'

export const CSV_MAX_BYTES = 1_000_000
export const CSV_MAX_ROWS = 2000
export const CSV_MAX_FILES = 10
export type ColumnMapping = Partial<Record<SchemaField, number>>
export type CsvPreview = {
  headers: string[]; rows: string[][]; mapping: ColumnMapping; encoding: string; text: string; quote: boolean
}
export type CompanyFile = { id: string; name: string; count: number; active: boolean; createdAt: string }
export type CompanyLibrary = { files: CompanyFile[]; products: Product[]; local: boolean }
export type CompanyImportInput = { name: string; text: string; mapping: ColumnMapping }

export function readCompanyCsv(text: string) {
  if (new TextEncoder().encode(text).byteLength > CSV_MAX_BYTES) throw new Error('CSV는 파일당 1MB 이하로 나누어 주세요.')
  const rows = parseCsv(text.replace(/^\uFEFF/, ''), { strict: true })
  const quote = isQuoteCsv(rows)
  const headers = quote ? [] : rows.shift()?.map(s => s.trim()) ?? []
  if (quote) {
    if (rows.length > CSV_MAX_ROWS || rows.some(row => row.length > 80 || row.some(cell => cell.length > 10000))) throw new Error('견적서가 너무 큽니다. 최대 80개 열, 2,000행까지 지원합니다.')
    return { headers, rows, quote }
  }
  if (!headers.length || !rows.length) throw new Error('첫 줄에 열 이름, 둘째 줄부터 제품 데이터를 넣어 주세요.')
  if (headers.length > 80 || rows.length > CSV_MAX_ROWS) throw new Error('파일당 최대 80개 열, 2,000행까지 가져올 수 있습니다.')
  if (rows.some(row => row.length > headers.length || row.some(cell => cell.length > 10000))) throw new Error('열 개수가 맞지 않거나 너무 긴 값이 있습니다. CSV의 따옴표와 열 구성을 확인해 주세요.')
  return { headers, rows, quote }
}

export function previewCompanyCsv(buffer: ArrayBuffer): CsvPreview {
  const decoded = decodeBuffer(buffer, 'auto')
  const parsed = readCompanyCsv(decoded.text)
  const guessed = mapHeaders(parsed.headers)
  // Unknown company layouts require explicit mapping; never assume positional MFDS columns.
  return { ...parsed, mapping: guessed.positionalFallback ? {} : guessed.index, encoding: decoded.encoding, text: decoded.text }
}

export function validateMapping(value: unknown, width: number): ColumnMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('열 연결을 확인해 주세요.')
  const result: ColumnMapping = {}
  const used = new Set<number>()
  for (const [key, index] of Object.entries(value)) {
    if (!Object.hasOwn(FIELD_LABELS, key) || !Number.isInteger(index) || index < 0 || index >= width || used.has(index)) throw new Error('같은 열은 한 항목에만 연결할 수 있습니다.')
    used.add(index)
    result[key as SchemaField] = index
  }
  if (result.name === undefined) throw new Error('제품명 열을 연결해 주세요. 원료 단가표·견적 이력은 제품 목록 형식으로 변환해야 합니다.')
  return result
}

export function companyProducts(rows: string[][], mapping: ColumnMapping) {
  const headerMap: HeaderMapping = { index: mapping, label: {}, unmapped: [], positionalFallback: false }
  const products: Product[] = []
  const skipped: number[] = []
  const seen = new Set<string>()
  let duplicates = 0
  rows.forEach((row, index) => {
    const product = rowToProduct(row, headerMap, 0)
    if (!product) { skipped.push(index + 2); return }
    const key = JSON.stringify(product)
    if (seen.has(key)) { duplicates++; return }
    seen.add(key)
    products.push(product)
  })
  return { products, skipped, duplicates }
}

export function validateCompanyImport(value: unknown): { input: CompanyImportInput; products: Product[] } {
  if (!value || typeof value !== 'object') throw new Error('CSV 요청을 확인해 주세요.')
  const v = value as Record<string, unknown>
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 200 || typeof v.text !== 'string') throw new Error('파일명과 CSV 내용을 확인해 주세요.')
  const { headers, rows, quote } = readCompanyCsv(v.text)
  const mapping = quote ? {} : validateMapping(v.mapping, headers.length)
  const products = quote ? [quoteFromCsv(rows, v.name).product] : companyProducts(rows, mapping).products
  if (!products.length) throw new Error('가져올 제품이 없습니다. 제품명 열을 확인해 주세요.')
  return { input: { name: v.name.trim(), text: v.text, mapping }, products }
}

export function mergeCompanyProducts(files: Product[][]): Product[] {
  const products = new Map<string, Product>()
  for (const file of files) for (const product of file) if (!products.has(product.id)) products.set(product.id, product)
  return [...products.values()]
}

export const COMPANY_CSV_TEMPLATE = '\uFEFF제품명,제조원,제형,규격,주원료,부원료,포장 개수,포장 형태,섭취방법,소비기한\r\n[샘플] 비타민C 정제,예시 제조원,정제,800mg × 60정,비타민C,결정셀룰로스,60,PTP 포장,1일 1회 1정,제조일로부터 24개월\r\n[샘플] 유산균 스틱,예시 제조원,분말,2g × 30포,프로바이오틱스,프락토올리고당,30,스틱포,1일 1회 1포,제조일로부터 18개월\r\n'
