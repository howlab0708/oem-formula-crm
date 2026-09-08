import { isDatabaseConfigured } from '@/lib/db'
import { isUuid, validateFormulaInput, validatePriceRows } from '@/lib/formulaDesign/validate'
import {
  createFormula,
  deleteFormula,
  getFormula,
  getQuoteVersion,
  listFormulaCompanies,
  listFormulas,
  listIngredientPrices,
  listQuoteVersions,
  saveIngredientPrices,
  updateFormula,
} from '@/lib/server/formulas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const unavailable = () =>
  json({ error: '배합비 서버 저장소가 연결되지 않았습니다. 관리자에게 연결을 요청해 주세요.' }, 503)

function failure(error: unknown) {
  if (error instanceof Error && error.message === 'FORMULA_CONFLICT') {
    return json(
      { error: '다른 사용자가 이 배합비를 수정하거나 삭제했습니다. 입력 내용은 유지됩니다. 목록에서 최신 배합비를 확인해 주세요.' },
      409,
    )
  }
  console.error(
    '[api/formulas] Request failed',
    error instanceof Error ? error.name : 'Unknown error',
    error && typeof error === 'object' && 'code' in error ? error.code : '',
  )
  return json({ error: '배합비 처리에 실패했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.' }, 500)
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return unavailable()
  const params = new URL(request.url).searchParams
  try {
    // 원료단가 기억장. 자동완성이 쓰는 목록이라 배합비 목록과 별도로 받는다.
    if (params.get('prices') === '1') return json({ prices: await listIngredientPrices() })

    if (params.has('id')) {
      const id = params.get('id')
      if (!isUuid(id)) return json({ error: '배합비 주소를 확인해 주세요.' }, 400)

      if (params.has('version')) {
        const version = Number(params.get('version'))
        if (!Number.isSafeInteger(version) || version < 1) return json({ error: '버전을 확인해 주세요.' }, 400)
        const sheet = await getQuoteVersion(id, version)
        return sheet ? json({ sheet }) : json({ error: '해당 버전을 찾을 수 없습니다.' }, 404)
      }
      if (params.get('versions') === '1') return json({ versions: await listQuoteVersions(id) })

      const formula = await getFormula(id)
      return formula ? json({ formula }) : json({ error: '배합비를 찾을 수 없습니다.' }, 404)
    }

    const company = params.get('company') ?? ''
    const query = params.get('query') ?? ''
    const page = Number(params.get('page') ?? 1)
    if (company.length > 100 || query.length > 150 || !Number.isSafeInteger(page) || page < 1 || page > 100_000) {
      return json({ error: '검색 조건을 확인해 주세요.' }, 400)
    }
    const [result, companies] = await Promise.all([listFormulas(company, query, page), listFormulaCompanies()])
    return json({ ...result, companies })
  } catch (error) {
    return failure(error)
  }
}

async function mutate(request: Request, method: 'POST' | 'PUT' | 'DELETE') {
  // JSON API만 허용하고 다른 사이트에서의 쓰기 요청을 거부한다.
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
    if (text.length > 500_000) return json({ error: '배합비 내용이 너무 깁니다.' }, 413)
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: '배합비 내용을 확인해 주세요.' }, 400)
  }

  if (!isUuid(body.id)) return json({ error: '배합비 정보가 올바르지 않습니다.' }, 400)
  if (method !== 'POST' && (!Number.isSafeInteger(body.version) || Number(body.version) < 1)) {
    return json({ error: '배합비 정보가 올바르지 않습니다.' }, 400)
  }

  if (method === 'DELETE') {
    try {
      await deleteFormula(body.id, Number(body.version))
      return json({ deleted: true })
    } catch (error) {
      return failure(error)
    }
  }

  let input
  try {
    input = validateFormulaInput(body)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '입력을 확인해 주세요.' }, 400)
  }

  try {
    const formula =
      method === 'POST'
        ? await createFormula(body.id, input)
        : await updateFormula(body.id, Number(body.version), input)
    // 단가 기억장 갱신은 저장의 부수효과다. 실패해도 배합비 저장을 되돌리지 않는다.
    try {
      await saveIngredientPrices(validatePriceRows(input.sheet.materials))
    } catch (error) {
      console.error('[api/formulas] 원료단가 기억장 갱신 실패', error instanceof Error ? error.name : 'Unknown error')
    }
    return json({ formula }, method === 'POST' ? 201 : 200)
  } catch (error) {
    return failure(error)
  }
}

export const POST = (request: Request) => mutate(request, 'POST')
export const PUT = (request: Request) => mutate(request, 'PUT')
export const DELETE = (request: Request) => mutate(request, 'DELETE')
