/**
 * 레퍼런스 목록의 기본 순서.
 *
 * 원본은 업소 인허가번호 순이라, 첫 화면에 아무도 모르는 제조사가 먼저 나온다.
 * 영업·연구 담당자가 목록을 훑는 자리에서는 아는 이름이 먼저 보여야 하므로
 * 세 단계로 다시 세운다.
 *
 *  1) 제조소 등급   - 메이저 → 제조 건수 상위 → 나머지
 *  2) 제조소 순환   - 같은 등급 안에서는 제조소를 한 건씩 번갈아 뽑는다.
 *                     한 회사가 페이지를 통째로 차지하지 않고, 1·2·3페이지 모두
 *                     서로 다른 메이저가 골고루 깔린다.
 *  3) 묶음 내부     - 대표 브랜드 제품 먼저, 그다음 허가일자 최신순.
 *                     지금 실제로 팔리는 제품이 앞으로 온다.
 *
 * 공장은 각각이 별개의 제조소다. 여기서도 합치지 않고 따로 순환시킨다.
 */

import {
  TIER,
  buildManufacturerTiers,
  canonicalManufacturer,
  manufacturerGroup,
} from './manufacturerRank'
import type { Product } from './types'

/**
 * 대표 브랜드 키워드. 제품명에 들어 있으면 그 제조소 묶음 안에서 먼저 보여준다.
 * 실제로 유통되는 브랜드 이름만 넣는다 - `홍삼정`·`밀크씨슬`·`루테인지아잔틴`처럼
 * 품목 종류를 가리키는 일반명은 수백 건씩 걸려 변별력이 없으므로 제외한다.
 */
const FLAGSHIP_BRANDS = [
  // 종근당건강
  '락토핏', '프로메가', '아이클리어', '아임비타', '아이커', '락토조이',
  // 한국인삼공사(정관장)
  '정관장', '홍이장군', '화애락', '에브리타임', '굿베이스', '알파프로젝트',
  // 제약·식품 대기업 브랜드
  '하이뮨', '지큐랩', '셀렉스', '이너비', '리턴업', '뉴오리진', '비타500',
  '엘레나', '메가트루', '아로나민', '임팩타민', '고려은단',
  // 건기식 전문 브랜드
  '헤모힘', '듀오락', '덴프스', '뉴트리디데이', '여에스더', '아임쇼핑',
  '센트룸', '얼라이브', '활력비타민',
].map((brand) => brand.replace(/\s+/g, '').toLowerCase())

function isFlagship(name: string): boolean {
  const compact = name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  return FLAGSHIP_BRANDS.some((brand) => compact.includes(brand))
}

type Entry = { product: Product; seq: number; flagship: boolean }

/**
 * 제조원 표기를 통일하고 목록 순서를 다시 세운다.
 * 데이터셋을 불러올 때 한 번만 돌리고, 이후 필터는 이 순서를 그대로 물려받는다.
 */
export function prepareReferences(products: Product[]): Product[] {
  if (products.length === 0) return products

  // 1) 표기 통일. 공장 구분은 그대로 두고 법인격 표기만 맞춘다.
  const entries: Entry[] = products.map((product, seq) => {
    const manufacturer = canonicalManufacturer(product.manufacturer)
    return {
      product: manufacturer === product.manufacturer ? product : { ...product, manufacturer },
      seq,
      flagship: isFlagship(product.name),
    }
  })

  // 2) 제조소별로 묶는다.
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const key = entry.product.manufacturer
    const bucket = groups.get(key)
    if (bucket) bucket.push(entry)
    else groups.set(key, [entry])
  }

  const counts = new Map<string, number>()
  for (const [name, bucket] of groups) counts.set(name, bucket.length)
  const tiers = buildManufacturerTiers(counts)

  // 3) 묶음 내부: 대표 브랜드 먼저, 그다음 허가일자 최신순, 마지막은 원본 순서.
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => {
      if (a.flagship !== b.flagship) return a.flagship ? -1 : 1
      const left = a.product.reportedAt ?? ''
      const right = b.product.reportedAt ?? ''
      if (left !== right) return right.localeCompare(left)
      return a.seq - b.seq
    })
  }

  // 4) 제조소 순서를 정한다. 규모가 큰 모기업부터, 같은 모기업 안에서는 큰 공장부터.
  //    모기업 합계를 먼저 보기 때문에 한 그룹의 공장들이 서로 떨어지지 않는다.
  const parentTotals = new Map<string, number>()
  const parents = new Map<string, string>()
  for (const [name, count] of counts) {
    const parent = manufacturerGroup(name)
    parents.set(name, parent)
    parentTotals.set(parent, (parentTotals.get(parent) ?? 0) + count)
  }

  const order = [...groups.keys()].sort((a, b) => {
    const parentA = parents.get(a) as string
    const parentB = parents.get(b) as string
    return (
      (tiers.get(a) ?? 0) - (tiers.get(b) ?? 0) ||
      (parentTotals.get(parentB) ?? 0) - (parentTotals.get(parentA) ?? 0) ||
      parentA.localeCompare(parentB, 'ko') ||
      (counts.get(b) ?? 0) - (counts.get(a) ?? 0) ||
      a.localeCompare(b, 'ko')
    )
  })

  // 5) 등급 블록별로 제조소를 한 건씩 번갈아 뽑는다.
  const result: Product[] = []
  for (const tier of [TIER.MAJOR, TIER.LARGE, TIER.OTHER]) {
    const queues = order
      .filter((name) => (tiers.get(name) ?? 0) === tier)
      .map((name) => groups.get(name) as Entry[])
    const longest = queues.reduce((max, queue) => Math.max(max, queue.length), 0)
    for (let round = 0; round < longest; round += 1) {
      for (const queue of queues) {
        if (round < queue.length) result.push(queue[round].product)
      }
    }
  }

  return result
}
