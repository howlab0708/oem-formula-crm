import { brotliCompress, brotliDecompress, constants } from 'node:zlib'
import { promisify } from 'node:util'
import { getSnapshotProducts, readDatasetSnapshot, writeDatasetSnapshot, type ImportStatusRow } from '../db'
import { packSnapshot, SNAPSHOT_VERSION } from '../datasetSnapshot'

const compress = promisify(brotliCompress)
const decompress = promisify(brotliDecompress)
let cached: { key: string; payload: Buffer } | null = null
let pending: { key: string; promise: Promise<Buffer> } | null = null

export function getDatasetSnapshot(meta: ImportStatusRow): Promise<Buffer> {
  const key = `${SNAPSHOT_VERSION}:${meta.generation}:${meta.imported_rows}`
  if (cached?.key === key) return Promise.resolve(cached.payload)
  if (pending?.key === key) return pending.promise

  const promise = (async () => {
    let payload = await readDatasetSnapshot(meta.generation, SNAPSHOT_VERSION).catch(() => null)
    if (!payload) {
      const products = await getSnapshotProducts(meta.generation)
      if (products.length !== meta.imported_rows) {
        throw new Error('데이터가 갱신되었습니다. 다시 불러와 주세요.')
      }
      payload = await compress(JSON.stringify(packSnapshot(meta, products)), {
        params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
      })
      // 캐시는 최적화 수단이므로 저장 실패가 원본 조회까지 막지 않게 한다.
      await writeDatasetSnapshot(meta.generation, SNAPSHOT_VERSION, payload).catch((error) => {
        console.warn('[dataset snapshot] 전송 캐시를 저장하지 못했습니다.', error)
      })
    }
    cached = { key, payload }
    return payload
  })().finally(() => {
    if (pending?.key === key) pending = null
  })
  pending = { key, promise }
  return promise
}

export async function snapshotResponse(meta: ImportStatusRow, request: Request): Promise<Response> {
  const compressed = await getDatasetSnapshot(meta)
  const acceptsBrotli = /\bbr\b(?!\s*;\s*q=0(?:\.0*)?(?:,|$))/.test(request.headers.get('accept-encoding') ?? '')
  const payload = acceptsBrotli ? compressed : await decompress(compressed)
  let offset = 0
  // 실제 스트림으로 전송하여 일반 응답의 4.5MB 크기 제한을 피한다.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= payload.length) return controller.close()
      controller.enqueue(payload.subarray(offset, offset + 64 * 1024))
      offset += 64 * 1024
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(acceptsBrotli ? { 'Content-Encoding': 'br' } : {}),
      'Cache-Control': 'private, max-age=31536000, immutable',
      Vary: 'Accept-Encoding',
    },
  })
}
