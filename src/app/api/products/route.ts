import { NextResponse } from 'next/server'
import { getActiveDataset, isDatabaseConfigured } from '@/lib/db'

/**
 * 저장된 레퍼런스 데이터셋을 통째로 돌려준다.
 *
 * 이 앱은 필터/집계를 전부 브라우저 메모리에서 계산하므로(수만 건 규모에서는
 * 이 편이 검색어를 칠 때마다 지연이 없다), 여기서도 "서버가 걸러서 조금씩" 이
 * 아니라 완료된 데이터셋 전체를 한 번에 내려준다. 응답은 gzip 압축되어 실제
 * 전송량은 이 크기보다 훨씬 작다.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * 어떤 캐시 레이어도 이 응답을 붙잡아 두지 못하게 명시적으로 못박는다.
 * `dynamic = 'force-dynamic'` 만으로 충분해야 정상이지만, 업로드 직후
 * 새로고침해도 곧바로 반영되도록 이중으로 막아 둔다.
 */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ configured: false, dataset: null }, { headers: NO_STORE_HEADERS })
  }

  try {
    const dataset = await getActiveDataset()
    return NextResponse.json({ configured: true, dataset }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[api/products] failed to load dataset', error)
    return NextResponse.json(
      {
        configured: true,
        dataset: null,
        error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.',
      },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
