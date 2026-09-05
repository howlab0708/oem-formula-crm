/**
 * 원본 문자열 -> 도메인 값 정규화. 순수 함수만 두어 워커에서도 그대로 쓴다.
 *
 * 규칙은 식약처 품목제조보고 원본(C003)의 실제 표기를 기준으로 맞췄다.
 *  - 제형: PRDT_SHAP_CD_NM 이 '정/캡슐/분말…' 처럼 정제된 값을 주고,
 *          경질/연질 구분은 성상(DISPOS) 문구에만 있다.
 *  - 지표성분·규격: 기준규격(STDR_STND)이 "4. 칼슘 : 표시량(285.9mg/1500mg)의 80~150%"
 *          형태로 적혀 있다. 괄호 앞쪽이 지표 함량, 뒤쪽이 1회 섭취 규격이다.
 */

import { isExcipient, isFunctionalIngredient } from './dictionary'
import type { FormType, Marker } from './types'

/** 제형 표기 정규화. 앞에 오는 규칙이 우선한다. */
const FORM_RULES: Array<[RegExp, FormType]> = [
  [/연질|소프트\s*캡슐|softgel/i, '연질캡슐'],
  [/경질|하드\s*캡슐/i, '경질캡슐'],
  [/정제|타블렛|tablet|츄어블|씹어|^정$/i, '정제'],
  [/젤리|구미|gummy|jelly/i, '젤리/구미'],
  [/과립|스틱과립|granule/i, '과립'],
  [/분말|파우더|powder|산제/i, '분말'],
  [/시럽|syrup/i, '시럽'],
  [/필름|film/i, '필름'],
  [/액상|드링크|앰플|음료|농축액|액체|liquid/i, '액상'],
  [/겔|gel|페이스트/i, '겔'],
  [/^바$|직사각형\s*바|bar$/i, '바'],
  [/환$|환제|pill/i, '환'],
  // 경질/연질을 가릴 근거가 없는 '캡슐'. 위의 어떤 규칙에도 안 걸렸을 때만 남는다.
  [/캡슐|캅셀|capsule/i, '캡슐'],
]

function classifyForm(raw: string): FormType {
  const value = (raw ?? '').trim()
  if (!value) return '기타'
  for (const [pattern, form] of FORM_RULES) {
    if (pattern.test(value)) return form
  }
  return '기타'
}

/**
 * @param raw 제품형태 열(정제된 값)
 * @param detail 성상 열(자유 텍스트). 경질/연질 구분과 제품형태가 빈 경우를 메운다.
 */
export function normalizeForm(raw: string, detail = ''): FormType {
  const primary = classifyForm(raw)
  const secondary = detail ? classifyForm(detail) : '기타'

  if (primary === '기타') return secondary
  // 제품형태는 '캡슐'까지만 말한다. 성상 문구가 경질/연질을 알려주면 그쪽이 정확하다.
  if (primary === '캡슐' && (secondary === '경질캡슐' || secondary === '연질캡슐')) {
    return secondary
  }
  return primary
}

const MASS_TO_MG: Record<string, number> = {
  kg: 1_000_000,
  g: 1000,
  mg: 1,
  '㎎': 1,
  mcg: 0.001,
  '㎍': 0.001,
  µg: 0.001,
  ug: 0.001,
  // 액상은 비중 1 로 근사한다. 규격 비교용 근사치라는 점은 UI 각주에 남긴다.
  l: 1_000_000,
  ml: 1000,
  '㎖': 1000,
}

const NUMBER = String.raw`[0-9][0-9,]*(?:\.[0-9]+)?`
const MASS_UNIT = String.raw`kg|g|mg|㎎|mcg|㎍|µg|ug|ml|㎖|l`
const MARKER_UNIT = String.raw`CFU|㎎|mg|mcg|㎍|µg|ug|g|㎖|ml|IU|%`

const WEIGHT_RE = new RegExp(String.raw`(${NUMBER})\s*(${MASS_UNIT})(?![A-Za-z])`, 'i')
const BARE_NUMBER_RE = new RegExp(String.raw`^\s*(${NUMBER})\s*$`)

/** "1,000mg", "2 g", "20ml" -> mg 환산값 */
export function parseWeightMg(raw: string): number | null {
  if (!raw) return null
  const match = WEIGHT_RE.exec(raw)
  if (!match) {
    const bare = BARE_NUMBER_RE.exec(raw)
    return bare ? toNumber(bare[1]) : null
  }
  return toMg(match[1], match[2])
}

