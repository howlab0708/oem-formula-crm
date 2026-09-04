/**
 * CSV 헤더 -> 도메인 필드 매핑.
 *
 * 두 종류의 입력을 모두 받는다.
 *  1) 식약처 품목제조보고 원본(한글 헤더 또는 영문 코드 헤더)
 *  2) 이 도구가 내보낸 7열 템플릿(제품명/제조원/제형/규격/주원료/지표성분/부원료)
 *
 * 헤더를 하나도 못 알아보면 7열 위치 기반으로 떨어뜨려, 기존 사용자가 쓰던
 * 파일이 그대로 열리게 한다.
 */

import { formatMg } from './format'
import {
  classifyIngredients,
  normalizeForm,
  parseIntakeWeightMg,
  parseMarkers,
  parseSpecification,
  parseWeightMg,
  splitIngredients,
} from './normalize'
import type { Product } from './types'

export type SchemaField =
  | 'name'
  | 'manufacturer'
  | 'form'
  | 'formDetail'
  | 'weight'
  | 'intakeMethod'
  | 'mainIngredients'
  | 'mainDetail'
  | 'subIngredients'
  | 'rawMaterials'
  | 'reportNo'
  | 'reportedAt'
  | 'primaryFunction'

export const FIELD_LABELS: Record<SchemaField, string> = {
  name: '제품명',
  manufacturer: '제조원',
  form: '제형',
  formDetail: '성상(제형 보정)',
  weight: '규격',
  intakeMethod: '섭취방법(규격 추정)',
  mainIngredients: '주원료',
  mainDetail: '기준규격 · 지표성분',
  subIngredients: '부원료',
  rawMaterials: '원재료명(자동 분류)',
  reportNo: '신고번호',
  reportedAt: '신고일자',
  primaryFunction: '주된 기능성',
}

/**
 * 제형은 '성상'(자유 텍스트)이 아니라 '제품형태'(정제된 값)에서 읽는다.
 * 성상은 경질/연질 구분을 메우는 보조 열(formDetail)로 따로 잡는다.
 */
const COLUMN_ALIASES: Record<SchemaField, string[]> = {
  name: ['제품명', '품목명', 'prdlstnm', 'productname'],
  manufacturer: ['제조원', '업소명', '제조업소명', '제조사', '업체명', '회사명', 'bsshnm', 'maker'],
  form: ['제형', '제품형태', '형태', 'prdtshapcdnm'],
  formDetail: ['성상', 'dispos'],
  weight: ['규격', '내용량', '중량', '1회섭취량', '총량', 'unitweight'],
  intakeMethod: ['섭취방법', '섭취량', 'ntkmthd'],
  mainIngredients: ['주원료', '기능성원료', '주된기능성원료', '기능성주원료'],
  mainDetail: ['지표성분', '지표성분함량', '기준규격', 'stdrstnd'],
  subIngredients: ['부원료', '기타원료', '부재료'],
  rawMaterials: ['원재료명', '원재료', '원료명', '원재료및함량', 'rawmtrlnm'],
  reportNo: ['품목제조신고번호', '품목보고번호', '신고번호', '보고번호', 'prdlstreportno'],
  reportedAt: ['신고일자', '보고일자', '제조일자', '허가일자', 'prmsdt'],
  primaryFunction: ['주된기능성', '기능성내용', '기능성', 'primaryfnclty'],
}

const ALIAS_ENTRIES = Object.entries(COLUMN_ALIASES) as Array<[SchemaField, string[]]>

/** 헤더 비교용 정규화: BOM/공백/괄호/기호 제거 후 소문자. */
function normalizeHeader(raw: string): string {
  return raw
    .replace(/﻿/g, '')
    .replace(/[\s_\-()[\]{}.]/g, '')
    .toLowerCase()
}

/**
 * 완전일치 > 접미사일치 > 부분일치 순으로 점수를 매긴다.
 * '기준규격' 이 '규격'(weight) 이 아니라 지표성분 열로 잡히게 하려면
 * 단순 부분일치로는 부족하다.
 */
function scoreField(normalized: string, taken: Set<SchemaField>): SchemaField | null {
  let best: SchemaField | null = null
  let bestScore = 0

  for (const [field, aliases] of ALIAS_ENTRIES) {
    if (taken.has(field)) continue
    for (const alias of aliases) {
      let score = 0
      if (normalized === alias) score = 300 + alias.length
      else if (normalized.endsWith(alias)) score = 200 + alias.length
      else if (normalized.includes(alias)) score = 100 + alias.length
      if (score > bestScore) {
        bestScore = score
        best = field
      }
    }
  }

  return best
}

export type HeaderMapping = {
  index: Partial<Record<SchemaField, number>>
  /** 사람이 읽는 매핑 결과(원본 헤더 -> 도메인 필드). 업로드 리포트에 노출한다. */
  label: Record<string, string>
  unmapped: string[]
  positionalFallback: boolean
}

