import { request as httpsRequest } from 'node:https'
import { mapHeaders, rowToProduct } from '../csvSchema'
import { sourceDate } from '../datasetProvenance'
import type { Product } from '../types'

export const MFDS_PAGE_SIZE = 1000
const HEADERS = ['PRDLST_REPORT_NO', 'PRDLST_NM', 'BSSH_NM', 'PRDT_SHAP_CD_NM', 'DISPOS', 'NTK_MTHD', 'STDR_STND', 'PRIMARY_FNCLTY', 'PRMS_DT', 'RAWMTRL_NM']
const MAPPING = mapHeaders(HEADERS)
export class SyncError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable = false) { super(message) }
}
export type MFDSPayload = { total: number; products: Product[] }

/** Reuse the CSV ingredient parser; report/license numbers, never company aliases, identify records. */
export function parseC003(value: unknown, start: number, end: number): MFDSPayload {
  const root = value as { C003?: { RESULT?: { CODE?: string }; total_count?: string; row?: Record<string, unknown>[] }; RESULT?: { CODE?: string } }
  const body = root?.C003
  const code = body?.RESULT?.CODE ?? root?.RESULT?.CODE
  if (code && code !== 'INFO-000') {
    const retryable = ['INFO-300', 'INFO-320', 'INFO-500', 'INFO-700', 'ERROR-500', 'ERROR-503'].includes(code)
    const message = ['INFO-100', 'INFO-110', 'INFO-120', 'INFO-600'].includes(code)
      ? '식약처 인증키 또는 서비스 신청 상태를 확인해 주세요.'
      : '식약처에서 현재 자료를 제공하지 못하고 있습니다. 잠시 후 다시 시도해 주세요.'
    // Do not include upstream messages: they can echo credentials or request URLs.
    throw new SyncError('upstream', message, retryable)
  }
  if (!body || !/^\d+$/.test(String(body.total_count))) throw new SyncError('shape', '식약처 응답 형식이 달라 업데이트를 중단했습니다.')
  const total = Number(body.total_count)
  if (!Number.isSafeInteger(total) || total <= 0 || !Array.isArray(body.row) || body.row.length !== Math.min(end, total) - start + 1) {
    throw new SyncError('count', '식약처 응답 건수가 맞지 않아 기존 데이터를 유지합니다.')
  }
  const products = body.row.map(row => {
    if (!row || ['LCNS_NO', 'PRDLST_REPORT_NO', 'PRDLST_NM', 'BSSH_NM'].some(k => typeof row[k] !== 'string' || !row[k].trim())
      || !/^\d+$/.test(String(row.LCNS_NO)) || !/^\d+$/.test(String(row.PRDLST_REPORT_NO))
      || HEADERS.some(k => row[k] !== undefined && row[k] !== null && typeof row[k] !== 'string')) {
      throw new SyncError('record', '식약처 제품 식별정보가 불완전해 기존 데이터를 유지합니다.')
    }
    const product = rowToProduct(HEADERS.map(k => String(row[k] ?? '')), MAPPING, 0)!
    return { ...product, id: `mfds:${row.LCNS_NO}:${row.PRDLST_REPORT_NO}`, licenseNo: String(row.LCNS_NO), sourceUpdatedAt: sourceDate(String(row.LAST_UPDT_DTM ?? '')) ?? undefined }
  })
  if (new Set(products.map(p => p.reportNo)).size !== products.length) throw new SyncError('duplicate', '중복 신고번호가 있어 업데이트를 중단했습니다.')
  return { total, products }
}

/** Native HTTPS avoids Next's fetch URL metrics: MFDS puts its credential in the path. */
function privateRequest(url: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { request.destroy(); fail() }, 20_000)
    const fail = () => { clearTimeout(timer); reject(new SyncError('network', '식약처 응답을 받지 못했습니다. 기존 데이터는 유지됩니다.', true)) }
    const request = httpsRequest(url, { method: 'GET', headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' } }, response => {
      if (response.statusCode !== 200) { response.resume(); clearTimeout(timer); reject(new SyncError('network', '식약처 연결이 지연되고 있습니다. 기존 데이터는 유지됩니다.', true)); return }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 16 * 1024 * 1024) { request.destroy(); fail(); return }
        chunks.push(chunk)
      })
      response.on('error', fail)
      response.on('end', () => { clearTimeout(timer); resolve(new Response(Buffer.concat(chunks))) })
    })
    request.on('error', fail)
    request.end()
  })
}

export async function fetchC003(key: string, start: number, end: number, fetcher?: typeof fetch): Promise<MFDSPayload> {
  // The literal public sample is useful for transport checks, but syncConfigured rejects it in production.
  if (key !== 'sample' && !/^[a-zA-Z0-9]{10,100}$/.test(key)) throw new SyncError('key', '식약처 인증키 설정을 확인해 주세요.')
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start >= MFDS_PAGE_SIZE) throw new SyncError('range', '조회 범위가 올바르지 않습니다.')
  try {
    const url = `https://openapi.foodsafetykorea.go.kr/api/${key}/C003/json/${start}/${end}`
    const response = fetcher ? await fetcher(url, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
    }) : await privateRequest(url)
    if (!response.ok) throw new SyncError('network', '식약처 연결이 지연되고 있습니다. 기존 데이터는 유지됩니다.', true)
    return parseC003(await response.json(), start, end)
  } catch (error) {
    if (error instanceof SyncError) throw error
    // Never propagate fetch errors: the API key is part of the URL.
    throw new SyncError('network', '식약처 응답을 받지 못했습니다. 기존 데이터는 유지됩니다.', true)
  }
}