function toMg(value: string, unit: string): number | null {
  const n = toNumber(value)
  if (n === null) return null
  const factor = MASS_TO_MG[unit.toLowerCase()] ?? MASS_TO_MG[unit]
  return factor ? round(n * factor, 3) : null
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function normalizeUnit(unit: string): string {
  const u = unit.trim()
  return /^cfu$/i.test(u) ? 'CFU' : u
}

function makeMarker(name: string, value: number, unit: string, raw: string): Marker {
  const normalized = normalizeUnit(unit)
  const factor = MASS_TO_MG[normalized.toLowerCase()]
  return {
    name,
    value,
    unit: normalized,
    mgValue: factor ? round(value * factor, 4) : null,
    raw: raw.trim(),
  }
}

/* ── 기준규격(STDR_STND) 해석 ────────────────────────────────────── */

/** 지표성분이 아니라 품질 규격인 항목. 함량 통계에서 빼야 한다. */
const NON_MARKER_RE =
  /^(성상|대장균|붕해|세균수|총균수|납|카드뮴|수은|비소|중금속|타르색소|보존료|이물|잔류농약|곰팡이|살모넬라|황색포도상구균|리스테리아|여시니아|캠필로박터|클로스트리디움|장출혈성|바실러스\s*세레우스|산가|과산화물가|수분|회분|포장|성상\s*및)/

/** 세그먼트 앞머리의 번호 매김: "1.", "2)", "(3)", "①" */
const ORDINAL_RE = /^\s*(?:\(\s*\d{1,2}\s*\)|\d{1,2}\s*[.)]|[①-⑳])\s*/

/** 표시량(지표 함량 / 1회 섭취 규격) */
const DECLARED_RE = new RegExp(
  String.raw`표시량\s*\(\s*(${NUMBER})\s*(${MARKER_UNIT})\s*[/／]\s*(${NUMBER})\s*(${MASS_UNIT})\s*\)`,
  'i',
)
const DECLARED_VALUE_RE = new RegExp(String.raw`표시량\s*\(\s*(${NUMBER})\s*(${MARKER_UNIT})`, 'i')
/** "2.0 X 10^11 CFU/g" */
const SCIENTIFIC_RE = new RegExp(
  String.raw`(${NUMBER})\s*[xX×]\s*10\s*\^?\s*([0-9]{1,2})\s*(CFU)`,
  'i',
)
/** "1,000억 CFU", "100억" */
const EOK_RE = new RegExp(String.raw`(${NUMBER})\s*억`, 'i')
const PLAIN_RE = new RegExp(String.raw`(${NUMBER})\s*(${MARKER_UNIT})`, 'i')

export type Specification = {
  markers: Marker[]
  /** 1회 섭취 규격(mg). 표시량 분모에서 얻는다. */
  servingWeightMg: number | null
  servingWeightLabel: string | null
}

/** 한 줄에 ①②③ 나 1) 2) 가 이어 붙은 경우까지 항목 단위로 쪼갠다. */
function splitSegments(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    for (const part of line.split(/(?=[①-⑳])|(?=\d{1,2}\s*[.)]\s*[가-힣A-Za-z])/)) {
      const trimmed = part.trim()
      if (trimmed) out.push(trimmed)
    }
  }
  return out
}

/**
 * 기준규격 원문에서 지표성분과 1회 섭취 규격을 뽑는다.
 * "4. 칼슘 : 표시량(285.9mg/1500mg)의 80~150%" -> 칼슘 285.9mg, 규격 1500mg
 */
