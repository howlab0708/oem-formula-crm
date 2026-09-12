/**
 * 제조원 표기 교정과 메이저 제조사 등급.
 *
 * 원본(식약처 품목제조보고)의 업소명은 공장 단위로 보고된다. 공장은 실제로
 * 서로 다른 제조소이므로 절대 합치지 않는다 - `(주)노바렉스`와
 * `(주)노바렉스 2공장`은 끝까지 별개 항목이다. 여기서 하는 일은 두 가지뿐이다.
 *
 *  1) 표기 교정: 같은 법인이 두 가지로 적힌 경우와 괄호·띄어쓰기가 깨진 경우만
 *     바로잡는다. 이미 일관되게 쓰인 표기는 그대로 둔다(예: `주식회사 노바렉스`는
 *     실제 등기 상호가 "주식회사 노바렉스"라 손대지 않는다).
 *  2) 등급: 대표 제품군을 먼저 배치한 뒤 나머지 제품에 적용할 보조 순위.
 *     같은 모기업의 공장은 등급만 공유하며, 각 제조소의 이름과 제품은 유지한다.
 */

/** 비교용 키. 법인격·공백·대소문자를 지운 알맹이만 남긴다. */
function compact(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\(주\)|㈜|주식회사|유한회사|농업회사법인|영농조합법인/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/**
 * 공장·지점 표기를 떼고 법인명만 남긴다. 등급을 모기업 단위로 공유하기 위함.
 *
 * `(주)서흥 오송2공장` `주식회사 네추럴웨이 포천 제2공장` 처럼 지역명이 앞에 붙는
 * 형태까지 한 번에 잘라야 해서 지역명 자리를 함께 매칭하는데, 그러면
 * `주식회사 노바렉스2공장`의 `노바렉스`나 `(주)쎌바이오텍 1공장, 2공장`의
 * `쎌바이오텍`처럼 법인명 자체를 지역명으로 오인해 먹어버린다. 그래서 결과에
 * 알맹이가 남았는지 확인하고, 다 먹었으면 공장·지점 낱말만 떼는 쪽으로 물러선다.
 */
function withoutSite(value: string): string {
  const trimmed = value.replace(/\s*기업부설연구소.*$/, '').trim()
  const stripped = trimmed.replace(/\s*(?:[가-힣A-Za-z]+\s*)?제?\s*\d*\s*(?:공장|지점)\s*\d*.*$/, '').trim()
  if (compact(stripped)) return stripped

  // 법인명까지 먹은 경우: 공장·지점 낱말과 그 앞에 붙은 번호만 떼어낸다.
  const conservative = trimmed
    .replace(/\s*(?:공장|지점)\s*\d*.*$/, '')
    .replace(/\s*제?\s*\d+$/, '')
    .trim()
  return compact(conservative) ? conservative : trimmed
}

/**
 * 공식 상호를 확인한 법인의 표기만 교정한다.
 * 키는 `compact()` 결과(법인격을 뗀 알맹이), 값은 법인격 표기다.
 * 교정 후 다른 원본 제조소와 충돌하면 prepareReferences에서 원문을 보존한다.
 */
const CORPORATE_FORMS: Record<string, string> = {
  // 금융감독원 기업정보: https://englishdart.fss.or.kr/dsbc001/selectPopup.ax?selectKey=00565710
  한미양행: '(주)한미양행',
  // 공식몰 하단 상호: https://ckdhcmall.co.kr/memberLogin.do
  종근당건강: '종근당건강(주)',
  // 공식 회사 소개 하단: https://foodishome.cafe24.com/brand/hi.html
  일동후디스: '일동후디스(주)',
  // 유사 상호만으로 고친 신비바이오·고려은단헬스케어·뉴트라젠·다원바이오·다정은
  // 원본의 업소 인허가번호가 서로 달라 통합하지 않는다. 미확인 법인명도 원문을 유지한다.
}

/**
 * 표기를 다듬는다. 법인명은 바꾸지 않고, 깨진 괄호와 붙은 띄어쓰기만 바로잡는다.
 * 공장·지점 표기는 그대로 살린다.
 */
function tidy(raw: string): string {
  let value = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  // `주)팜크로스` → `(주)팜크로스`
  value = value.replace(/^주\)/, '(주)')
  // `(주) 에치와이` → `(주)에치와이` (앞에 붙는 법인격 뒤 공백 제거)
  value = value.replace(/^\(주\)\s+/, '(주)')
  // `주식회사한미양행` → `주식회사 한미양행`
  value = value.replace(/^(주식회사|농업회사법인|영농조합법인)(?=[가-힣A-Za-z])/, '$1 ')
  // `콜마비앤에이치(주)음성공장` → `콜마비앤에이치(주) 음성공장` (뒤에 붙는 법인격)
  value = value.replace(/([가-힣A-Za-z])\(주\)(?=[가-힣A-Za-z0-9])/g, '$1(주) ')
  // 공장 이름 자체(`오송2공장` `문산제2공장`)는 원본 표기가 맞으므로 건드리지 않는다.
  // 법인명에 바로 붙은 `노바렉스2공장`만 아래 canonicalManufacturer 에서 띄운다.
  return value.replace(/\s+/g, ' ').trim()
}

