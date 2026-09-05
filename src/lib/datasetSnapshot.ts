import type { DatasetMeta } from './api/products'
import type { FormType, Product } from './types'

export const SNAPSHOT_VERSION = 2
export const SNAPSHOT_FORMAT = `snapshot-v${SNAPSHOT_VERSION}`

type PackedProduct = [
  number, number, number, number, number, number, number | null,
  number[], number, [number, number, number, number | null, number][],
  number[], number, number, number, number, [] | [number | null],
]

export type DatasetSnapshot = {
  version: number
  meta: DatasetMeta
  strings: string[]
  products: PackedProduct[]
}

// 반복되는 원료·제조원·설명은 한 번만 전송한다. ID와 원문도 그대로 보존한다.
export function packSnapshot(meta: DatasetMeta, products: Product[]): DatasetSnapshot {
  const strings: string[] = []
  const indices = new Map<string, number>()
  const intern = (value: string | undefined): number => {
    if (value === undefined) return -1
    const found = indices.get(value)
    if (found !== undefined) return found
    const index = strings.length
    strings.push(value)
    indices.set(value, index)
    return index
  }

  return {
    version: SNAPSHOT_VERSION,
    meta,
    strings,
    products: products.map((p): PackedProduct => [
      intern(p.id), intern(p.name), intern(p.manufacturer), intern(p.form),
      intern(p.formRaw), intern(p.weightLabel), p.weightMg,
      p.mainIngredients.map(intern), intern(p.mainDetail),
      p.markers.map((m) => [intern(m.name), m.value, intern(m.unit), m.mgValue, intern(m.raw)]),
      p.subIngredients.map(intern), intern(p.reportNo), intern(p.reportedAt), intern(p.primaryFunction),
      intern(p.intakeMethod), p.unitWeightMg === undefined ? [] : [p.unitWeightMg],
    ]),
  }
}

export function unpackSnapshot(snapshot: DatasetSnapshot, expected: DatasetMeta): Product[] {
  if (
    snapshot.version !== SNAPSHOT_VERSION ||
    snapshot.meta?.generation !== expected.generation ||
    !Array.isArray(snapshot.strings) || !Array.isArray(snapshot.products) ||
    snapshot.products.length !== expected.imported_rows ||
    snapshot.meta.imported_rows !== expected.imported_rows
  ) {
    throw new Error('저장된 데이터 버전이나 건수가 일치하지 않습니다.')
  }
  const text = (index: number): string => {
    const value = snapshot.strings[index]
    if (!Number.isInteger(index) || typeof value !== 'string') {
      throw new Error('저장된 데이터 형식을 읽지 못했습니다.')
    }
    return value
  }
  return snapshot.products.map((row): Product => {
    if (!Array.isArray(row) || row.length !== 16) {
      throw new Error('저장된 데이터 형식을 읽지 못했습니다.')
    }
    return {
      id: text(row[0]), name: text(row[1]), manufacturer: text(row[2]),
      form: text(row[3]) as FormType, formRaw: text(row[4]), weightLabel: text(row[5]),
      weightMg: row[6], mainIngredients: row[7].map(text), mainDetail: text(row[8]),
      markers: row[9].map((m) => ({ name: text(m[0]), value: m[1], unit: text(m[2]), mgValue: m[3], raw: text(m[4]) })),
      subIngredients: row[10].map(text),
      ...(row[11] === -1 ? {} : { reportNo: text(row[11]) }),
      ...(row[12] === -1 ? {} : { reportedAt: text(row[12]) }),
      ...(row[13] === -1 ? {} : { primaryFunction: text(row[13]) }),
      ...(row[14] === -1 ? {} : { intakeMethod: text(row[14]) }),
      ...(row[15].length === 0 ? {} : { unitWeightMg: row[15][0] }),
    }
  })
}
