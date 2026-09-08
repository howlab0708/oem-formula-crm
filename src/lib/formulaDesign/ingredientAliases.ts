/**
 * 원료명 → 건강기능식품 공전 원료 연결.
 *
 * 배합비에 적는 원료명은 공전 이름과 거의 항상 다르다. 실제 품목제조보고
 * 45,970건의 주원료 표기를 세어 보면 네 가지 이유로 갈린다.
 *
 *   1) 꼬리표          `엽산(고시형)`            → 괄호 꼬리표를 걷어낸다
 *   2) 카탈로그 동의어  `셀레늄(셀렌)`            → 공전 이름 자체가 동의어를 품는다
 *   3) 부가 설명 괄호  `밀크씨슬(카르두스 마리아누스) 추출물`
 *   4) 원료 형태       `산화아연`, `비타민B1염산염`, `비타민c혼합제제`
 *
 * 4번이 이 파일의 핵심이다. `rda.ts` 는 같은 문제를 다루면서도 무기질의 염 표기를
 * 일부러 합치지 않는다 - 거기서는 표시 함량을 권장섭취량과 비교하므로, 값이 염 전체
 * 중량인지 원소 중량인지 가릴 수 없으면 비교 자체가 틀리기 때문이다.
 *
 * 여기서는 목적이 다르다. 이 연결은 "이 줄이 고객용 구성 및 포장지 표에 들어가는
 * 기능성 원료인가, 그리고 기준 성분·일일섭취기준·기능성 문구는 무엇인가" 만 정한다.
 * 함량은 연구원이 표시량 칸에 직접 넣는다(염·혼합제제는 역가가 달라 투입량으로
 * 계산할 수 없다). 그래서 산화아연을 아연으로 연결해도 숫자가 틀어지지 않는다.
 *
 * 부분일치를 쓰지 않고 이름을 하나씩 적은 이유: `카복시메틸셀룰로스칼슘`(CMC-Ca)은
 * 부형제인데 이름에 칼슘이 들어 있다. 실제 데이터에 225건 있다. 부분일치로 잡으면
 * 고객 문서에 칼슘 기능성 원료로 올라간다.
 */

import { rdaKey } from '../rda'

/**
 * 원료 형태 → 공전 기준 성분.
 *
 * 실제 품목제조보고에서 등장 빈도가 높은 순으로 확인해 담았다(괄호 꼬리표를 뗀 이름).
 * 여기 없는 형태는 연결되지 않고, 연구원이 기능성 표시를 직접 켜면 된다 -
 * 잘못 연결해 고객 문서에 없는 기능성을 올리는 쪽이 더 나쁘다.
 */
