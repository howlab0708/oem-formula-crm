/** 검색용 이름만 통합한다. Product의 원료 원문은 변경하지 않는다. */
const cache = new Map<string, { key: string; label: string }>()

export function compactSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

// 동일 성분임이 확인된 병기만 허용한다. 염·유도체·함량·혼합제제는 유지한다.
// https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/
// https://ods.od.nih.gov/factsheets/Riboflavin-HealthProfessional/
const ALIASES: Record<string, string> = {
  '비타민c(l-ascorbicacid)': '비타민C',
  '비타민c(l-아스코르빈산)': '비타민C',
  '비타민c(아스코르빈산)': '비타민C',
  '비타민b2(riboflavin)': '비타민B2',
}

function identity(raw: string): { key: string; label: string } {
  const known = cache.get(raw)
  if (known) return known
  let label = raw.normalize('NFKC')
    .replace(/\(\s*고시형\s*\)/g, '')
    .replace(/비타민\s*-?\s*([a-k])\s*-?\s*(\d*)/gi, (_, vitamin: string, number: string) => `비타민${vitamin.toUpperCase()}${number}`)
    .replace(/\s+/g, ' ').trim()
  label = ALIASES[compactSearchText(label)] ?? label
  const result = { key: compactSearchText(label), label }
  if (cache.size >= 200_000) cache.clear()
  cache.set(raw, result)
  return result
}

export function mainIngredientKey(raw: string): string {
  return identity(raw).key
}

export function mainIngredientLabel(raw: string): string {
  return identity(raw).label
}

export function uniqueMainIngredients(names: string[]): string[] {
  const seen = new Set<string>()
  return names.flatMap((raw) => {
    const { key, label } = identity(raw)
    if (!key || seen.has(key)) return []
    seen.add(key)
    return [label]
  })
}
