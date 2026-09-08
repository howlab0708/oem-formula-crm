'use client'

/**
 * 배합비 API 호출. `/api/formulas` 한 곳으로 모든 읽기·쓰기가 지나간다.
 *
 * 로그인이 만료되면 API 응답 대신 로그인 페이지로 리다이렉트된다. 그때 JSON 파싱
 * 오류를 그대로 보여 주면 원인을 알 수 없으므로, 응답이 JSON 이 아닌 경우를 먼저
 * 걸러 "입력 내용을 복사한 뒤 다시 로그인" 안내로 바꾼다(노트 화면과 같은 처리).
 */

import type { FormulaRecord, FormulaSheet, FormulaSummary, IngredientPrice, QuoteVersion } from '../formulaDesign/types'

export type FormulaCompany = { key: string; name: string; count: number }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('로그인이 만료되었을 수 있습니다. 입력 내용을 복사한 뒤 다시 로그인해 주세요.')
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '배합비 요청을 처리하지 못했습니다.')
  return data as T
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export function fetchFormulaList(company: string, query: string, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ company, query, page: String(page) })
  return request<{ formulas: FormulaSummary[]; hasMore: boolean; companies: FormulaCompany[] }>(
    `/api/formulas?${params}`,
    { signal },
  )
}

export function fetchFormula(id: string) {
  return request<{ formula: FormulaRecord }>(`/api/formulas?id=${encodeURIComponent(id)}`)
}

export function fetchVersions(id: string) {
  return request<{ versions: QuoteVersion[] }>(`/api/formulas?id=${encodeURIComponent(id)}&versions=1`)
}

export function fetchVersionSheet(id: string, version: number) {
  return request<{ sheet: FormulaSheet }>(`/api/formulas?id=${encodeURIComponent(id)}&version=${version}`)
}

/** 원료단가 기억장. 배합비와 다른 표라서 주소도 다르다. */
export function fetchIngredientPrices(signal?: AbortSignal) {
  return request<{ prices: IngredientPrice[] }>('/api/ingredient-prices', { signal })
}

export function deleteIngredientPrice(name: string) {
  return request<{ deleted: number }>('/api/ingredient-prices', jsonInit('DELETE', { name }))
}

export function clearIngredientPrices() {
  return request<{ deleted: number }>('/api/ingredient-prices', jsonInit('DELETE', { all: true }))
}

export type FormulaPayload = {
  id: string
  version?: number
  company: string
  title: string
  noteId: string | null
  sheet: FormulaSheet
}

export function createFormula(payload: FormulaPayload) {
  return request<{ formula: FormulaRecord }>('/api/formulas', jsonInit('POST', payload))
}

export function updateFormula(payload: FormulaPayload & { version: number }) {
  return request<{ formula: FormulaRecord }>('/api/formulas', jsonInit('PUT', payload))
}

export function deleteFormula(id: string, version: number) {
  return request<{ deleted: true }>('/api/formulas', jsonInit('DELETE', { id, version }))
}
