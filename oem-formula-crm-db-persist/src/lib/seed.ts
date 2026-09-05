/**
 * 기본 레퍼런스 데이터.
 *
 * CSV 를 붙이기 전에도 대시보드가 의미 있는 숫자를 보여줘야 상담 리허설이 된다.
 * 국내 건기식 시장에서 실제로 흔한 배합 패턴(카테고리별 제형 편중, 부원료 조합)을
 * 반영한 예시 42건이며, CSV 업로드 시 전량 교체된다.
 */

import { normalizeForm, parseMarkers, parseWeightMg } from './normalize'
import type { Product } from './types'

type SeedRow = {
  name: string
  manufacturer: string
  form: string
  weight: string
  main: string[]
  detail: string
  sub: string[]
}

const SEED_ROWS: SeedRow[] = [
  // 간 건강 - 밀크씨슬
  {
    name: '간편한 밀크씨슬 B플러스',
    manufacturer: '서흥',
    form: '정제',
    weight: '800mg',
    main: ['밀크씨슬추출물', '비타민B1', '아연'],
    detail: '실리마린 130mg, 비타민B1 1.2mg, 아연 8.5mg',
    sub: ['타우린', '헛개나무열매추출분말', '울금추출물', '결정셀룰로오스', '스테아린산마그네슘'],
  },
  {
    name: '실리마린 파워 연질캡슐',
    manufacturer: '알피바이오',
    form: '연질캡슐',
    weight: '1,000mg',
    main: ['밀크씨슬추출물', '비타민E'],
    detail: '실리마린 130mg, 비타민E 11mg',
    sub: ['대두유', '밀납', '레시틴', '헛개나무열매추출분말'],
  },
  {
    name: '데일리 리버케어 밀크씨슬',
    manufacturer: '코스맥스엔비티',
    form: '정제',
    weight: '750mg',
    main: ['밀크씨슬추출물', '비타민B2'],
    detail: '실리마린 130mg, 비타민B2 1.4mg',
    sub: ['헛개나무열매추출분말', '타우린', '아티초크추출물', '결정셀룰로오스'],
  },
  {
    name: '헛개 밀크씨슬 부스터',
    manufacturer: '노바렉스',
    form: '정제',
    weight: '900mg',
    main: ['밀크씨슬추출물', '아연'],
    detail: '실리마린 140mg, 아연 8.5mg',
    sub: ['헛개나무열매추출분말', '울금추출물', '타우린', '이산화규소'],
  },
  {
    name: '프리미엄 간건강 소프트젤',
    manufacturer: '서흥',
    form: '연질캡슐',
    weight: '1,100mg',
    main: ['밀크씨슬추출물', '비타민B6'],
    detail: '실리마린 150mg, 비타민B6 1.5mg',
    sub: ['대두유', '레시틴', '아티초크추출물', '밀납'],
  },

  // 눈 건강 - 루테인
  {
    name: '루테인 지아잔틴 아이케어',
    manufacturer: '코스맥스엔비티',
    form: '연질캡슐',
    weight: '500mg',
    main: ['루테인', '지아잔틴', '비타민A'],
    detail: '루테인 20mg, 지아잔틴 4mg, 비타민A 350㎍',
    sub: ['홍화씨유', '빌베리추출물', '아스타잔틴', '밀납'],
  },
  {
    name: '눈편한 루테인 오메가',
    manufacturer: '알피바이오',
    form: '연질캡슐',
    weight: '1,000mg',
    main: ['루테인', '오메가3'],
    detail: '루테인 20mg, EPA와DHA의합 600mg',
    sub: ['정제어유', '빌베리추출물', '비타민E혼합제제', '젤라틴'],
  },
  {
    name: '멀티 아이 루테인 플러스',
    manufacturer: '노바렉스',
    form: '연질캡슐',
    weight: '600mg',
    main: ['루테인', '지아잔틴'],
    detail: '루테인 20mg, 지아잔틴 2mg',
    sub: ['빌베리추출물', '아스타잔틴', '홍화씨유'],
  },
  {
    name: '비전케어 루테인 정',
    manufacturer: '콜마비앤에이치',
    form: '정제',
    weight: '850mg',
    main: ['루테인', '아연'],
    detail: '루테인 20mg, 아연 8.5mg',
    sub: ['빌베리추출물', '결정셀룰로오스', '스테아린산마그네슘'],
  },

  // 장 건강 - 프로바이오틱스
  {
    name: '장건강 프로바이오틱스 아연',
    manufacturer: '콜마비앤에이치',
    form: '분말',
    weight: '2,000mg',
    main: ['프로바이오틱스', '아연'],
    detail: '프로바이오틱스 100억CFU, 아연 8.5mg',
    sub: ['프락토올리고당', '치커리뿌리추출물', '요구르트향분말', '난소화성말토덱스트린'],
  },
  {
    name: '이너프로 유산균 스틱',
    manufacturer: '일동바이오사이언스',
    form: '분말',
    weight: '2,500mg',
    main: ['프로바이오틱스'],
    detail: '프로바이오틱스 500억CFU',
    sub: ['프락토올리고당', '아연효모', '난소화성말토덱스트린', '레몬향분말'],
  },
  {
    name: '슬림바이오틱스 캡슐',
    manufacturer: '노바렉스',
    form: '경질캡슐',
    weight: '500mg',
    main: ['프로바이오틱스', '비타민D'],
    detail: '프로바이오틱스 100억CFU, 비타민D 10㎍',
    sub: ['프락토올리고당', '차전자피분말', 'HPMC'],
  },
  {
    name: '19종 복합유산균 파우더',
    manufacturer: '코스맥스엔비티',
    form: '분말',
    weight: '2,000mg',
    main: ['프로바이오틱스'],
    detail: '프로바이오틱스 200억CFU',
    sub: ['프락토올리고당', '치커리뿌리추출물', '갈락토올리고당', '난소화성말토덱스트린'],
  },
  {
    name: '키즈 장튼튼 유산균',
    manufacturer: '종근당바이오',
    form: '분말',
    weight: '1,500mg',
    main: ['프로바이오틱스', '아연'],
    detail: '프로바이오틱스 50억CFU, 아연 4mg',
    sub: ['프락토올리고당', '딸기농축분말', '요구르트향분말'],
  },

  // 혈행 - 오메가3
  {
    name: 'rTG 오메가3 1200',
    manufacturer: '알피바이오',
    form: '연질캡슐',
    weight: '1,200mg',
    main: ['오메가3', '비타민E'],
    detail: 'EPA와DHA의합 900mg, 비타민E 11mg',
    sub: ['정제어유', '레몬오일', '로즈마리추출물', '젤라틴'],
  },
  {
    name: '알티지 오메가3 코엔자임',
    manufacturer: '서흥',
    form: '연질캡슐',
    weight: '1,300mg',
    main: ['오메가3', '코엔자임Q10'],
    detail: 'EPA와DHA의합 1,000mg, 코엔자임Q10 100mg',
    sub: ['정제어유', '레몬오일', '비타민E혼합제제', '밀납'],
  },
  {
    name: '식물성 오메가3 알지유',
    manufacturer: '노바렉스',
    form: '연질캡슐',
    weight: '1,000mg',
    main: ['오메가3'],
    detail: 'EPA와DHA의합 600mg',
    sub: ['미세조류유', '로즈마리추출물', '비타민E혼합제제'],
  },
  {
    name: '혈행케어 오메가3 폴리코사놀',
    manufacturer: '콜마비앤에이치',
    form: '연질캡슐',
    weight: '1,250mg',
    main: ['오메가3', '폴리코사놀'],
    detail: 'EPA와DHA의합 800mg, 폴리코사놀 20mg',
    sub: ['정제어유', '레몬오일', '비타민E혼합제제'],
  },

  // 스트레스/수면
  {
    name: '스트레스 케어 테아닌 릴렉스',
    manufacturer: '코스맥스엔비티',
    form: '경질캡슐',
    weight: '500mg',
    main: ['테아닌', '홍경천추출물'],
    detail: 'L-테아닌 200mg, 로사빈 4.2mg',
    sub: ['마그네슘', '캐모마일추출분말', '타르트체리분말', 'HPMC'],
  },
  {
    name: '굿슬립 테아닌 정',
    manufacturer: '노바렉스',
    form: '정제',
    weight: '700mg',
    main: ['테아닌', '마그네슘'],
    detail: 'L-테아닌 200mg, 마그네슘 315mg',
    sub: ['타르트체리분말', '캐모마일추출분말', '결정셀룰로오스'],
  },
  {
    name: '릴렉스 락티움 캡슐',
    manufacturer: '서흥',
    form: '경질캡슐',
    weight: '450mg',
    main: ['유단백가수분해물', '테아닌'],
    detail: '유단백가수분해물 300mg, L-테아닌 150mg',
    sub: ['캐모마일추출분말', '타르트체리분말', 'HPMC'],
  },
  {
    name: '마인드케어 홍경천 스틱',
    manufacturer: '뉴트리',
    form: '과립',
    weight: '2,000mg',
    main: ['홍경천추출물', '비타민B6'],
    detail: '로사빈 4.5mg, 비타민B6 1.5mg',
    sub: ['자일리톨', '레몬밤추출분말', '난소화성말토덱스트린'],
  },

  // 피부 - 콜라겐
  {
    name: '저분자 콜라겐 펩타이드 스틱',
    manufacturer: '뉴트리',
    form: '분말',
    weight: '3,000mg',
    main: ['콜라겐', '비타민C'],
    detail: '저분자콜라겐펩타이드 1,500mg, 비타민C 100mg',
    sub: ['히알루론산', '엘라스틴', '석류농축분말', '자일리톨'],
  },
  {
    name: '이너뷰티 콜라겐 젤리',
    manufacturer: '웰빙엘에스',
    form: '젤리',
    weight: '20g',
    main: ['콜라겐', '비타민C'],
    detail: '저분자콜라겐펩타이드 1,000mg, 비타민C 100mg',
    sub: ['히알루론산', '석류농축액', '펙틴', '에리스리톨'],
  },
  {
    name: '피부보습 히알루론산 정',
    manufacturer: '콜마비앤에이치',
    form: '정제',
    weight: '600mg',
    main: ['히알루론산', '비타민C'],
    detail: '히알루론산 120mg, 비타민C 100mg',
    sub: ['세라마이드', '엘라스틴', '결정셀룰로오스'],
  },
  {
    name: '글로우 콜라겐 앰플',
    manufacturer: '웰빙엘에스',
    form: '액상',
    weight: '25ml',
    main: ['콜라겐', '비타민C'],
    detail: '저분자콜라겐펩타이드 2,000mg, 비타민C 100mg',
    sub: ['히알루론산', '석류농축액', '정제수', '구연산'],
  },

  // 체지방
  {
    name: '가르시니아 다이어트 정',
    manufacturer: '코스맥스엔비티',
    form: '정제',
    weight: '1,000mg',
    main: ['가르시니아캄보지아추출물', '비타민B6'],
    detail: 'HCA 750mg, 비타민B6 1.5mg',
    sub: ['녹차추출물', 'L-카르니틴', '결정셀룰로오스', '스테아린산마그네슘'],
  },
  {
    name: '핏앤슬림 가르시니아 스틱',
    manufacturer: '뉴트리',
    form: '과립',
    weight: '2,500mg',
    main: ['가르시니아캄보지아추출물'],
    detail: 'HCA 750mg',
    sub: ['녹차추출물', '난소화성말토덱스트린', '히비스커스추출분말', '자일리톨'],
  },
  {
    name: '컷팅 그린커피 캡슐',
    manufacturer: '노바렉스',
    form: '경질캡슐',
    weight: '550mg',
    main: ['녹차추출물', '가르시니아캄보지아추출물'],
    detail: '카테킨 300mg, HCA 500mg',
    sub: ['L-카르니틴', '히비스커스추출분말', 'HPMC'],
  },

  // 관절
  {
    name: 'MSM 관절엔 파워',
    manufacturer: '노바렉스',
    form: '정제',
    weight: '1,200mg',
    main: ['MSM', '비타민D'],
    detail: 'MSM 1,500mg, 비타민D 10㎍',
    sub: ['보스웰리아추출물', '초록입홍합추출오일', '결정셀룰로오스'],
  },
  {
    name: '조인트케어 글루코사민 정',
    manufacturer: '콜마비앤에이치',
    form: '정제',
    weight: '1,100mg',
    main: ['N-아세틸글루코사민', 'MSM'],
    detail: 'N-아세틸글루코사민 500mg, MSM 1,000mg',
    sub: ['보스웰리아추출물', '콘드로이틴', '결정셀룰로오스'],
  },
  {
    name: '보스웰리아 관절 연질캡슐',
    manufacturer: '알피바이오',
    form: '연질캡슐',
    weight: '900mg',
    main: ['보스웰리아추출물', '비타민D'],
    detail: '보스웰리아 300mg, 비타민D 10㎍',
    sub: ['초록입홍합추출오일', '대두유', '밀납'],
  },

  // 면역 - 홍삼/비타민
  {
    name: '홍삼정 스틱 발란스',
    manufacturer: '한국인삼공사',
    form: '액상',
    weight: '10ml',
    main: ['홍삼농축액'],
    detail: '진세노사이드Rg1,Rb1,Rg3의합 4.5mg',
    sub: ['정제수', '벌꿀', '대추농축액'],
  },
  {
    name: '홍삼 멀티비타 정',
    manufacturer: '종근당바이오',
    form: '정제',
    weight: '1,000mg',
    main: ['홍삼농축액', '비타민C', '아연'],
    detail: '진세노사이드 3mg, 비타민C 100mg, 아연 8.5mg',
    sub: ['대추농축분말', '결정셀룰로오스', '스테아린산마그네슘'],
  },
  {
    name: '이뮨업 베타글루칸 캡슐',
    manufacturer: '서흥',
    form: '경질캡슐',
    weight: '600mg',
    main: ['베타글루칸', '아연'],
    detail: '베타글루칸 250mg, 아연 8.5mg',
    sub: ['프로폴리스추출분말', '표고버섯균사체추출물', 'HPMC'],
  },
  {
    name: '데일리 멀티비타민 미네랄',
    manufacturer: '코스맥스엔비티',
    form: '정제',
    weight: '1,200mg',
    main: ['비타민C', '비타민D', '아연', '마그네슘'],
    detail: '비타민C 500mg, 비타민D 20㎍, 아연 8.5mg, 마그네슘 315mg',
    sub: ['결정셀룰로오스', '이산화규소', '히프로멜로스'],
  },
  {
    name: '고함량 비타민C 1000 정',
    manufacturer: '고려은단',
    form: '정제',
    weight: '1,250mg',
    main: ['비타민C'],
    detail: '비타민C 1,000mg',
    sub: ['결정셀룰로오스', '스테아린산마그네슘', '히프로멜로스'],
  },

  // 남성/여성
  {
    name: '쏘팔메토 맨케어 연질캡슐',
    manufacturer: '알피바이오',
    form: '연질캡슐',
    weight: '1,000mg',
    main: ['쏘팔메토추출물', '아연'],
    detail: '쏘팔메토 320mg, 아연 8.5mg',
    sub: ['대두유', '밀납', '옥타코사놀', '레시틴'],
  },
  {
    name: '우먼케어 크랜베리 정',
    manufacturer: '노바렉스',
    form: '정제',
    weight: '800mg',
    main: ['크랜베리추출물', '프로바이오틱스'],
    detail: '프로안토시아니딘 36mg, 프로바이오틱스 10억CFU',
    sub: ['히알루론산', '결정셀룰로오스', '이산화규소'],
  },
  {
    name: '갱년기 백수오 정',
    manufacturer: '콜마비앤에이치',
    form: '정제',
    weight: '950mg',
    main: ['백수오등복합추출물', '비타민D'],
    detail: '백수오등복합추출물 514mg, 비타민D 10㎍',
    sub: ['석류농축분말', '대두이소플라본', '결정셀룰로오스'],
  },
  {
    name: '이너케어 석류 콜라겐 드링크',
    manufacturer: '웰빙엘에스',
    form: '액상',
    weight: '50ml',
    main: ['콜라겐', '대두이소플라본'],
    detail: '저분자콜라겐펩타이드 1,000mg, 대두이소플라본 25mg',
    sub: ['석류농축액', '히알루론산', '정제수', '구연산'],
  },
]

export const SEED_PRODUCTS: Product[] = SEED_ROWS.map((row, index) => ({
  id: `seed-${index}`,
  name: row.name,
  manufacturer: row.manufacturer,
  form: normalizeForm(row.form),
  formRaw: row.form,
  weightLabel: row.weight,
  weightMg: parseWeightMg(row.weight),
  mainIngredients: row.main,
  mainDetail: row.detail,
  markers: parseMarkers(row.detail),
  subIngredients: row.sub,
}))
