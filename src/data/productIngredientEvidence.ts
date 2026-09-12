import type { ProductIngredientEvidence } from '../lib/ingredientProvenance'

/**
 * Manually reviewed official product statements. The report number, full product name and
 * manufacturer were cross-checked against C003; export variants and similar names are excluded.
 * Only explicitly identified vitamin ingredients are covered by the "100% vitamins" statement.
 * It does not cover minerals, excipients or unidentified premixes. Europe is not a country.
 * Add new evidence only after checking the exact product and ingredient scope; never infer it
 * from the finished-product country, the brand or an ingredient supplier's generic catalogue.
 */
export const PRODUCT_INGREDIENT_EVIDENCE: ProductIngredientEvidence[] = [
  {
    id: 'eundan-c1000-vitamin-component-20260912',
    productName: '고려은단비타민C1000',
    reportNo: '202100108172',
    manufacturer: '고려은단(주)',
    ingredients: ['비타민C혼합제제'],
    supplier: 'DSM', country: '영국', region: '',
    scope: '혼합제제 중 비타민C 성분 기준',
    sourceTitle: '고려은단 · 비타민C 1000 공식 제품 설명',
    sourceUrl: 'https://eundan.com/bbs_detail.php?bbs_num=463&id=&menu_number=503&number=&pg=1&tb=board_goods_introduce',
    statement: '공식 제품 설명에서 비타민C 원료를 영국산·DSM으로 안내하며 Ascorbic Acid 97% 원료 기준임을 명시합니다. 혼합제제의 나머지 성분과 부원료의 원료사·원산지는 확인하지 못했습니다.',
    checkedAt: '2026-09-12',
  },
  {
    id: 'ckd-immune-shot-vitamins-20260912',
    productName: '아임비타 멀티비타민 이뮨샷',
    reportNo: '20190004553319',
    manufacturer: '주식회사 네추럴웨이 포천 제2공장',
    ingredients: ['비타민C', '비타민B1염산염', '비타민B2', '비타민B6염산염', '비오틴', '판토텐산칼슘'],
    supplier: 'DSM', country: '', region: '유럽',
    sourceTitle: '종근당건강 · 아임비타 멀티비타민 이뮨샷',
    sourceUrl: 'https://www.ckdhc.com/product/productView.do?prodCode=CHC0000198',
    statement: '공식 제품 페이지에서 비타민 원료를 100% DSM·유럽산으로 안내합니다. 개별 국가는 명시하지 않습니다. 미네랄·부원료에는 적용하지 않습니다.',
    checkedAt: '2026-09-12',
  },
  {
    id: 'ckd-liposomal-c-20260912',
    productName: '아임비타 리포좀 비타민C',
    reportNo: '200400200082822',
    manufacturer: '주식회사 노바렉스',
    ingredients: ['비타민C'],
    supplier: '', country: '', region: '유럽',
    sourceTitle: '종근당건강 · 아임비타 리포좀 비타민C',
    sourceUrl: 'https://www.ckdhc.com/product/productView.do?prodCode=CHC0000243',
    statement: '공식 제품 페이지에서 유럽산 비타민으로 안내합니다. 원료사와 개별 국가는 명시하지 않습니다.',
    checkedAt: '2026-09-12',
  },
]
