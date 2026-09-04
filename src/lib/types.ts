/**
 * 도메인 타입. 워커/메인 스레드 양쪽에서 공유하므로 DOM 의존성이 없어야 한다.
 */

export const FORM_TYPES = [
  '정제',
  '경질캡슐',
  '연질캡슐',
  '분말',
  '과립',
  '액상',
  '젤리/구미',
  '환',
  '기타',
] as const

export type FormType = (typeof FORM_TYPES)[number]

/** 지표성분 1건. `mgValue` 는 질량 단위일 때만 채워진다(범위 검색용). */
export type Marker = {
  name: string
  value: number
  unit: string
  /** 질량 단위(g/mg/㎍)를 mg 로 환산한 값. IU·CFU·% 는 null. */
  mgValue: number | null
  raw: string
}

export type Product = {
  id: string
  name: string
  manufacturer: string
  form: FormType
  /** 원본 제형 표기(정규화 전). 상세 패널에서 그대로 보여준다. */
  formRaw: string
  weightLabel: string
  /** 1회 섭취 규격을 mg 로 환산한 값. 범위 검색용. */
  weightMg: number | null
  mainIngredients: string[]
  mainDetail: string
  markers: Marker[]
  subIngredients: string[]
  reportNo?: string
  reportedAt?: string
  primaryFunction?: string
}

/** CSV 파싱 결과 요약. 업로드 패널에 그대로 노출한다. */
export type ImportReport = {
  fileName: string
  encoding: string
  totalRows: number
  accepted: number
  skipped: number
  columnMap: Record<string, string>
  unmappedHeaders: string[]
  elapsedMs: number
}

export type WorkerRequest = {
  type: 'parse'
  fileName: string
  buffer: ArrayBuffer
  /** 'auto' | 'utf-8' | 'euc-kr' */
  encoding: string
}

export type WorkerResponse =
  | { type: 'progress'; parsedRows: number; totalBytes: number; readBytes: number }
  | { type: 'done'; products: Product[]; report: ImportReport }
  | { type: 'error'; message: string }
