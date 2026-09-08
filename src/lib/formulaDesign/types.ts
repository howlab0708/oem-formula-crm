/**
 * 배합 설계 시트의 도메인 타입.
 *
 * 공장 견적서 네 종(엑셀 원가표 1종 + OEM 견적서 3종)을 맞춰 보면 골격은 같고
 * 다섯 군데가 다르다. 그 차이를 값으로 흡수하도록 모델을 잡았다.
 *
 *   포장 단위 → 1. 원료비 → 2. 부자재비 → 3. 가공비 → 4. 분석비 → 간접비 → 견적 요약
 *
 *   · Loss율: 공장마다 3~10% → `PackagingSpec.lossPercent`
 *   · 간접비 항목: 일반관리비·기업이윤에 품질관리비·고정비가 붙기도 함 → `OverheadRow[]`
 *   · 단가 방식: 총액 입력 / 원가 대비 % / set당 단가 / 낱개당 단가 → `OverheadRow.mode`
 *   · 수량 구간별 단가: 한 견적서에 3개 구간을 함께 제시 → `QuoteSettings.tiers`
 *   · 최종 단가 절사: 원 단위 반올림 또는 10원 단위 절사 → `QuoteSettings.round*`
 *
 * 숫자 입력은 전부 문자열로 보관한다. 연구원이 `0.0368` 을 타이핑하는 중간 상태
 * (`0.`, `0.0`)를 숫자로 바꿔 되돌려 쓰면 커서가 튀고 뒷자리가 잘린다.
 * 계산은 `calc.ts` 에서 읽는 시점에 한 번만 파싱한다.
 */

/** 1. 원료비 한 줄. 기능성 원료 DB(`functionalIngredients`)와 연결될 수 있다. */
export type MaterialRow = {
  id: string
  /** 원료명. 자동완성으로 채우면 `ingredientId` 도 함께 붙는다. */
  name: string
  /** 배합비율(%). 전체 합이 100 이 되어야 한다. */
  ratio: string
  /** 사용량(kg) 직접 입력. 비우면 배합량을 그대로 쓴다(팩 단위 올림 등에만 입력). */
  usage: string
  /** 원료단가(원/kg) */
  unitPrice: string
  note: string
  /** 기능성 원료 DB 의 id. 자동완성으로 고른 경우에만 값이 있다. */
  ingredientId?: string
  /** 식약처 기준 기능성내용. DB 에서 채우고 수정 가능. */
  functionality?: string
  /** 식약처 일일섭취기준(예: `0.36~100 mg`). DB 에서 채우고 수정 가능. */
  dailyIntake?: string
  /** 기준 성분명(예: 비타민 B1). 표시량의 기준이 된다. */
  basis?: string
  /** 표시량(1일 섭취량 기준, 예: `1.2mg`). 염·혼합제제는 투입량과 다르므로 별도 입력. */
  labelAmount: string
  /**
   * 역가(%). 원료 1mg 에 기준 성분이 몇 % 들어있는지. 원료 규격서(CoA)의 값이다.
   * 이 값이 있으면 표시량에서 배합비율을 역산할 수 있다(`labeling.ts`).
   */
  potency: string
  /** 오버차지(%). 유통 중 감소를 감안한 과량 투입. 보통 10~30%. */
  overage: string
  /** 일일영양성분 기준치 대비 비율. 표시기준 값을 연구원이 직접 넣는다(예: `100%`). */
  labelPercent: string
  /** 고객용 ‘구성 및 포장지’ 표에 넣을 기능성 원료인지. 부형제는 false. */
  functional: boolean
}

/**
 * 수량을 어디서 가져올지.
 *   fixed - 직접 입력(제판비 5회, 목형비 1개, 분석비 1회)
 *   set   - 세트 수에서 계산(병용기·단상자·라벨 = 세트당 1개)
 *   unit  - 낱개 수에서 계산(가공비 = 정 수)
 * set·unit 은 `packSize` 로 나눈 뒤 올림한다(카톤 200개입 → 1,000세트에 5개).
 * 수량 구간별 단가를 뽑을 때 세트 수만 바꿔도 전부 다시 계산되는 이유가 이 값이다.
 */
export type QuantityBasis = 'fixed' | 'set' | 'unit'

