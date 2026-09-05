/**
 * 원재료 분류 사전.
 *
 * 식약처 품목제조보고 원본 데이터의 `원재료명` 은 주원료와 부원료가 한 칸에
 * 쉼표로 나열된다. 영업 브리핑에서는 "무엇이 기능성 주원료였는가" 와
 * "무엇이 배합 차별화를 위한 부원료였는가" 를 갈라야 의미가 생기므로,
 * 고시형/개별인정형 기능성 원료 키워드 사전으로 1차 분류한다.
 *
 * 사전에 없으면 부원료로 떨어지고, 그중 제형을 만들기 위해 거의 모든 제품에
 * 들어가는 부형제는 통계에서 제외한다(부형제까지 세면 "다빈도 부원료" 가
 * 전부 결정셀룰로오스·스테아린산마그네슘이 되어 상담에 쓸모가 없다).
 */

/** 기능성 주원료 키워드. 부분 문자열로 매칭한다. */
export const FUNCTIONAL_KEYWORDS = [
  // 간 건강
  '밀크씨슬', '카르두스', '실리마린', '헛개', '표고버섯균사체', '브로콜리스프라우트',
  // 인삼/홍삼
  '홍삼', '인삼', '진세노사이드', '흑삼',
  // 유산균/장
  '프로바이오틱스', '유산균', '락토바실', '비피도박테', '프리바이오틱스', '프락토올리고당',
  '이눌린', '차전자피', '갈락토올리고당', '자일로올리고당',
  // 눈
  '루테인', '지아잔틴', '빌베리', '아스타잔틴', '헤마토코쿠스',
  // 혈행/지질
  '오메가', 'EPA', 'DHA', '어유', '크릴', '정제어유', '난소화성말토덱스트린',
  '폴리코사놀', '옥타코사놀', '홍국', '모나콜린', '감마리놀렌산', '달맞이꽃',
  // 관절/뼈
  'MSM', '엠에스엠', '글루코사민', '보스웰리아', '초록입홍합', 'N-아세틸글루코사민',
  '콘드로이틴', '가시오갈피', '식이유황',
  // 항산화/피로
  '코엔자임', '코엔자임Q10', '큐텐', '비타민', '미네랄', '아연', '마그네슘', '칼슘',
  '철', '셀레늄', '셀렌', '크롬', '요오드', '망간', '구리', '엽산', '비오틴',
  '판토텐산', '나이아신',
  // 인지/수면/스트레스
  '테아닌', '홍경천', '로디올라', '로사빈', '포스파티딜세린', '감태', '미강주정',
  '락티움', '유단백가수분해물', '아쉬아간다', '아슈아간다', '길초근', '레몬밤',
  // 체지방/혈당
  '가르시니아', 'HCA', '하이드록시시트르산', '녹차추출물', '카테킨', '바나바',
  '코로솔산', '와일드망고', '히비스커스', '그린커피', '클로로겐산',
  // 여성/남성
  '쏘팔메토', '쿠쿠르비타', '백수오', '회화나무', '석류', '이소플라본', '대두이소플라본',
  '감마리놀렌', '크랜베리', '엘-아르기닌', 'L-아르기닌', '아르기닌', '아연효모',
  // 유산균 균주명(원본 데이터는 학명으로 적힌다)
  'lactobacillus', 'lacticaseibacillus', 'lactiplantibacillus', 'limosilactobacillus',
  'bifidobacterium', 'lactococcus', 'streptococcus', 'enterococcus', 'leuconostoc',
  'weissella', 'pediococcus', 'saccharomyces', 'bacillus',
  // 면역/기타
  '베타글루칸', '클로렐라', '스피루리나', '알로에', '프로폴리스', '콜라겐', '저분자콜라겐',
  '히알루론산', '엘라스틴', '세라마이드', '타우린', '아미노산', '단백질', '분리유청단백',
  '실크아미노산', '글루타티온', '커큐민', '울금', '강황', '마늘', '흑마늘', '양파',
  '초임계', '스콸렌', '녹용', '침향', '보이차', '여주', '돼지감자',
] as const