const SOURCE_FORM_TABLE: Record<string, string> = {
  // ── 무기질 ─────────────────────────────────────────────
  산화아연: '아연',
  글루콘산아연: '아연',
  황산아연: '아연',
  '건조효모(아연함유)': '아연',
  산화마그네슘: '마그네슘',
  글루콘산마그네슘: '마그네슘',
  염화마그네슘: '마그네슘',
  탄산마그네슘: '마그네슘',
  황산마그네슘: '마그네슘',
  해조칼슘: '칼슘',
  탄산칼슘: '칼슘',
  젖산칼슘: '칼슘',
  유청칼슘: '칼슘',
  인산칼슘: '칼슘',
  구연산칼슘: '칼슘',
  글루콘산칼슘: '칼슘',
  아셀렌산나트륨: '셀레늄',
  셀렌효모: '셀레늄',
  '건조효모(셀렌함유)': '셀레늄',
  황산망간: '망간',
  글루콘산망간: '망간',
  염화망간: '망간',
  푸마르산제일철: '철',
  황산제일철: '철',
  글루콘산제일철: '철',
  피로인산철: '철',
  구연산철: '철',
  헴철: '철',
  글루콘산구리: '구리',
  황산구리: '구리',
  // 품목제조보고에는 구리를 한자 이름(동)으로 적은 원료가 많다.
  글루콘산동: '구리',
  황산동: '구리',
  요오드칼륨: '요오드',
  요오드화칼륨: '요오드',
  '건조효모(크롬함유)': '크롬',
  염화크롬: '크롬',
  피콜린산크롬: '크롬',

  // ── 비타민 ─────────────────────────────────────────────
  // rda.ts 의 동족체 별칭(티아민·리보플라빈·피리독신 등)은 rdaKey 로 처리한다.
  // 여기에는 그 별칭표에 없는 염·에스터 형태만 적는다.
  비타민b1염산염: '비타민 B1',
  비타민b1질산염: '비타민 B1',
  티아민염산염: '비타민 B1',
  티아민질산염: '비타민 B1',
  리보플라빈부티레이트: '비타민 B2',
  '리보플라빈5인산나트륨': '비타민 B2',
  비타민b6염산염: '비타민 B6',
  피리독신염산염: '비타민 B6',
  판토텐산나트륨: '판토텐산',
  메틸테트라히드로엽산글루코사민: '엽산',
  '건조효모(비타민d)': '비타민 D',
  '디엘-알파-토코페릴아세테이트': '비타민 E',
  '디-알파-토코페릴아세테이트': '비타민 E',
  '디-알파-토코페릴succinate': '비타민 E',
  혼합토코페롤: '비타민 E',
  아스코르빈산나트륨: '비타민 C',
  아스코르빈산칼슘: '비타민 C',
  레티닐팔미테이트: '비타민 A',
  아세트산레티놀: '비타민 A',
  'D-알파-토코페롤': '비타민 E',
  'DL-알파-토코페롤': '비타민 E',
  'D-알파-토코페릴아세테이트': '비타민 E',

  // ── 고시형 원료의 제조 형태 ─────────────────────────────
  // 공전이 이 형태를 그 원료로 인정한다. 이름만 다르고 같은 원료다.
  홍삼농축액: '홍삼',
  홍삼분말: '홍삼',
  인삼농축액: '인삼',
  인삼분말: '인삼',
  정제어유: 'EPA 및 DHA 함유 유지',
  엠에스엠: 'MSM',
  식이유황: 'MSM',
  옥타코사놀: '옥타코사놀 함유 유지',
  감마리놀렌산: '감마리놀렌산 함유 유지',
  달맞이꽃종자유: '감마리놀렌산 함유 유지',
  유산균: '프로바이오틱스',
}

/**
 * 표의 열쇠를 검색 표기로 정규화해 둔다.
 * 괄호·하이픈이 든 이름(`건조효모(셀렌함유)`, `D-알파-토코페롤`)을 그대로 열쇠로 쓰면
 * 정규화된 이름과 대조되지 않아 조용히 빠진다.
 */
const SOURCE_FORMS = new Map<string, string>(
  Object.entries(SOURCE_FORM_TABLE).map(([form, basis]) => [nameKey(form), basis]),
)

/**
 * 프로바이오틱스 균주는 학명으로 적힌다(`Lactobacillus acidophilus`).
 * 속(genus)만 보면 되므로 공전이 인정하는 속을 적어 두고 첫 낱말로 가린다.
 * 종명까지 맞출 필요는 없다 - 어느 균주든 기준 성분은 프로바이오틱스(균수)다.
 */
const PROBIOTIC_GENERA = new Set([
  'lactobacillus', 'lactiplantibacillus', 'lacticaseibacillus', 'limosilactobacillus',
  'ligilactobacillus', 'lactococcus', 'leuconostoc', 'weissella', 'pediococcus',
  'bifidobacterium', 'streptococcus', 'enterococcus', 'bacillus', 'saccharomyces',
])

