/**
 * 도메인 타입. 워커/메인 스레드 양쪽에서 공유하므로 DOM 의존성이 없어야 한다.
 */

/**
 * 식약처 제품형태(PRDT_SHAP_CD_NM)가 쓰는 구분에 맞춘다.
 * '캡슐'은 경질/연질을 가릴 근거가 없을 때만 쓴다 - 임의로 한쪽에 넣지 않는다.
 */
export const FORM_TYPES = [
  '정제',
  '경질캡슐',
  '연질캡슐',
  '캡슐',
  '분말',
  '과립',
  '액상',
  '시럽',
  '젤리/구미',
  '겔',
  '바',
  '필름',
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
  /** 별도 브랜드 열이 제공된 경우에만 저장한다. 제조원으로 추정하지 않는다. */
  brand?: string
  form: FormType
  /** 원본 제형 표기(정규화 전). 상세 패널에서 그대로 보여준다. */
  formRaw: string
  weightLabel: string
  /** 기존 규격 원문에서 추출한 중량. 섭취 기준이 혼재하므로 1알 통계에는 사용하지 않는다. */
  weightMg: number | null
  /** 원본 섭취방법. 1알 중량 환산 근거를 보존한다. */
  intakeMethod?: string
  /** 명시된 중량과 알 수로만 환산한 1알 중량(mg). 불명확하거나 비알약 제형이면 null. */
  unitWeightMg?: number | null
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
  provenance?: import('./datasetProvenance').DatasetProvenance
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