const POSITIONAL_FALLBACK: SchemaField[] = [
  'name',
  'manufacturer',
  'form',
  'weight',
  'mainIngredients',
  'mainDetail',
  'subIngredients',
]

export function mapHeaders(header: string[]): HeaderMapping {
  const index: Partial<Record<SchemaField, number>> = {}
  const label: Record<string, string> = {}
  const unmapped: string[] = []
  const taken = new Set<SchemaField>()

  header.forEach((raw, position) => {
    const normalized = normalizeHeader(raw)
    if (!normalized) return

    const field = scoreField(normalized, taken)
    if (field) {
      taken.add(field)
      index[field] = position
      label[raw.trim() || `열 ${position + 1}`] = FIELD_LABELS[field]
    } else {
      unmapped.push(raw.trim())
    }
  })

  const usableHeader = index.name !== undefined && taken.size >= 2
  if (!usableHeader && header.length >= POSITIONAL_FALLBACK.length) {
    const fallbackIndex: Partial<Record<SchemaField, number>> = {}
    const fallbackLabel: Record<string, string> = {}
    POSITIONAL_FALLBACK.forEach((field, position) => {
      fallbackIndex[field] = position
      fallbackLabel[`열 ${position + 1}`] = FIELD_LABELS[field]
    })
    return { index: fallbackIndex, label: fallbackLabel, unmapped: [], positionalFallback: true }
  }

  return { index, label, unmapped, positionalFallback: false }
}

const PIPE_SPLIT = /\s*\|\s*/

function cell(row: string[], position: number | undefined): string {
  if (position === undefined) return ''
  return (row[position] ?? '').trim()
}

function splitList(value: string): string[] {
  const byPipe = value
    .split(PIPE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
  if (byPipe.length > 1) return byPipe
  return splitIngredients(value)
}

/**
 * CSV 한 행을 Product 로 변환한다. 제품명이 비면 건너뛴다(null).
 * 주원료 열이 없으면 원재료명을 사전으로 분류해 주원료/부원료를 만든다.
 */
export function rowToProduct(row: string[], mapping: HeaderMapping, seq: number): Product | null {
  const { index } = mapping
  const name = cell(row, index.name)
  if (!name) return null

  const rawMaterials = cell(row, index.rawMaterials)
  const mainCell = cell(row, index.mainIngredients)
  const subCell = cell(row, index.subIngredients)
  const markerText = `${cell(row, index.mainDetail)} ${cell(row, index.primaryFunction)}`

  let mainIngredients: string[]
  let subIngredients: string[]

  if (mainCell) {
    mainIngredients = splitList(mainCell)
    if (subCell) {
      subIngredients = splitList(subCell)
    } else if (rawMaterials) {
      const known = new Set(mainIngredients.map((s) => s.toLowerCase()))
      subIngredients = splitIngredients(rawMaterials).filter((s) => !known.has(s.toLowerCase()))
    } else {
      subIngredients = []
    }
  } else if (rawMaterials) {
    const classified = classifyIngredients(splitIngredients(rawMaterials), { markerText })
    mainIngredients = classified.main
    subIngredients = classified.sub
  } else {
    mainIngredients = []
    subIngredients = subCell ? splitList(subCell) : []
  }

  const formRaw = cell(row, index.form)
  const formDetail = cell(row, index.formDetail)
  const declaredWeight = cell(row, index.weight)
  const mainDetail = cell(row, index.mainDetail)

  // 기준규격 원문에 지표성분과 1회 섭취 규격이 함께 들어 있다(원본의 78%).
  const spec = parseSpecification(mainDetail)
  const markers = spec.markers.length > 0 ? spec.markers : parseMarkers(mainDetail)

  // 규격은 전용 열 > 기준규격의 표시량 분모 > 섭취방법 문구 순으로 찾는다.
  const declaredWeightMg = parseWeightMg(declaredWeight)
  const intakeWeightMg = parseIntakeWeightMg(cell(row, index.intakeMethod))
  const weightMg = declaredWeightMg ?? spec.servingWeightMg ?? intakeWeightMg
  const weightLabel =
    declaredWeight || spec.servingWeightLabel || (weightMg !== null ? formatMg(weightMg) : '-')

  return {
    id: `csv-${seq}`,
    name,
    manufacturer: cell(row, index.manufacturer) || '미상',
    form: normalizeForm(formRaw, formDetail),
    formRaw: formRaw || formDetail || '미상',
    weightLabel,
    weightMg,
    mainIngredients,
    mainDetail,
    markers,
    subIngredients,
    reportNo: cell(row, index.reportNo) || undefined,
    reportedAt: cell(row, index.reportedAt) || undefined,
    primaryFunction: cell(row, index.primaryFunction) || undefined,
  }
}