/**
 * 제제·희석·분체 표기. 떼어내면 원료 이름만 남는다.
 *   비타민c혼합제제 → 비타민 C · 녹차추출물분말 → 녹차추출물 · 유산균혼합분말 → 유산균
 * 떼어낸 꼴은 "후보" 로만 쓴다. 공전에 없으면 그냥 버려지므로,
 * 미역줄기분말 → 미역줄기 처럼 원료가 아닌 이름이 잘못 연결될 일은 없다.
 */
const PREPARATION_SUFFIX = /(?:혼합제제|혼합분말|혼합제|혼합물|분말|과립)$/

/** 광학이성질체 접두사. `L-테아닌` → 테아닌. 이것도 후보로만 쓴다. */
const STEREO_PREFIX = /^(?:dl|엘|디엘|l|d)(?=[가-힣])/

/** 원료 종류 꼬리표. 품목제조보고 원료명에 그대로 붙어 온다. */
const CATEGORY_TAG = /\((?:고시형|개별인정형|기타)\)/g

/**
 * 검색·연결용 이름 정규화. 기능성 원료 조회 화면과 같은 규칙에
 * 마침표를 더했다 - 공전의 `뮤코다당·단백` 이 품목제조보고에는 `뮤코다당.단백` 으로 온다.
 */
export function nameKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·･ㆍ.+()®™Ⓡ_‐‑–—-]/g, '')
}

/**
 * 한 원료명에서 나올 수 있는 연결 후보 열쇠를 앞에서부터 순서대로 만든다.
 * 앞쪽이 더 정확한 후보다 - 호출한 쪽에서 먼저 맞는 것을 쓴다.
 */
export function aliasCandidates(raw: string): string[] {
  const text = raw.normalize('NFKC').trim()
  if (!text) return []

  const withoutTag = text.replace(CATEGORY_TAG, ' ').replace(/\s+/g, ' ').trim()
  // 부가 설명 괄호를 뗀 꼴. `밀크씨슬(카르두스 마리아누스) 추출물` → `밀크씨슬 추출물`
  const withoutParens = withoutTag.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

  const seeds = [text, withoutTag, withoutParens]
  const out: string[] = []
  const push = (value: string) => {
    if (!value) return
    if (!out.includes(value)) out.push(value)
  }

  // 학명으로 적힌 균주는 속만 보고 프로바이오틱스로 연결한다.
  const genus = withoutTag.split(/[\s.]+/)[0]?.toLowerCase() ?? ''
  if (PROBIOTIC_GENERA.has(genus)) push(nameKey('프로바이오틱스'))

  for (const seed of seeds) {
    const key = nameKey(seed)
    // 제제·분체 표기와 광학이성질체 접두사를 뗀 꼴까지 후보로 만든다.
    // `홍삼농축액분말` 처럼 두 겹인 이름이 있어 두 번 벗긴다.
    const trimmed = [key]
    for (let i = 0; i < 2; i += 1) {
      const last = trimmed[trimmed.length - 1]
      const next = last.replace(PREPARATION_SUFFIX, '').replace(STEREO_PREFIX, '')
      if (next === last || !next) break
      trimmed.push(next)
    }
    for (const candidate of trimmed) {
      push(candidate)
      // 원료 형태 표(산화아연 → 아연, 아셀렌산나트륨혼합제제 → 아셀렌산나트륨 → 셀레늄)
      const mapped = SOURCE_FORMS.get(candidate)
      if (mapped) push(nameKey(mapped))
      // rda.ts 의 동족체 별칭(티아민 → 비타민b1, 니코틴산아미드 → 나이아신 등)
      const resolved = rdaKey(candidate)
      if (resolved) push(resolved)
    }
  }
  return out
}

/** 이 이름이 원료 형태 표에 있는지. 화면에서 연결 근거를 보여줄 때 쓴다. */
export function sourceFormOf(raw: string): string | null {
  const key = nameKey(raw.replace(CATEGORY_TAG, ''))
  return SOURCE_FORMS.get(key) ?? SOURCE_FORMS.get(key.replace(PREPARATION_SUFFIX, '')) ?? null
}