export function parseSpecification(raw: string): Specification {
  const markers: Marker[] = []
  const seen = new Set<string>()
  let servingWeightMg: number | null = null
  let servingWeightLabel: string | null = null

  if (!raw) return { markers, servingWeightMg, servingWeightLabel }

  const serving = DECLARED_RE.exec(raw)
  if (serving) {
    servingWeightMg = toMg(serving[3], serving[4])
    servingWeightLabel = `${serving[3]}${serving[4]}`
  }

  for (const segment of splitSegments(raw)) {
    const body = segment.replace(ORDINAL_RE, '')
    const colon = body.search(/[:：]/)
    if (colon <= 0) continue

    const name = body.slice(0, colon).trim().replace(/\s+/g, ' ')
    const spec = body.slice(colon + 1).trim()
    if (!name || name.length > 40 || !spec) continue
    if (NON_MARKER_RE.test(name)) continue

    const marker = readMarkerValue(name, spec)
    if (!marker) continue

    const key = `${marker.name}|${marker.unit}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    markers.push(marker)
  }

  return { markers, servingWeightMg, servingWeightLabel }
}

function readMarkerValue(name: string, spec: string): Marker | null {
  const declared = DECLARED_VALUE_RE.exec(spec)
  if (declared) {
    const value = toNumber(declared[1])
    return value === null ? null : makeMarker(name, value, declared[2], declared[0])
  }

  const scientific = SCIENTIFIC_RE.exec(spec)
  if (scientific) {
    const base = toNumber(scientific[1])
    if (base === null) return null
    return makeMarker(name, base * 10 ** Number(scientific[2]), 'CFU', scientific[0])
  }

  // 유산균은 "1,000억 CFU" 처럼 억 단위로 적는다. 절대 개수로 환산해야 분포가 비교된다.
  if (/CFU/i.test(spec) || /균|프로바이오틱|유산균/.test(name)) {
    const eok = EOK_RE.exec(spec)
    if (eok) {
      const base = toNumber(eok[1])
      if (base !== null) return makeMarker(name, base * 1e8, 'CFU', eok[0])
    }
  }

  const plain = PLAIN_RE.exec(spec)
  if (plain) {
    const value = toNumber(plain[1])
    return value === null ? null : makeMarker(name, value, plain[2], plain[0])
  }

  return null
}

const INLINE_NAME = String.raw`[가-힣A-Za-z0-9\-·.()]+(?:\s[가-힣A-Za-z0-9\-·.()]+){0,2}?`
const INLINE_MARKER_RE = new RegExp(
  String.raw`(${INLINE_NAME})\s*[:：]?\s*(${NUMBER})\s*(억\s*CFU|CFU|${MARKER_UNIT})`,
  'gi',
)
const INLINE_NAME_TRIM = /^[\s,·/\-|]+|[\s,·/\-|]+$/g

/**
 * "실리마린 130mg, 비타민B1 1.2mg" 처럼 항목 구분 없이 이어 쓴 문자열용.
 * 기준규격 원문(항목별 콜론 구조)은 parseSpecification 이 처리한다.
 */
export function parseMarkers(raw: string): Marker[] {
  if (!raw) return []
  const out: Marker[] = []
  const seen = new Set<string>()
  INLINE_MARKER_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = INLINE_MARKER_RE.exec(raw)) !== null) {
    const name = match[1].replace(INLINE_NAME_TRIM, '').replace(/\s+/g, ' ')
    const value = toNumber(match[2])
    if (!name || name.length > 24 || value === null) continue

    const unitRaw = match[3].replace(/\s+/g, '')
    const isEok = /^억CFU$/i.test(unitRaw)
    const marker = makeMarker(name, isEok ? value * 1e8 : value, isEok ? 'CFU' : unitRaw, match[0])

    const key = `${marker.name}|${marker.unit}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(marker)
  }
  return out
}

/* ── 섭취방법(NTK_MTHD)에서 규격 추정 ──────────────────────────── */

const PER_UNIT_RE = new RegExp(
  String.raw`\(\s*(${NUMBER})\s*(${MASS_UNIT})\s*[/／]\s*\d*\s*(?:캡슐|정|정제|포|스틱|환|㎖|ml)\s*\)`,
  'i',
)
const SERVING_COUNT_RE = /1회\s*(?:당\s*)?([0-9]+)\s*(?:캡슐|정|정제|포|스틱|환)/
const DIRECT_RE = new RegExp(String.raw`1회\s*(?:당\s*)?(?:[0-9]+\s*포\s*)?\(?\s*(${NUMBER})\s*(${MASS_UNIT})`, 'i')

/**
 * 규격 열이 없는 원본에서 섭취방법 문구로 1회 섭취량을 추정한다.
 * "1일 3회, 1회2캡슐(250mg/1캡슐)" -> 500mg
 */
export function parseIntakeWeightMg(raw: string): number | null {
  if (!raw) return null

  const perUnit = PER_UNIT_RE.exec(raw)
  if (perUnit) {
    const unitMg = toMg(perUnit[1], perUnit[2])
    if (unitMg === null) return null
    const count = SERVING_COUNT_RE.exec(raw)
    const multiplier = count ? Number(count[1]) : 1
    return round(unitMg * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1), 3)
  }

  const direct = DIRECT_RE.exec(raw)
  if (direct) return toMg(direct[1], direct[2])

  return null
}

/* ── 원재료명 분해 ──────────────────────────────────────────────── */

const SEPARATORS = new Set([',', '，', ';', '|', '/', '·', '\n', '\r'])
const OPENERS = new Set(['(', '[', '{'])
const CLOSERS = new Set([')', ']', '}'])
const EDGE_TRIM_RE = /^[\s\-·]+|[\s\-·]+$/g
const TRAILING_RATIO_RE = /\s*\(?\s*[0-9][0-9,.]*\s*%\s*\)?$/

