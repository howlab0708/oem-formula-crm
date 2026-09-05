import { NextResponse, type NextRequest } from 'next/server'
import { finishImport, isDatabaseConfigured } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

/** 이 세대를 "완료"로 표시하고 이전 세대들은 지운다(연쇄삭제로 상품 행도 함께). */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'POSTGRES_URL 이 설정되어 있지 않습니다.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const generation = typeof body?.generation === 'string' ? body.generation : null
  if (!generation) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const status = await finishImport(generation)
    return NextResponse.json({ status })
  } catch (error) {
    console.error('[api/products/import/finish] failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '적재를 마무리하지 못했습니다.' },
      { status: 500 },
    )
  }
}
