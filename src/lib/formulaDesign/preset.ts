/**
 * 빈 시트와 예시 시트.
 *
 * 예시는 실제로 받은 공장 견적서 두 종의 *구조* 를 옮긴 것이다. 처음 쓰는 연구원이
 * 어느 칸에 무엇을 넣는지, 공장마다 무엇이 다른지 바로 보게 하는 용도다.
 *
 *   tablet  정제 · 800mg×60정 · 1,000set · Loss 10% · 원 단위 반올림 · 간접비 총액 입력
 *   compact 정제 · 800mg×30정 · 3,000set · Loss 5%  · 10원 절사   · 품질관리비 별도 항목
 *
 * 원료단가·가공비·간접비는 대표값이다. 이 저장소가 공개라서 공장에서 받은 실제
 * 단가와 마진은 넣지 않는다 - 실제 숫자는 `fixtures/factory-quotes.local.json`
 * (git 제외)에 두고 `scripts/verify-formula-calc.mjs` 가 그 파일로 대조한다.
 * 그래서 예시 시트의 금액은 실제 견적서 금액과 다르다.
 */

import type { FormulaSheet, LineRow, MaterialRow, OverheadRow, QuantityBasis } from './types'

/**
 * 행 id. 화면 안에서만 구분하면 되므로 단순 증가값을 쓴다.
 * 서버 렌더와 클라이언트 렌더가 같은 값을 만들도록 난수를 섞지 않는다.
 */
let counter = 0
export function rowId(prefix = 'r'): string {
  counter += 1
  return `${prefix}${counter}`
}

export function newMaterialRow(overrides: Partial<MaterialRow> = {}): MaterialRow {
  return {
    id: rowId('m'),
    name: '',
    ratio: '',
    usage: '',
    unitPrice: '',
    note: '',
    labelAmount: '',
    labelPercent: '',
    functional: false,
    ...overrides,
  }
}

export function newLineRow(overrides: Partial<LineRow> = {}): LineRow {
  return {
    id: rowId('l'),
    label: '',
    unit: '개',
    basis: 'set',
    quantity: '',
    packSize: '1',
    unitPrice: '',
    note: '',
    included: true,
    ...overrides,
  }
}

export function newOverheadRow(overrides: Partial<OverheadRow> = {}): OverheadRow {
  return { id: rowId('o'), label: '', mode: 'amount', value: '', note: '', ...overrides }
}

export function todayLabel(): string {
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
}

const DEFAULT_CONDITIONS = [
  '부가세 별도입니다.',
  '레시피 확정 전 가견적이며, 배합 확정 후 단가가 변동될 수 있습니다.',
  '초도 1회성 비용(목형비·제판비·검사비·디자인비)은 별도 청구됩니다.',
  '발주 수량과 부자재 인쇄 사양에 따라 단가가 변동될 수 있습니다.',
].join('\n')

/** 새 시트. 공장 견적서에 늘 들어가는 항목만 미리 깔아 둔다. */
export function emptySheet(): FormulaSheet {
  const line = (label: string, extra: Partial<LineRow> = {}) => newLineRow({ label, ...extra })
  return {
    spec: {
      productName: '',
      customer: '',
      foodType: '건강기능식품',
      form: '정제',
      packaging: '',
      unitWeightMg: '',
      unitsPerSet: '',
      setCount: '',
      lossPercent: '10',
      intakeGuide: '',
      shelfLife: '제조일로부터 24개월',
      quotedOn: todayLabel(),
      validity: '견적일로부터 30일',
    },
    materials: [newMaterialRow(), newMaterialRow(), newMaterialRow()],
    packagingItems: [
      line('병용기'),
      line('실리카겔'),
      line('완충비닐'),
      line('라벨'),
      line('단상자'),
      line('마감스티커'),
      line('카톤(200개입)', { packSize: '200' }),
      line('제판비', { basis: 'fixed', quantity: '1', unit: '회', included: false, note: '초도 1회' }),
      line('목형비', { basis: 'fixed', quantity: '1', unit: '회', included: false, note: '초도 1회' }),
    ],
    processItems: [line('혼합공정, 타정 및 선별, 포장, 완제품 Q.C', { unit: '정', basis: 'unit' })],
    analysisItems: [
      line('영양성분분석비', { unit: '회', basis: 'fixed', quantity: '1', included: false, note: '초도 1회, 별도청구' }),
      line('품목신고분석비', { unit: '회', basis: 'fixed', quantity: '1', included: false, note: '초도 1회, 별도청구' }),
      line('자가품질검사비', { unit: '회', basis: 'fixed', quantity: '1', included: false, note: '로트별 발생' }),
      line('광고심의비', { unit: '회', basis: 'fixed', quantity: '1', included: false, note: '초도 1회, 별도청구' }),
    ],
    quote: {
      overheads: [
        newOverheadRow({ label: '일반관리비', mode: 'rate' }),
        newOverheadRow({ label: '기업이윤', mode: 'rate' }),
      ],
      vatRate: '10',
      roundUnit: '1',
      roundMode: 'round',
      tiers: [],
      conditions: DEFAULT_CONDITIONS,
    },
    memo: '',
  }
}