/**
 * 원재료명 문자열을 개별 원료로 쪼갠다.
 * 괄호 안 구분자는 원료 이름의 일부이므로(예: "혼합제제(비타민C,전분)") 자르지 않는다.
 */
export function splitIngredients(raw: string): string[] {
  if (!raw) return []
  const parts: string[] = []
  let depth = 0
  let buffer = ''

  for (const ch of raw) {
    if (OPENERS.has(ch)) {
      depth += 1
      buffer += ch
    } else if (CLOSERS.has(ch)) {
      depth = Math.max(0, depth - 1)
      buffer += ch
    } else if (depth === 0 && SEPARATORS.has(ch)) {
      parts.push(buffer)
      buffer = ''
    } else {
      buffer += ch
    }
  }
  parts.push(buffer)

  return parts
    .map((part) => part.replace(EDGE_TRIM_RE, ''))
    .map(stripTrailingRatio)
    .filter((part) => part.length > 0 && part.length <= 60)
}

/**
 * "밀크씨슬추출물 30%" 처럼 뒤따르는 배합비는 이름에서 떼어낸다.
 * 단 "비타민C(함량 100%)" 를 잘라 "비타민C(함량" 이 되는 일은 없어야 하므로,
 * 잘라낸 결과의 괄호가 맞지 않으면 원래 이름을 그대로 둔다.
 */
function stripTrailingRatio(part: string): string {
  const stripped = part.replace(TRAILING_RATIO_RE, '').trim()
  if (stripped === part.trim()) return stripped
  return isBalanced(stripped) ? stripped : part.trim()
}

function isBalanced(text: string): boolean {
  let depth = 0
  for (const ch of text) {
    if (OPENERS.has(ch)) depth += 1
    else if (CLOSERS.has(ch)) depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

export type ClassifiedIngredients = {
  main: string[]
  sub: string[]
}

export type ClassifyOptions = {
  /** 지표성분·주된기능성 원문. 여기에 이름이 등장하면 위치와 무관하게 주원료로 본다. */
  markerText?: string
  /** 원재료명 앞쪽 몇 자리까지를 주원료 후보로 볼지 */
  leadingSlots?: number
}

/**
 * 원재료 목록을 기능성 주원료 / 부원료로 가른다.
 *
 * 사전만으로 가르면 타우린·헛개·녹차추출물처럼 그 자체로는 기능성 원료지만
 * 실제 처방에서는 차별화용 부원료로 쓰이는 것들이 전부 주원료로 올라와
 * "부원료 배합" 통계가 비어버린다. 그래서 세 신호를 함께 본다.
 *   1) 원본이 붙여 준 (고시형)/(개별인정형) 표식
 *   2) 원재료명은 대체로 배합비 내림차순이므로 앞자리일수록 주원료다
 *   3) 지표성분/주된기능성 문구에 이름이 나오면 그것이 소구 원료다
 */
export function classifyIngredients(
  all: string[],
  options: ClassifyOptions = {},
): ClassifiedIngredients {
  const { markerText = '', leadingSlots = 2 } = options
  const haystack = markerText.toLowerCase()

  const main: string[] = []
  const sub: string[] = []
  const seen = new Set<string>()
  let position = 0

  for (const rawName of all) {
    const name = rawName.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    // (고시형) 표식은 '기능성 원료냐'만 말해 준다(부형제에도 붙어 있다).
    // 그 원료가 이 처방의 '주'원료인지는 배합비 순서와 지표성분 문구가 가른다.
    const functional = isFunctionalIngredient(name)
    const named = haystack.length > 0 && mentionedIn(haystack, name)
    if (functional && (position < leadingSlots || named)) main.push(name)
    else sub.push(name)

    position += 1
  }

  // 앞자리가 전부 부형제여서 주원료를 하나도 못 잡으면 사전 매칭으로 되돌린다.
  if (main.length === 0) {
    const fallback = sub.filter((name) => isFunctionalIngredient(name)).slice(0, 2)
    if (fallback.length > 0) {
      return { main: fallback, sub: sub.filter((name) => !fallback.includes(name)) }
    }
  }

  return { main, sub }
}

/** "비타민C" 가 "비타민C 500mg" 안에 있는지. 괄호·수식어는 떼고 본다. */
function mentionedIn(haystack: string, name: string): boolean {
  const core = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/(추출물|추출분말|농축액|농축분말|분말|오일|혼합제제)$/g, '')
    .trim()
  return core.length >= 2 && haystack.includes(core)
}

/** 다빈도 통계에서 부형제를 걷어낸 부원료만 남긴다. */
export function meaningfulSubIngredients(subs: string[]): string[] {
  return subs.filter((s) => !isExcipient(s))
}
