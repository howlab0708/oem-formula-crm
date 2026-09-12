import type { Product } from '../types'

export type TraceIngredient = { name: string; country: string }
export type TraceLot = {
  registrationNo: string; traceabilityNo: string; productName: string; manufacturer: string
  productionDate: string; expirationDate: string; ingredients: TraceIngredient[]; sourceUrl: string
}
export type TraceLookup = {
  status: 'matched' | 'not_found' | 'needs_review'
  checkedAt: string
  message: string
  lot?: TraceLot
  candidates: { productName: string; manufacturer: string; sourceUrl: string }[]
}
type Candidate = { registrationNo: string; productName: string; manufacturer: string }
type Reference = Pick<Product, 'name' | 'manufacturer' | 'reportNo' | 'mainIngredients' | 'subIngredients'>

const BASE = 'https://tfood.go.kr'
const key = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
export const traceIngredientKey = (s: string) => key(s).replace(/\(고시형\)/g, '')
const companyKey = (s: string) => key(s).replace(/주식회사|\(주\)|㈜/g, '')
// Only a trailing package specification may differ. Product qualifiers such as 수출용 stay intact.
export function traceProductMatches(reference: string, candidate: string) {
  const a = key(reference), b = key(candidate)
  if (a === b) return true
  if (!b.startsWith(a)) return false
  const suffix = b.slice(a.length).replace(/^[,·\s]+/, '')
  return /^(?:\(|\[)?(?=[\s\S]*\d)(?=[\s\S]*(?:mg|ml|kg|g|정|캡슐|포|병|개|입))[\d\s.,+*×x()\[\]mgkl정캡슐포병개입액상제분말]+$/i.test(suffix)
}
export const traceCompanyMatches = (a: string, b: string) => Boolean(a && b) && companyKey(a) === companyKey(b)

const plain = (s: string) => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) => {
    const cp = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
  }).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim()
const cells = (s: string) => [...s.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => plain(m[1]))
const tables = (s: string) => [...s.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m => m[0])
const rows = (s: string) => [...s.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1])
function date(s: string) {
  const match = s.match(/^(\d{2}|\d{4})\/(\d{2})\/(\d{2})$/)
  if (!match) return ''
  const value = `${match[1].length === 2 ? '20' : ''}${match[1]}-${match[2]}-${match[3]}`
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : ''
}
function input(s: string, name: string) {
  return s.match(new RegExp(`<input\\b[^>]*name=["']${name}["'][^>]*value=["']([0-9]+)["']`, 'i'))?.[1] || ''
}
export function parseTraceSearch(html: string): Candidate[] {
  if (!html.includes('기업명') || !html.includes('제품명')) throw new Error('TRACE_FORMAT')
  return [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].flatMap((m) => {
    const registrationNo = input(m[1], 'regNum\\d+')
    const manufacturer = m[1].match(/기업명\s*:\s*<\/strong>\s*<span>([\s\S]*?)<\/span>/)?.[1]
    const productName = m[1].match(/제품명\s*:\s*<\/strong>\s*<span>([\s\S]*?)<\/span>/)?.[1]
    return registrationNo && manufacturer && productName ? [{ registrationNo, manufacturer: plain(manufacturer), productName: plain(productName) }] : []
  })
}
export function parseTraceLots(html: string) {
  const table = tables(html).find(t => /<caption>[^<]*식품이력번호/.test(t))
  if (!table) throw new Error('TRACE_FORMAT')
  return rows(table).flatMap(row => {
    const columns = cells(row), registrationNo = input(row, 'regNum\\d+'), traceabilityNo = input(row, 'foodHistraceNum\\d+')
    return registrationNo && traceabilityNo && columns.length === 5 && date(columns[3]) ? [{ registrationNo, traceabilityNo, productName: columns[1], productionDate: date(columns[3]), expirationDate: date(columns[4]) }] : []
  }).sort((a, b) => b.productionDate.localeCompare(a.productionDate))
}
export function traceDetailUrl(registrationNo: string, traceabilityNo = '') {
  const url = new URL(`/tfweb/nhq/${traceabilityNo ? 'nhq201Detail' : 'nhq201ListDataP'}.do`, BASE)
  url.searchParams.set('page', '1'); url.searchParams.set('regNum', registrationNo)
  if (traceabilityNo) url.searchParams.set('foodHistraceNum', traceabilityNo)
  return url.toString()
}
export function parseTraceDetail(html: string): TraceLot {
  const all = tables(html)
  const basic = all.find(t => /<caption>[^<]*제품이미지/.test(t))
  const raw = all.find(t => /<caption>[^<]*원재료명[^<]*원산지/.test(t))
  if (!basic || !raw) throw new Error('TRACE_FORMAT')
  const basics = rows(basic).flatMap(cells)
  const after = (label: string) => { const index = basics.indexOf(label); return index < 0 ? '' : basics[index + 1] || '' }
  const headers = cells(raw.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || '')
  const ni = headers.indexOf('원재료명'), ci = headers.indexOf('원산지')
  if (ni < 0 || ci < 0) throw new Error('TRACE_FORMAT')
  const ingredients = rows(raw.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || '').map(cells)
    .filter(c => c.length === headers.length && c[ni])
    .map(c => ({ name: c[ni], country: /^(?:-|미상|미확인|해당사항없음)$/.test(c[ci]) ? '' : c[ci] }))
  const registrationNo = input(html, 'regNum'), traceabilityNo = input(html, 'foodHistraceNum')
  const lot = { registrationNo, traceabilityNo, productName: after('제품명'), manufacturer: after('제조공장'), productionDate: date(after('제조일자')), expirationDate: date(after('유통/소비기한')), ingredients, sourceUrl: traceDetailUrl(registrationNo, traceabilityNo) }
  if (!registrationNo || !traceabilityNo || !lot.productName || !lot.manufacturer || !lot.productionDate || !ingredients.length) throw new Error('TRACE_FORMAT')
  return lot
}

