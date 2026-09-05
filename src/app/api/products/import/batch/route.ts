import { NextResponse, type NextRequest } from 'next/server'
import { insertBatch, isDatabaseConfigured } from '@/lib/db'
import type { Product } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 30

/** 요청 하나당 담을 수 있는 최대 행 수. Vercel 함수 요청 본문 크기 제한을 지키기 위함이다. */
const MAX_BATCH_SIZE = 3000

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.name === 'string'
}

/** 파싱된 Product 배열 한 조각을 적재한다. */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'POSTGRES_URL 이 설정되어 있지 않습니다.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const generation = typeof body?.generation === 'string' ? body.generation : null
  const seqOffset = Number.isFinite(body?.seqOffset) ? Number(body.seqOffset) : null
  const products = Array.isArray(body?.products) ? body.products : null

  if (!generation || seqOffset === null || !products) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }
  if (products.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `배치 하나는 ${MAX_BATCH_SIZE}건을 넘을 수 없습니다.` },
      { status: 400 },
    )
  }

  const validProducts = products.filter(isProduct)

  try {
    await insertBatch(generation, validProducts, seqOffset)
    return NextResponse.json({ inserted: validProducts.length, skipped: products.length - validProducts.length })
  } catch (error) {
    console.error('[api/products/import/batch] failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '배치를 적재하지 못했습니다.' },
      { status: 500 },
    )
  }
}
