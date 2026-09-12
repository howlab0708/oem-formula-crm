import { TIER, buildManufacturerTiers, canonicalManufacturer, manufacturerGroup, manufacturerPriority } from './manufacturerRank'
import { isExportReference, referenceProductMatch, REFERENCE_FAMILIES } from './referencePriority'
import type { Product } from './types'

type Entry = { product: Product; seq: number; parent: string; family: string | null; priority: number; date: string }

/** 정상 날짜만 비교한다. 신고일은 판매 실적이나 생산일을 뜻하지 않는다. */
function reportDate(raw: string | undefined): string {
  const date = (raw ?? '').replace(/[-./\s]/g, '')
  if (!/^\d{8}$/.test(date)) return ''
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? date : ''
}

/**
 * 대표 판매명 → 공식몰 제품군 → 메이저 → 등록 건수 상위 → 기타 → 수출 명시 품목.
 * 앞 구간은 제품군을 먼저 순환하고 그 안에서 공장별로 순환한다.
 * 제품군 근거가 없는 나머지 구간에만 제조사 순환을 적용한다.
 * 공장은 별도 배열·별도 이름으로 유지하며 제품/신고번호를 삭제하거나 합치지 않는다.
 */
export function prepareReferences(products: Product[]): Product[] {
  if (!products.length) return products
  const originals = new Map<string, Set<string>>()
  for (const product of products) {
    const display = canonicalManufacturer(product.manufacturer)
    const names = originals.get(display) ?? new Set<string>()
    names.add(product.manufacturer)
    originals.set(display, names)
  }
  const prepared = products.map((product) => {
    const display = canonicalManufacturer(product.manufacturer)
    // 보정 후 둘 이상의 원본 제조소가 같은 이름이 되면 원문을 유지한다.
    // 같은 법인이라는 사실만으로 같은 공장임을 확인할 수 없다.
    const manufacturer = originals.get(display)!.size > 1 ? product.manufacturer : display
    return manufacturer === product.manufacturer ? product : { ...product, manufacturer }
  })
  const counts = new Map<string, number>()
  for (const product of prepared) counts.set(product.manufacturer, (counts.get(product.manufacturer) ?? 0) + 1)
  const tiers = buildManufacturerTiers(counts)
  const entries: Entry[] = prepared.map((product, seq) => {
    const match = referenceProductMatch(product)
    return {
      product, seq, parent: manufacturerGroup(product.manufacturer), family: match?.family ?? null, date: reportDate(product.reportedAt),
      priority: isExportReference(product.name) ? 5 : match ? match.priority : 2 + (tiers.get(product.manufacturer) ?? TIER.OTHER),
    }
  })
  const result: Product[] = []
  for (let priority = 0; priority <= 5; priority += 1) {
    const parents = new Map<string, Map<string, Entry[]>>()
    for (const entry of entries) {
      if (entry.priority !== priority) continue
      const group = entry.family ?? entry.parent
      const plants = parents.get(group) ?? new Map<string, Entry[]>()
      const queue = plants.get(entry.product.manufacturer) ?? []
      queue.push(entry)
      plants.set(entry.product.manufacturer, queue)
      parents.set(group, plants)
    }
    const orderedParents = [...parents.keys()].sort((a, b) => priority < 2
      ? REFERENCE_FAMILIES.findIndex(family => family.label === a) - REFERENCE_FAMILIES.findIndex(family => family.label === b)
      : manufacturerPriority(a) - manufacturerPriority(b) || a.localeCompare(b, 'ko'))
    const queues = orderedParents.map((parent) => {
      const plants = [...parents.get(parent)!.values()]
      for (const plant of plants) plant.sort((a, b) => b.date.localeCompare(a.date) || a.seq - b.seq)
      plants.sort((a, b) => b[0].date.localeCompare(a[0].date) || a[0].product.manufacturer.localeCompare(b[0].product.manufacturer, 'ko'))
      const queue: Entry[] = []
      const longest = Math.max(...plants.map((plant) => plant.length))
      for (let round = 0; round < longest; round += 1) {
        for (const plant of plants) if (plant[round]) queue.push(plant[round])
      }
      return queue
    })
    const longest = queues.reduce((max, queue) => Math.max(max, queue.length), 0)
    for (let round = 0; round < longest; round += 1) {
      for (const queue of queues) if (queue[round]) result.push(queue[round].product)
    }
  }
  return result
}
