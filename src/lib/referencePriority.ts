import { manufacturerGroup } from './manufacturerRank'
import type { Product } from './types'

/** 공식 판매 페이지 확인일. 판매량 순위나 개별 신고 품목의 현행 판매 인증은 아니다. */
export const REFERENCE_REVIEWED_AT = '2026-09-12'

type Family = {
  label: string
  source: string
  pattern: RegExp
  manufacturers: string[]
  featured: string[]
}

/**
 * 공식몰에 소개된 제품군과 대표 상품명. 제조원은 브랜드 소유사로 덮어쓰지 않는다.
 * featured는 판매명과 신고명이 일치하는 우선 후보이며 신고번호 대조를 의미하지 않는다.
 * 과거 파생품까지 현재 판매 중이라고 표시하지 않기 위해 외부 표시용 인증값은 만들지 않는다.
 */
export const REFERENCE_FAMILIES: Family[] = [
  {
    label: '락토핏', source: 'https://ckdhcmall.co.kr/prdExhibitView.do?idx=536&ord=ord&tabNo=0',
    pattern: /^(?:생유산균\s*)?락토핏(?:\s|골드|코어|생유산균|솔루션|플러스|$)/i,
    manufacturers: ['종근당건강', '종근당바이오', '알피바이오', '코스맥스엔비티', '메디오젠'],
    featured: ['락토핏 골드', '생유산균 락토핏 골드', '락토핏 코어', '락토핏 생유산균 코어', '락토핏 당케어', '락토핏 코어맥스'],
  },
  {
    label: '아임비타', source: 'https://ckdhcmall.co.kr/prdExhibitView.do?idx=536&ord=ord&tabNo=0',
    pattern: /^아임비타(?:\s|멀티비타민|리포좀)/i,
    manufacturers: ['네추럴웨이', '노바렉스'],
    featured: ['아임비타 멀티비타민 이뮨샷', '아임비타 멀티비타민 데일리', '아임비타 멀티비타민 올인원'],
  },
  {
    label: '프로메가', source: 'https://ckdhcmall.co.kr/prdExhibitView.do?idx=536&ord=ord&tabNo=0',
    pattern: /^(?:서흥\s*-\s*)?프로메가/i,
    manufacturers: ['서흥', '알피바이오', '종근당건강', '노바렉스', '코스맥스바이오'],
    featured: ['프로메가 오메가3 트리플', '프로메가 알티지 오메가3 듀얼', '프로메가 식물성 오메가3 듀얼'],
  },
  {
    label: '아이클리어', source: 'https://ckdhcmall.co.kr/prdExhibitView.do?idx=536&ord=ord&tabNo=0',
    pattern: /^아이클리어/i,
    manufacturers: ['종근당건강', '서흥', '알피바이오', '노바렉스', '한국씨엔에스팜'],
    featured: ['아이클리어 루테인지아잔틴', '아이클리어 루테인지아잔틴 아스타잔틴'],
  },
  {
    label: '하이뮨', source: 'https://himmune.co.kr/', pattern: /^하이뮨/i,
    manufacturers: ['일동후디스', '한미양행', '알피바이오', '코스맥스엔비티', '노바렉스', '서흥', '서흥헬스케어'],
    featured: ['하이뮨 프로틴 밸런스'],
  },
  {
    label: '지큐랩', source: 'https://www.ildongmall.co.kr/', pattern: /^지큐랩/i,
    manufacturers: ['일동바이오사이언스', '알피바이오', '노바렉스', '이앤에스', '한국바이오팜', '한국바이오팜에이치피'],
    featured: ['지큐랩 미오이노시톨 콜린&유산균 자두맛', '지큐랩 슬림 다이어트 & 유산균'],
  },
  {
    label: '정관장', source: 'https://www.kgcshop.co.kr/index',
    pattern: /^(?:정관장|홍삼정\s*에브리타임|에브리타임|홍이장군|화애락|굿베이스)/i,
    manufacturers: ['한국인삼공사'],
    featured: ['에브리타임 오리지널', '에브리타임 소프트', '홍삼정 에브리타임', '홍삼정 에브리타임 소프트'],
  },
  {
    label: '듀오락', source: 'https://www.duolac.co.kr/new/brand.do?menu=duolac', pattern: /^듀오락/i,
    manufacturers: ['쎌바이오텍'],
    featured: ['듀오락 골드', '듀오락 골드 캡슐', '듀오락 골드 하루 한 포', '듀오락 얌얌플러스'],
  },
  {
    label: '엘레나', source: 'https://www.yuhanshop.co.kr/goods/goods_list.php?brandCd=023&sort=sellcnt', pattern: /^엘레나(?:\s|$)/i,
    manufacturers: ['빅솔', '코스맥스엔비티'], featured: ['엘레나'],
  },
  {
    label: '여에스더 오메가3·콘드로이친', source: 'https://m.esthermall.co.kr/main/index', pattern: /^여에스더\s*(?:초임계\s*알티지\s*오메가3|포사인\s*콘드로이친)/i,
    manufacturers: ['노바렉스', '코스맥스바이오', '코스맥스엔비티', '콜마비앤에이치', '서흥', '서흥헬스케어', '알피바이오', '한미양행', '한국씨엔에스팜', '네추럴웨이', '유유헬스케어'],
    featured: ['여에스더 초임계 알티지 오메가3', '여에스더 포사인 콘드로이친 1200'],
  },
  {
    label: '일양 데일리픽', source: 'https://ilyangmall.com/', pattern: /^데일리픽\s*(?:쏘팔메토|비타민|밀크씨슬|루테인)/i,
    manufacturers: ['비오팜', '에스엘에스', '뉴트리플래닛', '이앤에스'],
    featured: ['데일리픽 쏘팔메토 케어', '데일리픽 비타민 D 3000IU 케어', '데일리픽 비타민C 1000 케어', '데일리픽 비타민B 플렉스 케어', '데일리픽 밀크씨슬 케어', '데일리픽 루테인&오메가 케어'],
  },
  {
    label: '일양 직영 대표 상품', source: 'https://ilyangmall.com/',
    pattern: /^(?:프리미엄\s*비타C|액티칼블루칼슘마그네슘|6년근\s*데일리\s*홍삼정|초임계\s*rTG\s*오메가3\s*900)$/i,
    manufacturers: ['일양약품', '비오팜'],
    featured: ['프리미엄 비타C', '액티칼블루칼슘마그네슘', '6년근 데일리 홍삼정', '초임계 rTG 오메가3 900'],
  },
  {
    label: '한미 혈당콜레스테롤 케어', source: 'https://hanmimall.co/category/한미양행/26',
    pattern: /^한미\s*혈당콜레스테롤\s*케어$/i, manufacturers: ['한미양행'],
    featured: ['한미 혈당콜레스테롤 케어'],
  },
]

function nameKey(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

const families = REFERENCE_FAMILIES.map((family) => ({
  ...family,
  names: new Set(family.featured.map(nameKey)),
  groups: new Set(family.manufacturers),
}))

export function isExportReference(name: string): boolean {
  return /수\s*출|\bexport\b/i.test(name.normalize('NFKC'))
}

/** 0: 대표 판매명 일치, 1: 공식몰 제품군, 2: 확인한 제품군 밖. */
export function referenceProductMatch(product: Product): { family: string; priority: number } | null {
  if (isExportReference(product.name)) return null
  const name = product.name.normalize('NFKC').trim()
  const group = manufacturerGroup(product.manufacturer)
  for (const family of families) {
    if (!family.groups.has(group) || !family.pattern.test(name)) continue
    return { family: family.label, priority: family.names.has(nameKey(name)) ? 0 : 1 }
  }
  return null
}

export function referenceProductPriority(product: Product): number {
  return referenceProductMatch(product)?.priority ?? 2
}
