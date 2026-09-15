import { companyStorageIsLocal, companyStore } from '@/lib/server/companyData'
import { validateCompanyImport } from '@/lib/companyCsv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)
const failure = () => json({ error: '회사 데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500)

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (id !== null && !validId(id)) return json({ error: '파일 식별자를 확인해 주세요.' }, 400)
  try {
    const store = await companyStore()
    return id ? json({ products: await store.products(id) }) : json({ files: await store.list(), local: companyStorageIsLocal() })
  } catch { return failure() }
}

async function readBody(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('요청 출처를 확인해 주세요.')
  const origin = request.headers.get('origin')
  if (origin) {
    const source = new URL(origin)
    if (!['http:', 'https:'].includes(source.protocol) || source.host !== (request.headers.get('host') || new URL(request.url).host)) throw new Error('요청 출처를 확인해 주세요.')
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('JSON 요청이 필요합니다.')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('요청 내용이 없습니다.')
  let size = 0, text = ''
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2_100_000) { await reader.cancel(); throw new Error('파일이 너무 큽니다. CSV를 나누어 주세요.') }
    text += decoder.decode(value, { stream: true })
  }
  return JSON.parse(text + decoder.decode())
}

export async function POST(request: Request) {
  let parsed: ReturnType<typeof validateCompanyImport>
  try { parsed = validateCompanyImport(await readBody(request)) }
  catch (error) { return json({ error: error instanceof Error ? error.message : 'CSV 내용을 확인해 주세요.' }, 400) }
  try { return json(await (await companyStore()).add(parsed.input.name, parsed.products)) }
  catch { return failure() }
}

export async function PATCH(request: Request) {
  let body
  try {
    body = await readBody(request)
    if (!body || !validId(body.id) || typeof body.active !== 'boolean') throw new Error('파일과 표시 상태를 확인해 주세요.')
  } catch (error) { return json({ error: error instanceof Error ? error.message : '요청 내용을 확인해 주세요.' }, 400) }
  try { return json({ file: await (await companyStore()).setActive(body.id, body.active) }) }
  catch { return failure() }
}
