import { mergeCompanyProducts, type CompanyFile, type CompanyImportInput, type CompanyLibrary } from '../companyCsv'
import type { Product } from '../types'
async function request<T>(init?: RequestInit, id?: string): Promise<T> {
  const response = await fetch(`/api/company-data${id ? `?id=${encodeURIComponent(id)}` : ''}`, { ...init, cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(body?.error || '회사 데이터를 불러오지 못했습니다.')
  return body as T
}
export async function loadCompanyLibrary(): Promise<CompanyLibrary> {
  const { files, local } = await request<{ files: CompanyFile[]; local: boolean }>()
  const groups: Product[][] = []
  const active = files.filter(file => file.active)
  for (let i = 0; i < active.length; i += 4) {
    const results = await Promise.all(active.slice(i, i + 4).map(file => request<{ products: Product[] }>(undefined, file.id)))
    groups.push(...results.map(result => result.products))
  }
  return { files, products: mergeCompanyProducts(groups), local }
}
export const addCompanyCsv = (input: CompanyImportInput) => request<{ file: CompanyFile; duplicate: boolean }>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
export const setCompanyFileActive = (id: string, active: boolean) => request({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active }) })
