import { NextResponse } from 'next/server'
import { getDatasetMeta, getProductsPage, isDatabaseConfigured } from '@/lib/db'
import { SNAPSHOT_FORMAT } from '@/lib/datasetSnapshot'
import { snapshotResponse } from '@/lib/server/datasetSnapshot'

/**
 * 저장된 레퍼런스 데이터셋을 돌려준다.
 *
 * 예전에는 완료된 데이터셋 전체(4만 건 넘는 상품 payload)를 한 응답에 실어
 * 보냈는데, 이러면 응답이 수십 MB 가 되어 Vercel 서버리스 함수의 응답 크기
 * 제한(약 4.5MB)을 넘겨 배포 환경에서는 항상 조용히 실패했다 - 로컬
 * `next dev` 에는 이런 제한이 없어서 테스트에서는 재현되지 않았던 원인이다.
 * 그래서 이제는 CSV 업로드 때와 같은 방식으로 나눠서 내려준다:
 *
 *  - `generation` 쿼리 파라미터가 없으면: 메타데이터만(가벼움, 상품 목록 없음)
 *  - `generation`+`format=snapshot-v3`: 재사용 가능한 압축 묶음을 스트리밍
 *  - `generation`+`offset`+`limit` 이 있으면: 그 구간의 상품만(작은 페이지)
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 30

/** 페이지당 최대 상품 수 - 업로드 배치 크기와 맞춰, 실제로 크기 제한을 넘지 않는다고 확인된 값. */
const MAX_PAGE_SIZE = 1500

/**
 * 어떤 캐시 레이어도 이 응답을 붙잡아 두지 못하게 명시적으로 못박는다.
 * `dynamic = 'force-dynamic'` 만으로 충분해야 정상이지만, 업로드 직후
 * 새로고침해도 곧바로 반영되도록 이중으로 막아 둔다.
 */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ configured: false, meta: null }, { headers: NO_STORE_HEADERS })
  }

  const { searchParams } = new URL(request.url)
  const generation = searchParams.get('generation')

  try {
    if (!generation) {
      const meta = await getDatasetMeta()
      return NextResponse.json({ configured: true, meta }, { headers: NO_STORE_HEADERS })
    }

    if (searchParams.get('format') === SNAPSHOT_FORMAT) {
      const meta = await getDatasetMeta()
      if (!meta || meta.generation !== generation) {
        return NextResponse.json(
          { error: '데이터가 갱신되었습니다. 다시 불러와 주세요.' },
          { status: 409, headers: NO_STORE_HEADERS },
        )
      }
      return await snapshotResponse(meta, request)
    }

    const offset = Math.max(0, Number(searchParams.get('offset') ?? '0') || 0)
    const requestedLimit = Number(searchParams.get('limit') ?? String(MAX_PAGE_SIZE)) || MAX_PAGE_SIZE
    const limit = Math.min(Math.max(1, requestedLimit), MAX_PAGE_SIZE)

    const products = await getProductsPage(generation, offset, limit)
    return NextResponse.json({ configured: true, products }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[api/products] failed to load dataset', error)
    return NextResponse.json(
      {
        configured: true,
        meta: null,
        products: null,
        error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.',
      },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
