export type DatasetProvenance = { source: 'mfds-c003' | 'user-csv'; updatedThrough: string | null; datedRows: number }
export const C003_SOURCE = 'https://www.foodsafetykorea.go.kr/api/openApiInfo.do?menu_grp=MENU_GRP31&menu_no=661&show_cnt=10&start_idx=1&svc_no=C003'

export function sourceDate(raw: string): string | null {
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:$|[ T]|\d{6}$)/.exec(raw.trim())
  if (!match) return null
  const iso = `${match[1]}-${match[2]}-${match[3]}`
  const value = new Date(`${iso}T00:00:00Z`)
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0,10) === iso ? iso : null
}
/** LAST_UPDT_DTM is a source record date, not the CSV download date. */
export function buildProvenance(headers: string[], acceptedRows: string[][]): DatasetProvenance {
  const keys = headers.map(h => h.replace(/\uFEFF/g, '').trim().toUpperCase())
  const c003 = ['PRDLST_REPORT_NO','NTK_MTHD','STDR_STND','LAST_UPDT_DTM'].every(key => keys.includes(key))
  const index = keys.indexOf('LAST_UPDT_DTM')
  let updatedThrough: string | null = null, datedRows = 0
  if (c003) for (const row of acceptedRows) {
    const date = sourceDate(row[index] ?? '')
    if (date) { datedRows++; if (!updatedThrough || date > updatedThrough) updatedThrough = date }
  }
  return { source: c003 ? 'mfds-c003' : 'user-csv', updatedThrough, datedRows }
}
export function validateProvenance(value: unknown, totalRows: number): DatasetProvenance | null {
  if (value == null) return null // Older clients and stored generations remain readable.
  const p = value as DatasetProvenance
  if (!p || !['mfds-c003','user-csv'].includes(p.source) || !Number.isSafeInteger(p.datedRows) || p.datedRows < 0 || p.datedRows > totalRows
    || (p.updatedThrough !== null && (typeof p.updatedThrough !== 'string' || sourceDate(p.updatedThrough) !== p.updatedThrough))
    || (p.updatedThrough === null) !== (p.datedRows === 0)
    || (p.source === 'user-csv' && (p.datedRows || p.updatedThrough))) throw new Error('데이터 기준일 정보를 확인해 주세요.')
  return { source: p.source, updatedThrough: p.updatedThrough, datedRows: p.datedRows }
}
export function freshnessLabel(provenance: DatasetProvenance | null | undefined, finishedAt: string | null | undefined, seed = false) {
  if (seed) return { date: '데이터 기준일: 없음 · 예시 데이터', source: '출처: 앱 예시 레퍼런스', schedule: '갱신 주기 없음', url: null }
  const reflected = finishedAt ? sourceDate(finishedAt) : null
  return {
    date: provenance?.updatedThrough ? `데이터 기준일: ${provenance.updatedThrough} · 원본 최종수정일 기준`
      : reflected ? `데이터 기준일: ${reflected} · 서버 반영일 기준 (원본 기준일 미보존)` : '데이터 기준일: 확인 필요',
    source: provenance?.source === 'mfds-c003' ? '출처: 식약처 식품안전나라 C003 품목제조신고' : '출처: 업로드 CSV · 원본 출처 미확인',
    schedule: provenance?.source === 'mfds-c003' ? '원본 상시 갱신 · 서비스는 CSV 업로드 시 반영' : '서비스는 CSV 업로드 시 반영',
    url: provenance?.source === 'mfds-c003' ? C003_SOURCE : null,
  }
}
