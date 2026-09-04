/**
 * 원본 문자열 -> 도메인 값 정규화. 순수 함수만 두어 워커에서도 그대로 쓴다.
 */

import { isExcipient, isFunctionalIngredient } from './dictionary'
import type { FormType, Marker } from './types'

/** 제형 표기 정규화. 앞에 오는 규칙이 우선한다. */
const FORM_RULES: Array<[RegExp, FormType]> = [
  [/연질|소프트\s*캡슐|softgel/i, '연질캡슐'],
  [/경질|하드\s*캡슐|캡슐/i, '경질캡슐'],
  [/정제|타블렛|tablet|츄어블|씹어/i, '정제'],
  [/과립|스틱과립|granule/i, '과립'],
  [/분말|파우더|powder|산제/i, '분말'],
  [/액상|드링크|앰플|시럽|음료|liquid/i, '액상'],
  [/젤리|구미|gummy|jelly/i, '젤리/구미'],
  [/환$|환제|pill/i, '환'],
]

export function normalizeForm(raw: string): FormType {
  const value = (raw ?? '').trim()
  if (!value) return '기타'
  for (const [pattern, form] of FORM_RULES) {
    if (pattern.test(value)) return form
  }
  return '기타'
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
  const value = toNumber(match[1])
  if (value === null) return null
  const factor = MASS_TO_MG[match[2].toLowerCase()] ?? MASS_TO_MG[match[2]]
  return factor ? round(value * factor, 3) : null
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

const MARKER_NAME = String.raw`[가-힣A-Za-z0-9\-·.()]+(?:\s[가-힣A-Za-z0-9\-·.()]+){0,2}?`
const MARKER_UNIT = String.raw`억\s*CFU|만\s*CFU|CFU|㎎|mg|mcg|㎍|µg|ug|g|㎖|ml|IU|%`
const MARKER_RE = new RegExp(
  String.raw`(${MARKER_NAME})\s*[:：]?\s*(${NUMBER})\s*(${MARKER_UNIT})`,
  'gi',
)
const MARKER_NAME_TRIM = /^[\s,·/\-|]+|[\s,·/\-|]+$/g

/**
 * "실리마린 130mg, 비타민B1 1.2mg" 처럼 이름+수치+단위가 이어진 문자열에서
 * 지표성분을 뽑는다. 함량 범위 교차검색의 입력이 된다.
 */
export function parseMarkers(raw: string): Marker[] {
  if (!raw) return []
  const out: Marker[] = []
  const seen = new Set<string>()
  MARKER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKER_RE.exec(raw)) !== null) {
    const name = match[1].replace(MARKER_NAME_TRIM, '').replace(/\s+/g, ' ')
    const value = toNumber(match[2])
    if (!name || name.length > 24 || value === null) continue
    const unit = match[3].replace(/\s+/g, '')
    const key = `${name}|${unit}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const factor = MASS_TO_MG[unit.toLowerCase()]
    out.push({
      name,
      value,
      unit,
      mgValue: factor ? round(value * factor, 4) : null,
      raw: match[0].trim(),
    })
  }
  return out
}

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
    .map((part) => part.replace(TRAILING_RATIO_RE, '').trim())
    .filter((part) => part.length > 0 && part.length <= 40)
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
 * "부원료 배합" 통계가 비어버린다. 그래서 두 신호를 함께 본다.
 *   1) 식약처 원재료명은 대체로 배합비 내림차순이므로 앞자리일수록 주원료다.
 *   2) 지표성분/주된기능성 문구에 이름이 나오면 그것이 소구 원료다.
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