export function traceIngredientsMatch(reference: string[], ingredients: TraceIngredient[]) {
  const a = new Set(reference.map(traceIngredientKey)), b = new Set(ingredients.map(i => traceIngredientKey(i.name)))
  // A family/name match alone is not enough to assign an origin to a reformulated product.
  return a.size > 0 && a.size === b.size && [...a].every(n => b.has(n))
}

const cache = new Map<string, { expires: number; value: Promise<TraceLookup> }>()
async function readHtml(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-store', redirect: 'error' })
  if (!response.ok) throw new Error('TRACE_UNAVAILABLE')
  const html = await response.text()
  if (html.length > 1_000_000) throw new Error('TRACE_FORMAT')
  return html
}
export async function lookupFoodTraceability(product: Reference): Promise<TraceLookup> {
  const identity = JSON.stringify([product.name, product.manufacturer, product.reportNo, [...product.mainIngredients, ...product.subIngredients]])
  const existing = cache.get(identity)
  if (existing && existing.expires > Date.now()) return existing.value
  const pending = lookup(product)
  cache.set(identity, { expires: Date.now() + 60 * 60 * 1000, value: pending })
  if (cache.size > 300) cache.delete(cache.keys().next().value!)
  try { return await pending } catch (error) { cache.delete(identity); throw error }
}
async function lookup(product: Reference): Promise<TraceLookup> {
  const signal = AbortSignal.timeout(25_000)
  const checkedAt = new Date().toISOString().slice(0, 10)
  const candidates: Candidate[] = []
  for (let page = 1; page <= 3; page++) {
    const url = new URL('/tfweb/nhq/nhq201List.do', BASE)
    url.searchParams.set('page', String(page)); url.searchParams.set('searchNm2', product.name)
    const html = await readHtml(url.toString(), signal)
    candidates.push(...parseTraceSearch(html))
    if (!html.includes(`nhq201List.do?page=${page + 1}`)) break
  }
  const exact = [...new Map(candidates.filter(c => traceProductMatches(product.name, c.productName) && traceCompanyMatches(product.manufacturer, c.manufacturer)).map(c => [c.registrationNo, c])).values()]
  const links = exact.slice(0, 6).map(c => ({ productName: c.productName, manufacturer: c.manufacturer, sourceUrl: traceDetailUrl(c.registrationNo) }))
  if (!exact.length) return { status: 'not_found', checkedAt, message: '조회한 공개 이력에서 제품명과 제조원이 일치하는 자료를 찾지 못했습니다.', candidates: [] }
  // Bound requests per selection. Show the actual reference lot rather than implying all lots were checked.
  const lots: TraceLot[] = []
  for (const candidate of exact.slice(0, 3)) {
    const list = parseTraceLots(await readHtml(traceDetailUrl(candidate.registrationNo), signal))
    if (!list.length) continue
    const lot = parseTraceDetail(await readHtml(traceDetailUrl(candidate.registrationNo, list[0].traceabilityNo), signal))
    if (lot.registrationNo !== candidate.registrationNo || lot.traceabilityNo !== list[0].traceabilityNo || !traceProductMatches(product.name, lot.productName) || !traceCompanyMatches(product.manufacturer, lot.manufacturer)) continue
    if (traceIngredientsMatch([...product.mainIngredients, ...product.subIngredients], lot.ingredients)) lots.push(lot)
  }
  if (!lots.length) return { status: 'needs_review', checkedAt, message: '같은 이름의 이력이 있으나 원료 구성 또는 생산 정보를 대조해야 합니다. 원산지를 자동으로 적용하지 않았습니다.', candidates: links }
  const lot = lots.sort((a, b) => b.productionDate.localeCompare(a.productionDate))[0]
  return { status: 'matched', checkedAt, lot, candidates: links, message: '제품명·제조원·원료 구성이 일치하는 공개 생산 이력입니다. 해당 생산분의 등록 정보이며 다른 생산분은 달라질 수 있습니다.' }
}
