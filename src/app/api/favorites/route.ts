import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { isDatabaseConfigured } from '@/lib/db'
import { validateSavedSearch, validSearchId } from '@/lib/savedSearches'
import { listSavedSearches, getSavedSearch, createSavedSearch, deleteSavedSearch } from '@/lib/server/savedSearches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function ownerKey() {
  const jar = await cookies()
  const existing = jar.get('oem_favorites_owner')?.value
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString('hex')
  jar.set('oem_favorites_owner', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 365*24*60*60, path: '/api/favorites' })
  return createHash('sha256').update(token).digest('hex')
}
const unavailable = () => json({ error: '즐겨찾기 서버 저장소가 연결되지 않았습니다.' }, 503)
const failure = () => json({ error: '즐겨찾기 요청을 처리하지 못했습니다. 다시 시도해 주세요.' }, 500)
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return unavailable()
  const params = new URL(request.url).searchParams
  if (params.has('id') && !validSearchId(params.get('id'))) return json({ error: '저장된 검색 주소를 확인해 주세요.' }, 400)
  const page = Number(params.get('page') ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return json({ error: '목록 페이지를 확인해 주세요.' }, 400)
  try {
    const owner = await ownerKey()
    if (params.has('id')) {
      const item = await getSavedSearch(params.get('id')!, owner)
      return item ? json({ item }) : json({ error: '검색이 삭제되었거나 이 브라우저에서 볼 수 없습니다.' }, 404)
    }
    return json(await listSavedSearches(owner, page))
  } catch { return failure() }
}
async function mutate(request: Request, remove: boolean) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') ?? new URL(request.url).host
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '요청 출처를 확인해 주세요.' }, 403)
  if (origin) { try { if (new URL(origin).host !== host) return json({ error: '요청 출처를 확인해 주세요.' }, 403) } catch { return json({ error: '요청 출처를 확인해 주세요.' }, 403) } }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415)
  if (!isDatabaseConfigured()) return unavailable()
  let body: unknown, input
  try {
    const text = await request.text()
    if (text.length > 150000) return json({ error: '검색 조건이 너무 큽니다.' }, 413)
    body = JSON.parse(text)
    if (!remove) input = validateSavedSearch(body)
  } catch (error) { return json({ error: error instanceof Error ? error.message : '입력을 확인해 주세요.' }, 400) }
  try {
    const owner = await ownerKey()
    if (remove) {
      const id = (body as { id?: unknown } | null)?.id
      if (!validSearchId(id)) return json({ error: '삭제할 검색을 확인해 주세요.' }, 400)
      return await deleteSavedSearch(id, owner) ? json({ deleted: true }) : json({ error: '본인이 저장한 검색만 삭제할 수 있습니다.' }, 404)
    }
    return json({ item: await createSavedSearch(randomUUID(), owner, input!) }, 201)
  } catch { return failure() }
}
export const POST = (request: Request) => mutate(request, false)
export const DELETE = (request: Request) => mutate(request, true)
