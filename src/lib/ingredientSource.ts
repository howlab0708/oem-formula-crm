/**
 * 영양성분 원료의 '기원(형태)' 판정.
 *
 * 같은 영양성분이라도 원료로 무엇을 썼는지가 원가·라벨 소구·거래처 선호를 모두
 * 바꾼다. 아연 하나만 봐도 산화아연·글루콘산아연·황산아연·건조효모가 다 쓰이고,
 * 비타민E 는 천연형(d-)과 합성형(dl-)이 갈린다. 식약처 품목제조보고 원본은 이
 * 구분을 원재료명 문자열 안에만 담고 있어서, 필터로 쓰려면 문자열을 형태로
 * 되돌려야 한다.
 *
 * 표기가 심하게 흔들린다(원본 45,996건 실측):
 *   비타민D3혼합제제 / 비타민 D3 혼합제제분말 / 분말비타민D3혼합제제 / 비타민 D3 혼합제제유지
 *   건조효모(셀렌함유) / 셀레늄함유건조효모 / 식용건조효모(셀렌으로서 0.1%) / 효모((셀렌))
 *   건조효모&#40;아연함유&#41;   <- 괄호가 HTML 엔티티로 남은 행까지 있다
 * 그래서 공백·표식·기호를 지운 납작한 문자열로 비교한다.
 *
 * 가장 조심할 것은 이름에 영양성분이 들어 있지만 그 영양성분의 원료가 아닌 원료다.
 *   스테아린산마그네슘 15,161건 - 활택제. 마그네슘 영양원이 아니다.
 *   카복시메틸셀룰로스칼슘 5,919건 - 붕해제.
 *   판토텐산칼슘 6,577건 - 비타민B5 원료. 칼슘으로 세면 안 된다.
 *   L-아스코브산칼슘 - 비타민C 원료.
 * 걸러내지 않으면 "마그네슘 원료 1위가 활택제" 가 되어 통계가 통째로 못 쓰게 된다.
 * 영양성분별 `deny` 가 그 역할을 한다.
 *
 * 판정은 네 축으로 나눈다. 연구원이 원료를 고를 때 실제로 쓰는 축이다.
 *   nutrient  어떤 영양성분의 원료인가   (아연)
 *   form      구체적으로 어떤 형태인가    (산화아연)
 *   origin    무엇에서 얻었는가          (화학합성 / 효모 / 천연물 / 미표기)
 *   prep      어떤 제제로 만들어 왔는가   (혼합제제 / 유지 / 분말 / 원말)
 * origin 과 prep 은 서로 독립이다 - '비타민 D3 혼합제제유지' 는 화학합성 + 유지 제제,
 * '건조효모(비타민D)' 는 효모 유래 + 원말이다.
 *
 * 판정은 신고된 원재료명 표기만 근거로 한다. 표기에 없는 정보는 채우지 않는다 -
 * 이 앱의 값은 전부 식약처 공개 자료로 되짚을 수 있다는 데서 나온다. 그래서
 * 원산지(국가)는 판정하지 않는다. 원본에 그 칸이 없다.
 */

import type { Product } from './types'

export type SourceOrigin = 'yeast' | 'natural' | 'synthetic' | 'unspecified'
export type SourcePrep = 'premix' | 'oil' | 'powder' | 'plain'

export const ORIGIN_LABELS: Record<SourceOrigin, string> = {
  yeast: '효모 유래',
  natural: '천연물 유래',
  synthetic: '화학합성',
  unspecified: '형태 미표기',
}

export const PREP_LABELS: Record<SourcePrep, string> = {
  premix: '혼합제제',
  oil: '유지(Oil)',
  powder: '분말 · 과립',
  plain: '원말',
}

export const ORIGIN_ORDER: SourceOrigin[] = ['yeast', 'natural', 'synthetic', 'unspecified']
export const PREP_ORDER: SourcePrep[] = ['premix', 'oil', 'powder', 'plain']

export type SourceMatch = {
  /** 이 원료가 공급하는 영양성분. 영양성분을 못 가리면 null(제제 형태만 판정). */
  nutrient: string | null
  form: string
  origin: SourceOrigin
  prep: SourcePrep
  /**
   * 이름만으로는 영양원인지 부형제인지 못 가리는 원료.
   * 제품이 그 영양성분을 기준규격에 함량으로 선언했을 때만 영양원으로 센다 -
   * 판단은 제품 문맥을 아는 `productSources` 가 한다.
   */
  requiresDeclared?: boolean
  /** requiresDeclared 인데 선언이 없을 때 쓰는 이름 */
  excipientForm?: string
}

