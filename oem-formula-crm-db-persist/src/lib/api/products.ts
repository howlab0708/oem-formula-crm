/**
 * `/api/products*` 를 호출하는 클라이언트 쪽 함수 모음.
 *
 * `@/lib/db` 를 여기서 절대 import 하지 않는다 - 그 파일은 `postgres` 패키지를 물고
 * 있어서 브라우저 번들에 들어가면 빌드가 깨진다. 이 파일은 fetch 만 한다.
 */

import type { Product } from '@/lib/types'

export type DatasetMeta = {
  generation: string
  status: string
  file_name: string | null
  total_rows: number | null
  imported_rows: number
  started_at: string
  finished_at: string | null
}

export type StoredDataset = {
  configured: boolean
  products: Product[] | null
  meta: DatasetMeta | null
  error?: string
}

/** 한 배치에 담아 보낼 최대 행 수. 서버 쪽 MAX_BATCH_SIZE 와 함께 맞춰 둔다. */
const BATCH_SIZE = 1500

type ErrorBody = { error?: string }
type ProductsGetBody = ErrorBody & {
  configured: boolean
  dataset: { products: Product[]; meta: DatasetMeta } | null
}
type StartImportBody = ErrorBody & { generation: string }
type FinishImportBody = ErrorBody & { status: DatasetMeta }

async function parseJsonOrThrow<T extends ErrorBody>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | null
  if (!response.ok) {
    throw new Error(body?.error || `요청이 실패했습니다 (${response.status})`)
  }
  if (!body) throw new Error('서버 응답을 읽지 못했습니다.')
  return body
}

/** 서버에 저장된 데이터셋을 통째로 가져온다. 저장된 게 없으면 products 는 null. */
export async function fetchStoredDataset(): Promise<StoredDataset> {
  const response = await fetch('/api/products', { cache: 'no-store' })
  const body = await parseJsonOrThrow<ProductsGetBody>(response)
  if (!body.configured) return { configured: false, products: null, meta: null }
  if (!body.dataset) return { configured: true, products: null, meta: null, error: body.error }
  return { configured: true, products: body.dataset.products, meta: body.dataset.meta }
}

export type SaveProgress = { sent: number; total: number }

/**
 * 파싱된 Product 배열을 서버(Postgres)에 통째로 저장한다.
 * 배치별로 나눠 보내고, 마지막에 `finish` 를 호출해 이 적재를 "완료" 로 표시한다.
 * 중간에 실패하면 이전에 완료된 데이터셋은 그대로 남는다(새 세대가 완료 표시되지
 * 않았으므로).
 */
export async function saveDatasetToServer(
  fileName: string,
  products: Product[],
  onProgress?: (progress: SaveProgress) => void,
): Promise<DatasetMeta> {
  const startResponse = await fetch('/api/products/import/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, totalRows: products.length }),
  })
  const { generation } = await parseJsonOrThrow<StartImportBody>(startResponse)

  for (let offset = 0; offset < products.length; offset += BATCH_SIZE) {
    const chunk = products.slice(offset, offset + BATCH_SIZE)
    const batchResponse = await fetch('/api/products/import/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ generation, seqOffset: offset, products: chunk }),
    })
    await parseJsonOrThrow<ErrorBody>(batchResponse)
    onProgress?.({ sent: Math.min(offset + chunk.length, products.length), total: products.length })
  }

  const finishResponse = await fetch('/api/products/import/finish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ generation }),
  })
  const { status } = await parseJsonOrThrow<FinishImportBody>(finishResponse)
  return status
}
