import { NextResponse, type NextRequest } from 'next/server'
import { isDatabaseConfigured, startImport } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

/** 새 CSV 적재를 시작하고 이 적재를 식별할 세대 id 를 발급한다. */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: 'POSTGRES_URL 이 설정되어 있지 않습니다.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => null)
  const fileName = typeof body?.fileName === 'string' ? body.fileName : 'unknown.csv'
  const totalRows = Number.isFinite(body?.totalRows) ? Number(body.totalRows) : 0

  try {
    const generation = await startImport(fileName, totalRows)
    return NextResponse.json({ generation })
  } catch (error) {
    console.error('[api/products/import/start] failed', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '적재를 시작하지 못했습니다.' },
      { status: 500 },
    )
  }
}