/** 제형 성립을 위한 부형제. 다빈도 통계에서 제외한다. */
export const EXCIPIENT_KEYWORDS = [
  '결정셀룰로오스', '미결정셀룰로오스', '셀룰로오스', 'HPMC', '히드록시프로필메틸셀룰로오스',
  '하이드록시프로필메틸셀룰로오스', '스테아린산마그네슘', '스테아르산마그네슘',
  '이산화규소', '실리카', '이산화티타늄', '산화티타늄', '탈크', '카르나우바',
  '카나우바', '쉘락', '셸락', '히드록시프로필셀룰로오스', '크로스카멜로오스',
  '전분글리콜산나트륨', '정제수', '글리세린', '젤라틴', '대두유', '밀납', '밀랍',
  '황납', '레시틴', '식물성유지', '팜유', '경화유', '중쇄중성지방', 'MCT',
  '덱스트린', '말토덱스트린', '유당', '포도당', '자일리톨', '에리스리톨',
  '스테비올배당체', '수크랄로스', '효소처리스테비아', '구연산', '구연산나트륨',
  '혼합제제', '착향료', '향료', '착색료', '색소', '치자', '카라멜색소',
  '히프로멜로스', '풀루란', '전분', '변성전분', '아라비아검', '잔탄검', '펙틴',
  '카라기난', '커드란', '이산화황',
] as const

const FUNCTIONAL_SET = FUNCTIONAL_KEYWORDS.map((k) => k.toLowerCase())
const EXCIPIENT_SET = EXCIPIENT_KEYWORDS.map((k) => k.toLowerCase())

/**
 * 원료 이름 하나당 판정은 한 번만 한다.
 * 사전 매칭은 이름마다 150여 번의 부분문자열 검사라, 수만 건 데이터에서는
 * 캐시가 없으면 집계 한 번에 수천만 번 돌아 화면이 멈춘다.
 */
const functionalCache = new Map<string, boolean>()
const excipientCache = new Map<string, boolean>()
const CACHE_LIMIT = 200_000

function cached(cache: Map<string, boolean>, key: string, compute: () => boolean): boolean {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const value = compute()
  if (cache.size >= CACHE_LIMIT) cache.clear()
  cache.set(key, value)
  return value
}

/** 가장 길게 걸린 키워드의 길이. 0 이면 매칭 없음. */
function longestMatch(haystack: string, keywords: readonly string[]): number {
  let longest = 0
  for (const keyword of keywords) {
    if (keyword.length > longest && haystack.includes(keyword)) longest = keyword.length
  }
  return longest
}

/** 비타민/미네랄 표기 흔들림(비타민B1, 비타민 B-1, 비타민D3 …) 흡수용 */
const VITAMIN_RE = /^비타민\s*[a-k]?\s*-?\s*\d*$/i

/**
 * 원본 데이터가 직접 달아 주는 표식. 원재료명에 '(고시형)' 또는 '(개별인정형)'이
 * 붙어 있으면 그 자체가 기능성 원료라는 뜻이라, 사전보다 이쪽을 먼저 믿는다.
 * (실제 식약처 데이터의 76% 가 이 표식을 갖고 있다.)
 */
const APPROVAL_TAG_RE = /고시형|개별인정/

/**
 * 기능성 주원료인지.
 *
 * 두 사전이 동시에 걸리는 이름이 많아서(스테아린산마그네슘 = 부형제이면서 '마그네슘',
 * 난소화성말토덱스트린 = 기능성이면서 '말토덱스트린') **더 길게 걸린 쪽**을 따른다.
 * 둘 다 안 걸릴 때에 한해 원본이 붙여 준 (고시형)/(개별인정형) 표식을 믿는다 -
 * 표식만 우선하면 '스테아린산마그네슘(고시형)' 이 주원료로 올라온다.
 */
export function isFunctionalIngredient(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false

  return cached(functionalCache, trimmed, () => {
    const n = trimmed.toLowerCase()
    const excipient = longestMatch(n, EXCIPIENT_SET)
    const functional = Math.max(
      longestMatch(n, FUNCTIONAL_SET),
      VITAMIN_RE.test(trimmed) ? trimmed.length : 0,
    )
    if (functional > 0 || excipient > 0) return functional > excipient
    return APPROVAL_TAG_RE.test(trimmed)
  })
}

export function isExcipient(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  return cached(excipientCache, trimmed, () => {
    const n = trimmed.toLowerCase()
    return longestMatch(n, EXCIPIENT_SET) > longestMatch(n, FUNCTIONAL_SET)
  })
}
