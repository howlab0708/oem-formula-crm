/**
 * 원료단가 기억장.
 *
 * 기능성 원료 DB(공전·인정 자료)에는 단가 열이 없어서, 배합비를 저장할 때 시트에
 * 적힌 단가를 원료명별로 쌓아 두고 다음 배합비의 자동완성에서 채운다. 쌓기만 하고
 * 지우는 경로가 없으면 한 번 잘못 넣은 단가가 계속 제안되므로 삭제도 여기서 받는다.
 *
 * 배합비와 다른 표(`oem_ingredient_prices`)라서 별도 주소로 뒀다. 여기서 지워도
 * 저장된 배합비와 견적 버전은 그대로다.
 */

import { isDatabaseConfigured } from '@/lib/db'
import { clearIngredientPrices, deleteIngredientPrice, listIngredientPrices } from '@/lib/server/formulas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const unavailable = () =>
  json({ error: '원료단가 서버 저장소가 연결되지 않았습니다. 관리자에게 연결을 요청해 주세요.' }, 503)

function failure(error: unknown) {
  console.error(
    '[api/ingredient-prices] Request failed',
    error instanceof Error ? error.name : 'Unknown error',
    error && typeof error === 'object' && 'code' in error ? error.code : '',
  )
  return json({ error: '원료단가 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 500)
}

export async function GET() {
  if (!isDatabaseConfigured()) return unavailable()
  try {
    return json({ prices: await listIngredientPrices() })
  } catch (error) {
    return failure(error)
  }
}

export async function DELETE(request: Request) {
  // JSON API만 허용하고 다른 사이트에서의 쓰기 요청을 거부한다(배합비 API와 같은 규칙).
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') ?? new URL(request.url).host
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '요청 출처를 확인해 주세요.' }, 403)
  if (origin) {
    try {
      const source = new URL(origin)
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== host) {
        return json({ error: '요청 출처를 확인해 주세요.' }, 403)
      }
    } catch {
      return json({ error: '요청 출처를 확인해 주세요.' }, 403)
    }
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: 'JSON 요청이 필요합니다.' }, 415)
  }
  if (!isDatabaseConfigured()) return unavailable()

  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > 2000) return json({ error: '요청이 너무 깁니다.' }, 413)
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: '요청 내용을 확인해 주세요.' }, 400)
  }

  try {
    // 전체 삭제는 실수로 지나가지 않게 명시적인 값을 요구한다.
    if (body.all === true) return json({ deleted: await clearIngredientPrices() })
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 300) return json({ error: '지울 원료명을 확인해 주세요.' }, 400)
    const deleted = await deleteIngredientPrice(name)
    return deleted ? json({ deleted }) : json({ error: '해당 원료단가를 찾을 수 없습니다.' }, 404)
  } catch (error) {
    return failure(error)
  }
}