/** 2·3·4 블록(부자재비·가공비·분석비) 공통 한 줄. 금액 = 수량 × 단가. */
export type LineRow = {
  id: string
  label: string
  /** 기준단위(개, 정, 회 …) */
  unit: string
  basis: QuantityBasis
  /** basis 가 fixed 일 때 쓰는 직접 입력 수량 */
  quantity: string
  /** basis 가 set·unit 일 때 한 단위에 몇 개가 들어가는지(카톤 200개입 → 200) */
  packSize: string
  unitPrice: string
  note: string
  /**
   * 견적 합계에 넣을지. 공장 견적서에서 ‘발주처제공’·‘별도청구’·‘초도비용’ 으로 적힌 줄은
   * 금액이 적혀 있어도 소계에서 빠진다 - 그 상태를 그대로 표현한다.
   * 빠진 줄은 고객용 PDF 의 ‘별도 청구 항목’ 에 모아 보여준다.
   */
  included: boolean
}

/** 포장 단위·제품 정보 블록. 배합 총량과 가공 수량이 전부 여기서 나온다. */
export type PackagingSpec = {
  productName: string
  customer: string
  /** 식품유형(예: 건강기능식품(비타민C)) */
  foodType: string
  form: string
  /** 포장 형태(예: PE병, PTP 포장, 스틱포) */
  packaging: string
  /** 1정(1캡슐·1포) 중량(mg) */
  unitWeightMg: string
  /** 1세트에 들어가는 개수(정) */
  unitsPerSet: string
  /** 총 수량(set) */
  setCount: string
  /** 원료 손실 할증(%). 공장마다 3~10%. */
  lossPercent: string
  /** 섭취방법(예: `1일 1회, 1회 1정씩(총 2개월분)`) */
  intakeGuide: string
  /** 유통기한(예: 제조일로부터 24개월) */
  shelfLife: string
  /** 견적일 */
  quotedOn: string
  /** 견적 유효기간(예: 견적일로부터 30일) */
  validity: string
}

/**
 * 간접비 한 줄. 공장마다 항목 이름과 산출 방식이 달라 목록으로 둔다.
 *   amount  총액 직접 입력(견적서에 금액이 그대로 적혀 오는 경우)
 *   rate    1~4 블록 합계 대비 %(순서에 관계없이 같은 기준을 쓴다)
 *   perSet  세트당 단가(일반관리비를 set당 정액으로 붙이는 공장)
 *   perUnit 낱개당 단가
 */
export type OverheadMode = 'amount' | 'rate' | 'perSet' | 'perUnit'

export type OverheadRow = {
  id: string
  label: string
  mode: OverheadMode
  value: string
  note: string
}

export type RoundMode = 'round' | 'floor' | 'ceil'

/** 견적 마무리 설정. 간접비·부가세·최종 단가 절사·수량 구간. */
export type QuoteSettings = {
  overheads: OverheadRow[]
  /** 부가세율(%). 공급가는 VAT 별도이고 제안가는 이 비율을 더한 값이다. */
  vatRate: string
  /** 최종 단가를 맞출 자리(1·10·100·1000원). 10원 단위로 절사하는 공장이 있다. */
  roundUnit: string
  roundMode: RoundMode
  /** 수량 구간별 단가를 뽑을 세트 수 목록(예: 1000, 3000, 5000). 비우면 계산하지 않는다. */
  tiers: string[]
  /** 고객용 PDF 에 넣을 견적 조건 문구. 줄바꿈으로 구분한다. */
  conditions: string
}

/** 시트 한 장 전체. 서버에 저장되는 단위이기도 하다. */
export type FormulaSheet = {
  spec: PackagingSpec
  materials: MaterialRow[]
  packagingItems: LineRow[]
  processItems: LineRow[]
  analysisItems: LineRow[]
  quote: QuoteSettings
  /** 내부 메모. 고객용 PDF 에는 넣지 않는다. */
  memo: string
}

/** 저장된 시트의 서버 메타데이터. */
export type FormulaRecord = {
  id: string
  company: string
  title: string
  version: number
  /** 연결된 회사 노트(`oem_formula_notes.id`). 없으면 null. */
  noteId: string | null
  sheet: FormulaSheet
  createdAt: string
  updatedAt: string
}

export type FormulaSummary = Omit<FormulaRecord, 'sheet'> & {
  /** 목록에서 바로 보여줄 요약 수치. 시트 본문 없이 계산해 둔 값. */
  supplyPerSet: number | null
  setCount: number | null
}

/** 원료단가 기억장. 기능성 원료 DB 에 단가 열이 없어서 앱이 직접 쌓는다. */
export type IngredientPrice = {
  name: string
  unitPrice: number
  note: string
  updatedAt: string
}

/** 저장된 견적 버전 한 건. 시트 본문 없이 요약 수치만 담는다. */
export type QuoteVersion = {
  version: number
  createdAt: string
  /** 저장 시점의 계산 결과. 간접비는 `{ label, amount }` 배열이라 값 타입이 섞인다. */
  totals: Record<string, unknown>
}