const canonicalCache = new Map<string, string>()

/**
 * 화면·필터·내보내기에서 쓸 제조원 이름.
 * 공장 구분은 유지한 채 법인격 표기만 통일한다.
 */
export function canonicalManufacturer(raw: string): string {
  const known = canonicalCache.get(raw)
  if (known !== undefined) return known

  const tidied = tidy(raw)
  const site = withoutSite(tidied)
  const rest = tidied.slice(site.length)
  const suffix = rest.trim()
  const base = CORPORATE_FORMS[compact(site)] ?? site
  // 공장·지점 표기는 원문 그대로 둔다. 띄어쓰기를 새로 넣는 건 법인명에 번호가
  // 바로 붙은 `주식회사 노바렉스2공장` 한 가지뿐이다 - 원래 붙여 쓰는 이름
  // (`경북과학대학식품공장`)까지 쪼개면 없던 이름을 만들어 내게 된다.
  const separator = rest.startsWith(' ') || /^\d/.test(suffix) ? ' ' : ''
  const result = suffix ? `${base}${separator}${suffix}` : base

  if (canonicalCache.size >= 50_000) canonicalCache.clear()
  canonicalCache.set(raw, result)
  return result
}

/** 등급을 공유할 모기업 키. 공장이 달라도 같은 값이 나온다. */
export function manufacturerGroup(raw: string): string {
  return compact(withoutSite(canonicalManufacturer(raw)))
}

/**
 * 1등급 - 소비자가 이름을 아는 제조사.
 * 제약·식품 대기업 계열과 건기식 ODM 상위 기업을 함께 둔다. 규모가 아니라
 * "영업 자리에서 꺼냈을 때 상대가 아는 이름인가"가 기준이라 사람이 고른 목록이다.
 * 2등급은 하드코딩하지 않고 제조 건수 상위에서 자동으로 뽑는다.
 */
const TIER_ONE = [
  // 건기식 ODM 상위 - 콜마비앤에이치·코스맥스·노바렉스·서흥
  '콜마비앤에이치', '코스맥스바이오', '코스맥스엔비티', '노바렉스', '서흥', '서흥헬스케어',
  // 홍삼
  '한국인삼공사', '케이지씨예본',
  // 제약사 계열
  '종근당건강', '종근당바이오', '일동바이오사이언스', '일동후디스', '일양약품',
  '대웅제약', '대웅생명과학', '알피바이오', '광동제약', '광동헬스바이오',
  '휴온스엔', '유유헬스케어', '씨티씨바이오', '조아제약', '동국제약', '한국콜마',
  // 식품·생활 대기업 계열
  '아모레퍼시픽', '풀무원건강생활', '풀무원다논', '씨제이웰케어', '씨제이제일제당',
  '동원에프앤비', '대상', '대상웰라이프', '매일유업', '남양유업', '에치와이',
  '현대바이오랜드', '삼양사', '일화', '농심태경', '오리온제주용암수',
  // 자체 브랜드 인지도가 높은 건기식 전문기업
  '쎌바이오텍', '고려은단헬스케어', '에이치엘사이언스', '프롬바이오', '뉴트리',
  '김정문알로에', '한국야쿠르트', '한미양행',
].map(compact)

// 인지도와 OEM 실무 활용도를 반영한 편집 순서. 판매량 순위가 아니다.
// 한미양행은 한미약품과 별개의 건기식 제조사로 분류한다.
const MAJOR_ORDER = [
  '종근당건강', '일동바이오사이언스', '일동후디스', '한국인삼공사',
  '일양약품', '한미양행', '고려은단헬스케어', '종근당바이오',
  '노바렉스', '콜마비앤에이치', '코스맥스바이오', '코스맥스엔비티',
  '서흥', '서흥헬스케어', '알피바이오', '쎌바이오텍',
]

export function manufacturerPriority(group: string): number {
  const index = MAJOR_ORDER.indexOf(group)
  return index < 0 ? MAJOR_ORDER.length : index
}

const TIER_ONE_SET = new Set(TIER_ONE)

/** 2등급으로 볼 제조소 개수. 1등급을 뺀 제조 건수 상위 이만큼이 여기 들어간다. */
export const TIER_TWO_SIZE = 60

export const TIER = { MAJOR: 0, LARGE: 1, OTHER: 2 } as const

/**
 * 제조소별 등급표를 만든다.
 * 1등급은 고른 목록, 2등급은 이 데이터셋에서 제조 건수가 많은 순으로 채운다.
 * 데이터가 바뀌면 2등급도 따라 바뀌므로 따로 손볼 필요가 없다.
 */
export function buildManufacturerTiers(counts: Map<string, number>): Map<string, number> {
  const tiers = new Map<string, number>()
  const rest: Array<{ name: string; count: number }> = []

  for (const [name, count] of counts) {
    if (TIER_ONE_SET.has(manufacturerGroup(name))) tiers.set(name, TIER.MAJOR)
    else rest.push({ name, count })
  }

  rest.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  rest.forEach(({ name }, index) => {
    tiers.set(name, index < TIER_TWO_SIZE ? TIER.LARGE : TIER.OTHER)
  })

  return tiers
}
