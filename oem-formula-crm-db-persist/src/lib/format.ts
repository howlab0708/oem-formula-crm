const INTEGER = new Intl.NumberFormat('ko-KR')

export function formatInt(value: number): string {
  return INTEGER.format(Math.round(value))
}

export function formatDecimal(value: number, digits = 1): string {
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPercent(share: number, digits = 0): string {
  return `${(share * 100).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`
}

/** 규격 표기. 1,000mg 이상은 g 로 접어 읽기 쉽게 한다. */
export function formatMg(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  if (value >= 1000) return `${formatDecimal(value / 1000, value % 1000 === 0 ? 0 : 1)}g`
  return `${formatDecimal(value, value % 1 === 0 ? 0 : 1)}mg`
}

export function formatMarkerValue(value: number, unit: string): string {
  // 유산균 수는 절대 개수로 보관하고 표시할 때만 억/조 단위로 접는다.
  if (unit === 'CFU') {
    if (value >= 1e12) return `${formatDecimal(value / 1e12, 1)}조 CFU`
    if (value >= 1e8) return `${formatDecimal(value / 1e8, 0)}억 CFU`
    return `${formatInt(value)} CFU`
  }
  const digits = Number.isInteger(value) ? 0 : value < 10 ? 1 : 0
  return `${formatDecimal(value, digits)}${unit}`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${formatDecimal(ms / 1000, 1)}초`
}

export function formatToday(): string {
  const now = new Date()
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(
    now.getDate(),
  ).padStart(2, '0')}`
}
