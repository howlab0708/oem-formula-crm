import { isDatabaseConfigured } from '@/lib/db'
import { validateNoteInput } from '@/lib/formulaNotes'
import { createNote, deleteNote, getNote, listNoteCompanies, listNotes, updateNote } from '@/lib/server/formulaNotes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const unavailable = () => json({ error: '노트 서버 저장소가 연결되지 않았습니다. 관리자에게 연결을 요청해 주세요.' }, 503)

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'NOTE_CONFLICT') {
    return json({ error: '다른 사용자가 이 노트를 수정하거나 삭제했습니다. 입력 내용은 유지됩니다. 목록에서 최신 노트를 확인해 주세요.' }, 409)
  }
  console.error('[api/notes] Request failed', error instanceof Error ? error.name : 'Unknown error',
    error && typeof error === 'object' && 'code' in error ? error.code : '')
  return json({ error: '노트 처리에 실패했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.' }, 500)
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return unavailable()
  const params = new URL(request.url).searchParams
  try {
    if (params.has('id')) {
      const id = params.get('id')
      if (!validId(id)) return json({ error: '노트 주소를 확인해 주세요.' }, 400)
      const note = await getNote(id)
      return note ? json({ note }) : json({ error: '노트를 찾을 수 없습니다.' }, 404)
    }
    const company = params.get('company') ?? ''
    const query = params.get('query') ?? ''
    const page = Number(params.get('page') ?? 1)
    if (company.length > 100 || query.length > 150 || !Number.isSafeInteger(page) || page < 1 || page > 100_000) return json({ error: '검색 조건을 확인해 주세요.' }, 400)
    const [result, companies] = await Promise.all([listNotes(company, query, page), listNoteCompanies()])
    return json({ ...result, companies })
  } catch (error) { return failure(error) }
}

async function mutate(request: Request, method: 'POST' | 'PUT' | 'DELETE') {
  // JSON API만 허용하고 다른 사이트에서의 쓰기 요청을 거부한다.
  const origin = request.headers.get('origin')
  const host = request.headers.get('host') ?? new URL(request.url).host
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '요청 출처를 확인해 주세요.' }, 403)
  if (origin) {
    try {
      const source = new URL(origin)
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== host) return json({ error: '요청 출처를 확인해 주세요.' }, 403)
    } catch { return json({ error: '요청 출처를 확인해 주세요.' }, 403) }
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415)
  if (!isDatabaseConfigured()) return unavailable()
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > 50_000) return json({ error: '노트 내용이 너무 깁니다.' }, 413)
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch { return json({ error: '노트 내용을 확인해 주세요.' }, 400) }
  if (!validId(body.id) || (method !== 'POST' && (!Number.isSafeInteger(body.version) || Number(body.version) < 1))) return json({ error: '노트 정보가 올바르지 않습니다.' }, 400)
  let input
  if (method !== 'DELETE') {
    try { input = validateNoteInput(body) }
    catch (error) { return json({ error: error instanceof Error ? error.message : '입력을 확인해 주세요.' }, 400) }
  }
  try {
    if (method === 'DELETE') { await deleteNote(body.id, Number(body.version)); return json({ deleted: true }) }
    const note = method === 'POST' ? await createNote(body.id, input!) : await updateNote(body.id, Number(body.version), input!)
    return json({ note }, method === 'POST' ? 201 : 200)
  } catch (error) { return failure(error) }
}

export const POST = (request: Request) => mutate(request, 'POST')
export const PUT = (request: Request) => mutate(request, 'PUT')
export const DELETE = (request: Request) => mutate(request, 'DELETE')
