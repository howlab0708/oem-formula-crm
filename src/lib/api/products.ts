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

/**
 * 목록을 읽어올 때 한 번에 요청할 페이지 크기와 동시 요청 수.
 * 서버 쪽 `MAX_PAGE_SIZE` 와 맞춘다 - 4만 건을 한 응답에 담으면 Vercel 서버리스
 * 함수의 응답 크기 제한을 넘겨 매번 실패하므로, 업로드 때와 같은 크기로 나눠 받는다.
 * 여러 페이지를 동시에 요청해서 왕복 지연을 줄인다.
 */
const PAGE_SIZE = 1500
const PAGE_CONCURRENCY = 6

type ErrorBody = { error?: string }
type MetaBody = ErrorBody & { configured: boolean; meta: DatasetMeta | null }
type PageBody = ErrorBody & { configured: boolean; products: Product[] }
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

/**
 * 서버에 저장된 데이터셋을 가져온다. 저장된 게 없으면 products 는 null.
 *
 * 먼저 가벼운 메타데이터만 받아 전체 건수를 확인한 뒤, 상품 목록은 여러 개의
 * 작은 페이지로 나눠(동시에 몇 개씩) 받아 합친다 - 한 응답에 다 담으면 배포
 * 환경(Vercel)에서 응답 크기 제한에 걸려 항상 실패하기 때문이다.
 */
export async function fetchStoredDataset(): Promise<StoredDataset> {
  const metaResponse = await fetch('/api/products', { cache: 'no-store' })
  const metaBody = await parseJsonOrThrow<MetaBody>(metaResponse)
  if (!metaBody.configured) return { configured: false, products: null, meta: null }
  if (!metaBody.meta) return { configured: true, products: null, meta: null, error: metaBody.error }

  const meta = metaBody.meta
  const total = meta.imported_rows
  const products: Product[] = new Array(total)

  const offsets: number[] = []
  for (let offset = 0; offset < total; offset += PAGE_SIZE) offsets.push(offset)

  try {
    for (let i = 0; i < offsets.length; i += PAGE_CONCURRENCY) {
      const batch = offsets.slice(i, i + PAGE_CONCURRENCY)
      const pages = await Promise.all(
        batch.map(async (offset) => {
          const response = await fetch(
            `/api/products?generation=${encodeURIComponent(meta.generation)}&offset=${offset}&limit=${PAGE_SIZE}`,
            { cache: 'no-store' },
          )
          const body = await parseJsonOrThrow<PageBody>(response)
          return { offset, items: body.products }
        }),
      )
      for (const { offset, items } of pages) {
        const expected = Math.min(PAGE_SIZE, total - offset)
        if (items.length !== expected) {
          throw new Error('데이터를 불러오는 중 목록이 바뀌었습니다. 새로고침해 주세요.')
        }
        for (let j = 0; j < items.length; j += 1) products[offset + j] = items[j]
      }
    }
  } catch (error) {
    return {
      configured: true,
      products: null,
      meta,
      error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.',
    }
  }

  return { configured: true, products, meta }
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