/* ── 표기 정규화 ────────────────────────────────────────────────── */

const ENTITY_RE = /&#(\d{2,4});/g
const TAG_RE = /[([<]?\s*(?:고시형|개별인정형)\s*[)\]>]?/g
const GREEK: Record<string, string> = { 'α': '알파', 'β': '베타', 'γ': '감마', 'δ': '델타' }

/**
 * 비교용 납작한 문자열.
 * 공백·하이픈·중점을 지우면 'D-알파-토코페롤' 과 'd-α-토코페롤' 이 같은 값이 된다.
 * 숫자는 남긴다 - 비타민B1/B6/B12, D2/D3, K1/K2 는 숫자로만 갈린다.
 */
export function flattenSource(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(ENTITY_RE, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(TAG_RE, '')
    .replace(/[αβγδ]/g, (c) => GREEK[c] ?? c)
    .replace(/alpha/gi, '알파')
    .replace(/비타민\s*-?\s*([A-Za-z])\s*-?\s*(\d*)/g, (_, letter: string, digits: string) =>
      `비타민${letter.toLowerCase()}${digits}`,
    )
    .replace(/[\s\-–—·・_'"“”‘’]/g, '')
    .toLowerCase()
}

/** 괄호가 열리기 전까지의 머리 부분. 원료 이름 본체다. */
function headOf(flat: string): string {
  const cut = flat.search(/[([{<]/)
  return cut === -1 ? flat : flat.slice(0, cut)
}

/* ── 제제 형태(prep) ────────────────────────────────────────────── */

// '혼합' 만 적고 '제제' 를 빼먹은 표기가 많다(비타민 B12 혼합 / 비타민A혼합분말).
const PREMIX_RE = /혼합제제|혼합분말|혼합액|혼합$|혼합(?=분말|유지|비타민|제제)/
const OIL_RE = /유지|유성|oil|오일/
const POWDER_RE = /분말|가루|과립|결정성/

function prepOf(flat: string): SourcePrep {
  if (PREMIX_RE.test(flat)) return 'premix'
  if (OIL_RE.test(flat)) return 'oil'
  if (POWDER_RE.test(flat)) return 'powder'
  return 'plain'
}

/* ── 영양성분별 형태 규칙 ───────────────────────────────────────── */

type FormRule = {
  form: string
  origin: SourceOrigin
  match: RegExp
  /** 제품이 이 영양성분을 기준규격에 함량으로 선언했을 때만 영양원으로 센다 */
  declaredOnly?: boolean
  /** 선언이 없을 때 쓰는 이름 */
  excipientForm?: string
}
type NutrientRule = {
  name: string
  match: RegExp
  /** 이름은 걸리지만 이 영양성분의 원료가 아닌 것 */
  deny?: RegExp
  /** 위에서부터 처음 걸린 규칙을 쓴다. 좁은 이름을 먼저 둔다. */
  forms: FormRule[]
}

const SALT = 'synthetic' as const
const NATURAL = 'natural' as const

/**
 * 순서가 판정 순서다. 이름이 겹치는 영양성분은 좁은 쪽을 먼저 둔다
 * (판토텐산칼슘은 '판토텐산' 이 먼저 걸려야 하고, 아셀렌산나트륨은 '셀렌산나트륨'
 * 규칙보다 먼저 걸려야 한다).
 */
const NUTRIENTS: NutrientRule[] = [
  /* ── 비타민 ── */
  {
    name: '비타민A',
    match: /비타민a|레티닐|레티놀/,
    forms: [
      { form: '레티닐팔미테이트', origin: SALT, match: /팔미/ },
      { form: '비타민A 지방산에스테르', origin: SALT, match: /지방산에스테르/ },
      { form: '비타민A 초산염(아세테이트)', origin: SALT, match: /초산|아세테이트|acetate/ },
    ],
  },
  {
    name: '베타카로틴',
    match: /베타카로틴|카로틴/,
    forms: [
      { form: '조류 유래 베타카로틴', origin: NATURAL, match: /조류|두나리엘라|두날리엘라/ },
      { form: '천연 베타카로틴', origin: NATURAL, match: /천연/ },
      { form: '합성 베타카로틴', origin: SALT, match: /합성/ },
    ],
  },
  {
    name: '비타민B1',
    match: /비타민b1(?!\d)|티아민/,
    forms: [
      { form: '비타민B1 염산염', origin: SALT, match: /염산염/ },
      { form: '비타민B1 질산염', origin: SALT, match: /질산염/ },
      { form: '비타민B1 라우릴황산염', origin: SALT, match: /라우릴/ },
    ],
  },
  {
    name: '비타민B2',
    match: /비타민b2|리보플라빈|ribofl?avin/,
    forms: [{ form: '비타민B2 인산에스테르나트륨', origin: SALT, match: /인산에스테르/ }],
  },
  {
    name: '나이아신(비타민B3)',
    match: /나이아신|니코틴산/,
    // 니코틴산아미드 모노뉴클레오타이드(NMN)는 나이아신 영양원으로 신고된 원료가 아니다.
    deny: /모노뉴클레오타이드|뉴클레오티드|nmn/,
    forms: [{ form: '니코틴산아미드', origin: SALT, match: /아미드|아니드/ }],
  },
  {
    name: '판토텐산(비타민B5)',
    match: /판토텐/,
    forms: [
      { form: '판토텐산칼슘', origin: SALT, match: /칼슘/ },
      { form: '판토텐산나트륨', origin: SALT, match: /나트륨/ },
    ],
  },
  {
    name: '비타민B6',
    match: /비타민b6|피리독신|피리독살/,
    forms: [
      { form: '비타민B6 염산염', origin: SALT, match: /염산염/ },
      { form: '피리독살인산염', origin: SALT, match: /피리독살/ },
    ],
  },
  {
    name: '비오틴(비타민B7)',
    match: /비오틴|바이오틴/,
    forms: [],
  },
  {
    name: '엽산(비타민B9)',
    match: /엽산|폴산|folic/,
    forms: [
      { form: '메틸테트라히드로엽산(활성형)', origin: SALT, match: /메틸테트라|메틸엽산|5mthf/ },
      { form: '레몬 추출물 유래 엽산', origin: NATURAL, match: /레몬/ },
    ],
  },
  {
    name: '비타민B12',
    match: /비타민b12|코발라민/,
    forms: [
      { form: '메틸코발라민(활성형)', origin: SALT, match: /메틸코발라민/ },
      { form: '시아노코발라민', origin: SALT, match: /시아노/ },
    ],
  },
  {
    name: '비타민C',
    match: /비타민c|아스코르|아스코브|ascorb|아세로라/,
    forms: [
      { form: '아세로라 유래 비타민C', origin: NATURAL, match: /아세로라|카무카무|로즈힙/ },
      { form: '아스코르브산나트륨', origin: SALT, match: /나트륨/ },
      { form: '아스코르브산칼슘', origin: SALT, match: /칼슘/ },
      { form: 'L-아스코르브산(순품)', origin: SALT, match: /아스코르|아스코브|ascorb/ },
    ],
  },
  {
    name: '비타민D',
    match: /비타민d(?!\d?[a-z])/,
    forms: [
      { form: '비타민D3(콜레칼시페롤)', origin: SALT, match: /비타민d3|콜레칼/ },
      { form: '비타민D2(에르고칼시페롤)', origin: SALT, match: /비타민d2|에르고칼/ },
    ],
  },
  {
    name: '비타민E',
    match: /비타민e|토코페롤|토코페릴|토코트리/,
    forms: [
      { form: 'd-α-토코페롤 (천연형)', origin: NATURAL, match: /(?:^|[^l])d알파토코페롤|^d토코페롤/ },
      { form: 'dl-α-토코페롤 (합성형)', origin: SALT, match: /dl알파토코페롤|dl토코페롤/ },
      { form: 'd-α-토코페릴 에스테르 (천연형)', origin: NATURAL, match: /(?:^|[^l])d알파토코페릴/ },
      { form: 'dl-α-토코페릴 에스테르 (합성형)', origin: SALT, match: /dl알파토코페릴|dl토코페릴/ },
      { form: '토코트리에놀', origin: NATURAL, match: /토코트리/ },
    ],
  },
  {
    name: '비타민K',
    match: /비타민k(?!\d?[a-z])|메나퀴논|필로퀴논/,
    forms: [
      { form: '비타민K2(메나퀴논-7)', origin: NATURAL, match: /비타민k2|메나퀴논|mk7/ },
      { form: '비타민K1(필로퀴논)', origin: SALT, match: /비타민k1|필로퀴논/ },
    ],
  },

  /* ── 무기질 ── */
  {
    name: '칼슘',
    // 판토텐산칼슘=비타민B5, 아스코르브산칼슘=비타민C, 카복시메틸셀룰로스칼슘·스테아린산칼슘=부형제.
    // 제1인산칼슘은 산도조절제·팽창제, 피로인산칼슘은 팽창제로 쓰인다(공전 칼슘 기원이 아니다).
    match: /칼슘/,
    deny: /판토텐|아스코[르브]|ascorb|카복시|카르복시|셀룰로|스테아|프로피온산|글루타민산|피루브산|사카린|제일인산|제1인산|인산일칼슘|인산이수소|피로인산칼슘/,
    forms: [
      { form: '해조칼슘 (천연 유래)', origin: NATURAL, match: /해조|리소탐니온|산호/ },
      { form: '유청칼슘 (유청 유래)', origin: NATURAL, match: /유청/ },
      { form: '난각칼슘 (천연 유래)', origin: NATURAL, match: /난각|계란껍질|난피/ },
      { form: '어골칼슘 (천연 유래)', origin: NATURAL, match: /어골|어류|생선뼈/ },
      // 탄산칼슘은 칼슘 함량이 높아 주원료로 쓰면 원재료명 최상단에 온다. 반대로 칼슘
      // 표기가 없고 끝자락에 적힌 건은 이산화티타늄 대체용 백색 필름코팅제나 타정
      // 충전제로 쓴 경우다(실측 679건, 평균 위치 0.60). 섭취 목적의 급원이 아니다.
      {
        form: '탄산칼슘',
        origin: SALT,
        match: /탄산칼슘/,
        declaredOnly: true,
        excipientForm: '탄산칼슘 (부형제 · 칼슘 함량 표시 없음)',
      },
      { form: '구연산칼슘', origin: SALT, match: /구연산|시트르산/ },
      { form: '젖산칼슘', origin: SALT, match: /젖산|락트산/ },
      // 제2·제3인산칼슘은 칼슘 보충용 주원료로도 쓰이지만, 현장에서는 분말 유동성을
      // 높이고 뭉침을 막는 고결방지제·타정 부형제로 극소량 넣는 쪽이 더 많다. 실측하면
      // 인산칼슘을 쓴 제품 781건 중 기준규격에 칼슘 함량이 잡히는 건 155건뿐이고
      // (나머지 626건은 원재료명 끝자락에만 적혀 있다) 전부 영양원으로 세면 칼슘 배합
      // 트렌드가 5배로 과대 집계된다. 그래서 칼슘을 함량으로 선언한 제품에서만 센다.
      {
        form: '인산칼슘 (제2 · 제3)',
        origin: SALT,
        match: /인산/,
        declaredOnly: true,
        excipientForm: '인산칼슘 (부형제 · 칼슘 함량 표시 없음)',
      },
      { form: '염화칼슘', origin: SALT, match: /염화/ },
      { form: '글루콘산칼슘', origin: SALT, match: /글루콘산/ },
      { form: '산화·수산화칼슘', origin: SALT, match: /산화칼슘/ },
    ],
  },
  {
    name: '마그네슘',
    // 스테아린산마그네슘 15,161건은 활택제다. 이걸 빼지 않으면 마그네슘 통계가 무의미해진다.
    match: /마그네슘/,
    deny: /스테아|규산|알루미늄/,
    forms: [
      { form: '산화마그네슘', origin: SALT, match: /산화마그네슘/ },
      { form: '수산화마그네슘', origin: SALT, match: /수산화/ },
      { form: '염화마그네슘', origin: SALT, match: /염화/ },
      { form: '글루콘산마그네슘', origin: SALT, match: /글루콘산/ },
      { form: '젖산마그네슘', origin: SALT, match: /젖산|락트산/ },
      { form: '황산마그네슘', origin: SALT, match: /황산/ },
      { form: '탄산마그네슘', origin: SALT, match: /탄산/ },
      { form: '구연산마그네슘', origin: SALT, match: /구연산|시트르산/ },
    ],
  },
  {
    name: '아연',
    match: /아연/,
    deny: /스테아/,
    forms: [
      { form: '산화아연', origin: SALT, match: /산화아연/ },
      { form: '글루콘산아연', origin: SALT, match: /글루콘산/ },
      { form: '황산아연', origin: SALT, match: /황산/ },
      { form: '구연산아연', origin: SALT, match: /구연산|시트르산/ },
      { form: '피콜린산아연', origin: SALT, match: /피콜린/ },
    ],
  },
  {
    name: '철',
    // 사철쑥·철갑상어처럼 '철' 이 다른 단어의 일부인 원료를 먼저 뺀다.
    match: /철/,
    deny: /사철|철갑|철쭉|주철|강철|무쇠/,
    forms: [
      { form: '헴철 (천연 유래)', origin: NATURAL, match: /헴철|헤모글로빈|혈액/ },
      { form: '푸마르산제일철', origin: SALT, match: /푸마르산/ },
      { form: '피로인산제이철', origin: SALT, match: /피로인산/ },
      { form: '인산철', origin: SALT, match: /인산/ },
      { form: '젖산철', origin: SALT, match: /젖산|락트산/ },
      { form: '황산제일철', origin: SALT, match: /황산/ },
      { form: '구연산철', origin: SALT, match: /구연산|시트르산/ },
      { form: '산화철', origin: SALT, match: /산화철/ },
      { form: '글루콘산철', origin: SALT, match: /글루콘산/ },
    ],
  },
  {
    name: '셀레늄',
    // 파라다이스넛(브라질너트)은 공전에서 셀레늄 기원으로만 쓰인다.
    match: /셀레늄|셀렌|파라다이스넛|브라질너트/,
    forms: [
      { form: '파라다이스넛 추출물 (천연 유래)', origin: NATURAL, match: /파라다이스넛|브라질너트/ },
      { form: '아셀렌산나트륨', origin: SALT, match: /아셀렌산|아셀레늄산/ },
      { form: '셀렌산나트륨', origin: SALT, match: /셀렌산|셀레늄산/ },
    ],
  },
  {
    name: '크롬',
    match: /크롬/,
    forms: [
      { form: '염화크롬', origin: SALT, match: /염화/ },
      { form: '피콜린산크롬', origin: SALT, match: /피콜린/ },
    ],
  },
  {
    name: '망간',
    match: /망간/,
    forms: [
      { form: '황산망간', origin: SALT, match: /황산/ },
      { form: '글루콘산망간', origin: SALT, match: /글루콘산/ },
      { form: '구연산망간', origin: SALT, match: /구연산|시트르산/ },
      { form: '염화망간', origin: SALT, match: /염화/ },
    ],
  },
  {
    name: '구리',
    match: /구리|글루콘산동|황산동/,
    forms: [
      { form: '글루콘산동', origin: SALT, match: /글루콘산/ },
      { form: '황산동', origin: SALT, match: /황산/ },
    ],
  },
  {
    name: '요오드',
    match: /요오드|아이오딘/,
    forms: [
      { form: '요오드산칼륨', origin: SALT, match: /요오드산|아이오딘산/ },
      { form: '요오드화칼륨', origin: SALT, match: /칼륨/ },
      { form: '다시마 유래 요오드 (천연 유래)', origin: NATURAL, match: /다시마|해조|켈프/ },
    ],
  },
  {
    name: '몰리브덴',
    match: /몰리브/,
    forms: [{ form: '몰리브덴산나트륨', origin: SALT, match: /몰리브덴산|나트륨/ }],
  },
  {
    // 어떤 비타민인지 안 적고 '비타민혼합분말'·'비타민 B 복합제제' 로만 적은 표기.
    // 숫자가 붙은 개별 비타민(비타민b1…)은 위에서 이미 잡히므로 여기 걸리지 않는다.
    name: '비타민 · 무기질 복합',
    match: /비타민(무기질|미네랄|믹스)|비타민혼합|혼합비타민|혼합제제비타민|비타민b(?!\d)/,
    // 비타민나무(산자나무)·비타민P 는 공전 영양성분이 아니다.
    deny: /비타민나무|비타민p/,
    forms: [],
  },
]

export const NUTRIENT_NAMES: string[] = NUTRIENTS.map((rule) => rule.name)

/* ── 판정 ───────────────────────────────────────────────────────── */

const YEAST_RE = /효모/
const YEAST_PRODUCT_RE = /^(?:건조|식용|맥주)*효모(?:식품|추출물|추출분말|분말|가루|과립)*$/

/**
 * 형태 이름에 제제까지 붙인다.
 *
 * 연구원이 찾는 단위는 '비타민D' 가 아니라 '비타민D3 혼합제제' 다 - 같은 D3 라도
 * 혼합제제로 받는지 유지로 받는지에 따라 취급·단가·라벨이 달라진다. 분말·과립은
 * 순품의 물리 형태일 뿐이라 따로 갈라 봐야 목록만 늘어나므로 붙이지 않는다.
 */
const PREP_SUFFIX: Partial<Record<SourcePrep, string>> = {
  premix: ' · 혼합제제',
  oil: ' · 유지(Oil)',
}

function formFor(rule: NutrientRule, flat: string, prep: SourcePrep): SourceMatch {
  const suffix = PREP_SUFFIX[prep] ?? ''

  if (YEAST_RE.test(flat)) {
    return { nutrient: rule.name, form: `건조효모(${rule.name})${suffix}`, origin: 'yeast', prep }
  }
  for (const candidate of rule.forms) {
    if (candidate.match.test(flat)) {
      return {
        nutrient: rule.name,
        form: `${candidate.form}${suffix}`,
        origin: candidate.origin,
        prep,
        ...(candidate.declaredOnly
          ? { requiresDeclared: true, excipientForm: `${candidate.excipientForm ?? candidate.form}${suffix}` }
          : {}),
      }
    }
  }
  // 화학적 형태를 안 적은 표기. 제제라도 알면 그걸 이름으로 쓴다.
  const form = suffix ? `${rule.name}${suffix}` : `${rule.name} (형태 미표기)`
  return { nutrient: rule.name, form, origin: 'unspecified', prep }
}

function matchNutrients(text: string, flat: string, prep: SourcePrep): SourceMatch[] {
  const out: SourceMatch[] = []
  for (const rule of NUTRIENTS) {
    if (!rule.match.test(text)) continue
    if (rule.deny?.test(text)) continue
    out.push(formFor(rule, flat, prep))
  }
  return out
}

const tokenCache = new Map<string, SourceMatch[]>()
const TOKEN_CACHE_LIMIT = 200_000

/**
 * 이름 자체로는 아무 원료도 가리키지 않는 머리. 이때만 괄호 안을 들여다본다.
 * '건조효모(셀렌함유)' 는 괄호 안이 원료의 정체지만,
 * '정제어유(정제어유 99.9%, 비타민E 0.1%)' 의 괄호 안 비타민E는 산화방지 목적이라
 * 비타민E 원료로 세면 안 된다.
 */
const GENERIC_HEAD_RE = /^(?:식품첨가물|비타민|무기질|건조|식용|맥주)*(?:효모|혼합제제|혼합|제제|분말|가루|과립)+$/

/**
 * 원료 이름 하나를 판정한다. 복합 혼합제제는 여러 영양성분을 함께 돌려준다.
 *
 * 머리 부분(괄호 앞)을 먼저 본다. 괄호 안에는 부형제·담체·산화방지제가 함께
 * 적혀 있어서 ("비타민 B12 혼합제제(비타민B12 1%, 제이인산칼슘 99%)") 문자열
 * 전체로 세면 그 제품이 칼슘 원료를 쓴 것처럼 잡힌다. 머리가 원료를 전혀
 * 가리키지 않을 때에만 괄호 안을 본다.
 */
export function classifySources(name: string): SourceMatch[] {
  const raw = name.trim()
  if (!raw) return []
  const hit = tokenCache.get(raw)
  if (hit) return hit

  const flat = flattenSource(raw)
  const prep = prepOf(flat)
  const head = headOf(flat)

  let matches = matchNutrients(head, flat, prep)
  if (matches.length === 0 && GENERIC_HEAD_RE.test(head)) {
    matches = matchNutrients(flat, flat, prep)
  }

  if (matches.length === 0) {
    // 영양성분을 못 가려도 제제 형태만으로 쓸모가 있다(부형제로 쓰인 '혼합제제' 등).
    const yeast = YEAST_RE.test(flat)
    if (yeast || prep !== 'plain') {
      matches = [
        {
          nutrient: null,
          form: yeast && YEAST_PRODUCT_RE.test(head) ? '효모 (영양성분 미표기)' : PREP_LABELS[prep],
          origin: yeast ? 'yeast' : 'unspecified',
          prep,
        },
      ]
    }
  }

  if (tokenCache.size >= TOKEN_CACHE_LIMIT) tokenCache.clear()
  tokenCache.set(raw, matches)
  return matches
}

/**
 * 제품이 기준규격(지표성분)에 **함량으로** 선언한 영양성분.
 *
 * 이름만으로 영양원인지 못 가리는 원료(인산칼슘)를 가릴 때 쓴다. 제품의 영양·기능정보에
 * 그 성분의 함량이 잡혀 있으면 영양원으로 넣은 것이고, 없으면 부형제로 넣은 것이다.
 * 질량 단위로 환산된 표시량만 인정한다 - '확인' 같은 정성 규격은 함량 표시가 아니다.
 */
function declaredNutrients(product: Product): Set<string> {
  const declared = new Set<string>()
  for (const marker of product.markers) {
    if (marker.mgValue === null) continue
    const flat = flattenSource(marker.name)
    for (const rule of NUTRIENTS) {
      if (rule.match.test(flat) && !rule.deny?.test(flat)) declared.add(rule.name)
    }
  }
  return declared
}

export type ProductSources = {
  /** 영양성분 -> 그 제품이 쓴 형태들 */
  forms: Map<string, Set<string>>
  origins: Set<SourceOrigin>
  preps: Set<SourcePrep>
  /** 영양원이 아니라 부형제로 판정한 원료 형태. 과대 집계를 막되 사라지지는 않게 남긴다. */
  excipientForms: Set<string>
}

const productCache = new WeakMap<Product, ProductSources>()

/** 한 제품의 모든 원료(주원료+부원료)를 판정한다. 필터가 매 입력마다 도는 경로라 캐시한다. */
export function productSources(product: Product): ProductSources {
  const hit = productCache.get(product)
  if (hit) return hit

  const result: ProductSources = {
    forms: new Map<string, Set<string>>(),
    origins: new Set<SourceOrigin>(),
    preps: new Set<SourcePrep>(),
    excipientForms: new Set<string>(),
  }
  const declared = declaredNutrients(product)

  for (const name of product.mainIngredients) collect(name, declared, result)
  for (const name of product.subIngredients) collect(name, declared, result)

  productCache.set(product, result)
  return result
}

function collect(name: string, declared: ReadonlySet<string>, into: ProductSources): void {
  for (const match of classifySources(name)) {
    into.origins.add(match.origin)
    into.preps.add(match.prep)

    if (!match.nutrient) continue
    if (match.requiresDeclared && !declared.has(match.nutrient)) {
      into.excipientForms.add(match.excipientForm ?? match.form)
      continue
    }
    const bucket = into.forms.get(match.nutrient) ?? new Set<string>()
    bucket.add(match.form)
    into.forms.set(match.nutrient, bucket)
  }
}

export type SourceFormOption = {
  form: string
  count: number
  origin: SourceOrigin
}

/** 데이터에 실제로 등장한 영양성분 목록(제품 수 기준 내림차순). */
export function sourceNutrientOptions(products: Product[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const product of products) {
    for (const nutrient of productSources(product).forms.keys()) {
      counts.set(nutrient, (counts.get(nutrient) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'))
}

/** 형태 이름에서 기원을 되찾는 표. 형태 문자열만 들고 다니는 필터 상태를 위해 만든다. */
const ORIGIN_BY_FORM = new Map<string, SourceOrigin>()
for (const rule of NUTRIENTS) {
  ORIGIN_BY_FORM.set(`건조효모(${rule.name})`, 'yeast')
  ORIGIN_BY_FORM.set(`${rule.name} (형태 미표기)`, 'unspecified')
  for (const candidate of rule.forms) ORIGIN_BY_FORM.set(candidate.form, candidate.origin)
}

export function originOfForm(form: string): SourceOrigin {
  // 형태 이름 뒤에는 제제 꼬리표(' · 혼합제제')가 붙어 있을 수 있다.
  const base = form.split(' · ')[0]
  return ORIGIN_BY_FORM.get(base) ?? 'unspecified'
}

/** 한 영양성분의 형태별 제품 수. */
export function sourceFormOptions(products: Product[], nutrient: string): SourceFormOption[] {
  const counts = new Map<string, number>()

  for (const product of products) {
    const forms = productSources(product).forms.get(nutrient)
    if (!forms) continue
    for (const form of forms) counts.set(form, (counts.get(form) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([form, count]) => ({ form, count, origin: originOfForm(form) }))
    .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form, 'ko'))
}