/** 종합 비타민 정제 · 800mg×60정 · 1,000set · Loss 10% · 간접비 총액 입력형. */
export function tabletSheet(): FormulaSheet {
  const material = (name: string, ratio: string, unitPrice: string, extra: Partial<MaterialRow> = {}) =>
    newMaterialRow({ name, ratio, unitPrice, ...extra })
  const pack = (label: string, unitPrice: string, extra: Partial<LineRow> = {}) =>
    newLineRow({ label, unitPrice, ...extra })

  return {
    spec: {
      productName: '항산화 종합비타민 정제',
      customer: '',
      foodType: '건강기능식품',
      form: '정제',
      packaging: '100ml 병용기',
      unitWeightMg: '800',
      unitsPerSet: '60',
      setCount: '1000',
      lossPercent: '10',
      intakeGuide: '1일 1회, 1회 1정씩(총 2개월분)',
      shelfLife: '제조일로부터 24개월',
      quotedOn: todayLabel(),
      validity: '견적일로부터 30일',
    },
    materials: [
      material('비타민C 혼합제제', '15.16', '10000', {
        note: '97%', functional: true, basis: '비타민 C', labelAmount: '100mg',
        dailyIntake: '30~1,000 mg',
        functionality: '결합 조직 형성과 기능유지에 필요 / 철의 흡수에 필요 / 항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('아셀렌산나트륨 혼합제제', '0.81', '80000', {
        note: '25kg 팩킹 단위', functional: true, basis: '셀렌', labelAmount: '55㎍',
        dailyIntake: '16.5~135 ㎍',
        functionality: '항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('미역줄기분말', '10', '0', { note: '발주처 제공' }),
      material('비타민B1 염산염', '0.23', '130000', {
        functional: true, basis: '비타민 B1', labelAmount: '1.2mg', dailyIntake: '0.36~100 mg',
        functionality: '탄수화물과 에너지 대사에 필요',
      }),
      material('비타민B2', '0.206', '200000', {
        functional: true, basis: '비타민 B2', labelAmount: '1.4mg', dailyIntake: '0.42~40 mg',
        functionality: '체내 에너지 생성에 필요',
      }),
      material('비타민B6 염산염', '0.283', '150000', {
        functional: true, basis: '비타민 B6', labelAmount: '1.5mg', dailyIntake: '0.45~67 mg',
        functionality: '단백질 및 아미노산 이용에 필요 / 혈액의 호모시스테인 수준을 정상으로 유지하는데 필요',
      }),
      material('엽산', '0.0368', '500000', {
        functional: true, basis: '엽산', labelAmount: '400㎍ DFE', dailyIntake: '120~400 ㎍ DFE',
        functionality: '세포와 혈액생성에 필요 / 태아 신경관의 정상 발달에 필요 / 혈액의 호모시스테인 수준을 정상으로 유지하는데 필요',
      }),
      material('비타민B12 혼합제제', '0.37', '150000', {
        functional: true, basis: '비타민 B12', labelAmount: '2.4㎍', dailyIntake: '0.72~2,000 ㎍',
        functionality: '정상적인 엽산 대사에 필요',
      }),
      material('비타민E 혼합제제', '6.47', '100000', {
        functional: true, basis: '비타민 E', labelAmount: '11mg α-TE', dailyIntake: '3.3~400 mg α-TE',
        functionality: '항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('황산망간', '1.23', '80000', {
        functional: true, basis: '망간', labelAmount: '3mg', dailyIntake: '0.9~3.5 mg',
        functionality: '뼈 형성에 필요 / 에너지 이용에 필요 / 항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('건조효모 글루타치온', '3', '25000', { note: '2.5% 글루타치온' }),
      material('세븐베리 농축분말', '3', '30000'),
      material('빌베리 추출분말', '2', '30000'),
      material('결정셀룰로오스', '45.5042', '6500', { note: '부형제 · 잔량' }),
      material('해조칼슘', '7', '17000'),
      material('CMC 칼슘', '2', '25000'),
      material('HPMC', '0.2', '35000'),
      material('이산화규소', '1', '6000'),
      material('스테아린산마그네슘', '1.5', '7500'),
    ],
    packagingItems: [
      pack('병용기', '250', { note: '100ml' }),
      pack('실리카겔', '15'),
      pack('완충비닐', '22'),
      pack('라벨', '0', { note: '발주처 제공' }),
      pack('단상자', '0', { note: '발주처 제공' }),
      pack('마감스티커', '0', { note: '발주처 제공' }),
      pack('카톤(200개입)', '2000', { packSize: '200', note: '공용카톤 사용' }),
      pack('제판비', '0', { basis: 'fixed', quantity: '5', unit: '회', included: false, note: '초도 1회' }),
      pack('목형비', '0', { basis: 'fixed', quantity: '1', unit: '회', included: false, note: '초도 1회' }),
    ],
    processItems: [
      newLineRow({
        label: '원부자재 Q.C, 혼합공정, 타정 및 선별, 포장, 완제품 포장공정, 완제품 Q.C',
        unit: '정',
        basis: 'unit',
        unitPrice: '25',
        note: '노무비·경비 포함',
      }),
    ],
    analysisItems: [
      newLineRow({ label: '영양성분분석비', unit: '회', basis: 'fixed', quantity: '1', unitPrice: '150000', included: false, note: '초도 1회, 별도청구' }),
      newLineRow({ label: '품목신고분석비', unit: '회', basis: 'fixed', quantity: '1', unitPrice: '0', included: false, note: '초도 1회, 별도청구' }),
      newLineRow({ label: '자가품질검사비', unit: '회', basis: 'fixed', quantity: '1', unitPrice: '0', included: false, note: '로트별 발생' }),
      newLineRow({ label: '광고심의비', unit: '회', basis: 'fixed', quantity: '1', unitPrice: '100000', included: false, note: '초도 1회, 별도청구' }),
    ],
    quote: {
      // 총액 직접 입력형. 공장 견적서에 금액이 그대로 적혀 오는 경우다.
      overheads: [
        newOverheadRow({ label: '일반관리비', mode: 'amount', value: '500000' }),
        newOverheadRow({ label: '기업이윤', mode: 'amount', value: '150000' }),
      ],
      vatRate: '10',
      roundUnit: '1',
      roundMode: 'round',
      tiers: ['1000', '3000', '5000'],
      conditions: [
        '부가세 별도입니다.',
        '물류비는 별도 청구됩니다.',
        '초도 분석비(영양성분·품목신고·광고심의)는 별도 청구됩니다.',
        '시험생산이 필요하며 타정 배합비가 달라질 수 있습니다.',
        '취급하지 않는 원료는 팩킹 단위로 비용이 청구될 수 있습니다.',
      ].join('\n'),
    },
    memo: '원료비 Loss 10% UP 적용 · 단가는 예시 대표값입니다.',
  }
}

/** 소용량 정제 · 800mg×30정 · 3,000set · Loss 5% · 10원 절사 · 품질관리비 별도 항목형. */
export function compactSheet(): FormulaSheet {
  const material = (name: string, ratio: string, unitPrice: string, extra: Partial<MaterialRow> = {}) =>
    newMaterialRow({ name, ratio, unitPrice, ...extra })
  const pack = (label: string, unitPrice: string, extra: Partial<LineRow> = {}) =>
    newLineRow({ label, unitPrice, unit: 'EA', ...extra })
  const basis = (value: QuantityBasis) => ({ basis: value })

  return {
    spec: {
      productName: '비타민C 정제 (미역줄기분말 함유)',
      customer: '',
      foodType: '건강기능식품(비타민C)',
      form: '정제',
      packaging: '흑색병 / 안전캡',
      unitWeightMg: '800',
      unitsPerSet: '30',
      setCount: '3000',
      lossPercent: '5',
      intakeGuide: '1일 1정 (1정/day)',
      shelfLife: '제조일로부터 24개월',
      quotedOn: todayLabel(),
      validity: '발행일로부터 7일',
    },
    materials: [
      material('비타민C', '12.5', '50000', {
        note: '건기식용', functional: true, basis: '비타민 C', labelAmount: '100mg', dailyIntake: '30~1,000 mg',
        functionality: '결합 조직 형성과 기능유지에 필요 / 철의 흡수에 필요 / 항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('건조효모(셀렌 0.1%)', '6.875', '60000', {
        note: '셀렌 55㎍ 기준', functional: true, basis: '셀렌', labelAmount: '55㎍', dailyIntake: '16.5~135 ㎍',
        functionality: '항산화작용을 하여 유해산소로부터 세포를 보호하는데 필요',
      }),
      material('미역줄기분말', '25', '0', { note: '사급(발주처 제공)' }),
      material('새싹보리 추출분말', '5', '17000'),
      material('엽산', '0.2', '250000', {
        functional: true, basis: '엽산', labelAmount: '400㎍ DFE', dailyIntake: '120~400 ㎍ DFE',
        functionality: '세포와 혈액생성에 필요 / 태아 신경관의 정상 발달에 필요',
      }),
      material('비타민B12 혼합제제', '0.1', '150000', {
        functional: true, basis: '비타민 B12', labelAmount: '2.4㎍', dailyIntake: '0.72~2,000 ㎍',
        functionality: '정상적인 엽산 대사에 필요',
      }),
      material('결정셀룰로오스', '31.225', '10000', { note: '부형제 · 잔량' }),
      material('정제포도당', '10', '3000'),
      material('CMC 칼슘', '3', '30000'),
      material('HPMC', '3', '25000'),
      material('이산화규소', '1.5', '7000'),
      material('스테아린산마그네슘', '1.5', '10000'),
      material('글리세린지방산에스테르', '0.1', '6000'),
    ],
    packagingItems: [
      pack('카톤(100개입)', '1800', { packSize: '100' }),
      pack('단케이스', '400'),
      pack('라벨', '200'),
      pack('병용기(흑색병/안전캡)', '350'),
      pack('완충비닐', '10'),
      pack('실리카겔', '10'),
      pack('마감스티커', '10'),
    ],
    processItems: [
      newLineRow({ label: '혼합 / 타정·코팅·선별 / 외포장', unit: '정', ...basis('unit'), unitPrice: '60' }),
    ],
    analysisItems: [],
    quote: {
      // 항목이 늘어나는 형태. 품질관리비(GMP)·고정비를 따로 세우는 공장이 있다.
      overheads: [
        newOverheadRow({ label: '제조경비/일반관리', mode: 'amount', value: '200000' }),
        newOverheadRow({ label: '품질관리비', mode: 'amount', value: '500000', note: 'GMP' }),
        newOverheadRow({ label: '고정비(물류포함)', mode: 'amount', value: '200000' }),
      ],
      vatRate: '10',
      roundUnit: '10',
      roundMode: 'floor',
      tiers: ['3000', '5000', '10000'],
      conditions: [
        '견적서 유효기간은 발행일로부터 7일이며 이후 단가가 변동될 수 있습니다.',
        '부가세 별도입니다.',
        '미역줄기분말은 사급(발주처 제공) 기준입니다.',
      ].join('\n'),
    },
    memo: 'LOSS(수율) +5% 적용 · 최종 단가 10원 단위 절사 · 단가는 예시 대표값입니다.',
  }
}

export const SAMPLE_SHEETS = [
  { id: 'tablet', label: '종합비타민 정제 (800mg×60정 · Loss 10% · 총액 간접비)', short: '정제 60정', build: tabletSheet },
  { id: 'compact', label: '비타민C 정제 (800mg×30정 · Loss 5% · 10원 절사)', short: '정제 30정', build: compactSheet },
] as const
