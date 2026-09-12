import { cachedFoodTraceability } from '@/lib/server/traceabilityCache'

export const runtime = 'nodejs'

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
const validText = (value: unknown, max: number): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= max
const validNames = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 250 && value.every(name => validText(name, 500))

// Read-only lookup. POST keeps full ingredient lists out of URLs and access logs.
export async function POST(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: '이 화면에서 다시 조회해 주세요.' }, 403)
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: '제품 정보를 확인해 주세요.' }, 415)
  let value
  try {
    const body = await request.text()
    if (body.length > 80_000) return json({ error: '제품 정보가 너무 큽니다.' }, 413)
    value = JSON.parse(body)
  } catch { return json({ error: '제품 정보를 확인해 주세요.' }, 400) }
  if (!value || !validText(value.name, 300) || !validText(value.manufacturer, 300) ||
    (value.reportNo !== undefined && (typeof value.reportNo !== 'string' || value.reportNo.length > 60)) ||
    !validNames(value.mainIngredients) || !validNames(value.subIngredients) ||
    !value.mainIngredients.length && !value.subIngredients.length) return json({ error: '제품명·제조원·원료 목록을 확인해 주세요.' }, 400)
  try {
    return json(await cachedFoodTraceability({ name: value.name, manufacturer: value.manufacturer,
      reportNo: value.reportNo, mainIngredients: value.mainIngredients, subIngredients: value.subIngredients }))
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    console.error('Ingredient traceability lookup failed:', ['TRACE_FORMAT', 'TRACE_UNAVAILABLE', 'fetch failed'].includes(code) ? code : 'REQUEST_FAILED')
    return json({ error: '공개 이력 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 502)
  }
}
