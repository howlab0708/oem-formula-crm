export type FormulaNoteInput = { company: string; title: string; sourceText: string; memo: string }
export type FormulaNote = FormulaNoteInput & { id: string; version: number; createdAt: string; updatedAt: string }
export type NoteSummary = Omit<FormulaNote, 'sourceText' | 'memo'>
export type NoteCompany = { key: string; name: string; count: number }
export const NOTE_TEXT_LIMIT = 30_000

export function companyKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
}

export function validateNoteInput(value: unknown): FormulaNoteInput {
  if (!value || typeof value !== 'object') throw new Error('노트 내용을 확인해 주세요.')
  const input = value as Record<string, unknown>
  const read = (key: string, label: string, max: number, required = true) => {
    if (typeof input[key] !== 'string') throw new Error(`${label}을 확인해 주세요.`)
    const text = input[key].trim()
    if (required && !text) throw new Error(`${label}을 입력해 주세요.`)
    if (text.length > max) throw new Error(`${label}은 ${max.toLocaleString('ko-KR')}자 이내로 입력해 주세요.`)
    return text
  }
  const note = {
    company: read('company', '회사명', 100).replace(/\s+/g, ' '),
    title: read('title', '노트 제목', 150),
    sourceText: read('sourceText', '복사한 텍스트', NOTE_TEXT_LIMIT),
    memo: read('memo', '상담 메모', 10_000, false),
  }
  if (!parseBriefingText(note.sourceText)) throw new Error('배합비 검색의 ‘텍스트 복사’로 복사한 브리핑을 붙여넣어 주세요.')
  return note
}

export type NoteFrequency = { name: string; percent: number }
export type ParsedBriefing = {
  date: string
  conditions: { group: string; label: string }[]
  metrics: { label: string; value: string }[]
  mainIngredients: NoteFrequency[]
  subIngredients: NoteFrequency[]
  mainCombos: { label: string; count: string }[]
  subCombos: { label: string; count: string }[]
}

/** 기존 복사 텍스트도 읽되, 시장 채택률을 실제 배합 비율로 바꾸어 해석하지 않는다. */
export function parseBriefingText(text: string): ParsedBriefing | null {
  const lines = text.trim().replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim())
  if (!lines.includes('[OEM 배합 설계 브리핑]')) return null
  const field = (name: string) => lines.find((line) => line.startsWith(`· ${name}: `))?.slice(name.length + 4) ?? ''
  const conditionText = field('검토 조건')
  if (!conditionText || !field('시장 레퍼런스')) return null
  const groups = '부원료 포함|부원료 제외|검색어|주원료|제형|제조원|규격|지표성분'
  const conditions = conditionText === '조건 미지정(전체)' ? [] : conditionText
    .split(new RegExp(` / (?=(?:${groups}) )`))
    .map((part) => {
      const match = part.match(new RegExp(`^(${groups}) (.+)$`))
      return match ? { group: match[1], label: match[2] } : { group: '조건', label: part }
    })
  const frequencies = (value: string): NoteFrequency[] => {
    // 원료명 안의 쉼표·괄호는 보존하고 끝의 채택률만 구분자로 사용한다.
    const result: NoteFrequency[] = []
    const pattern = /(?:^|,\s*)(.*?)\((\d+(?:\.\d+)?)%\)(?=,\s*|$)/g
    for (const match of value.matchAll(pattern)) {
      const percent = Number(match[2])
      if (percent <= 100) result.push({ name: match[1], percent })
    }
    return result
  }
  const combos = (value: string) => value ? value.split(' / ').flatMap((part) => {
    const match = part.match(/^(.*) ([\d,]+)건$/)
    return match ? [{ label: match[1], count: match[2] }] : []
  }) : []
  const metricNames = ['시장 레퍼런스', '시장 표준 제형', '제형 분포', '1알 중량(중앙값)', '평균 주원료 투입', '평균 부원료 투입', '주요 제조원']
  const metrics = metricNames.flatMap((label) => field(label) ? [{ label, value: field(label) }] : [])
  for (const line of lines) {
    const match = line.match(/^· (.+ 시장 표준 함량): (.+)$/)
    if (match) metrics.push({ label: match[1], value: match[2] })
  }
  return {
    date: lines.find((line) => line.startsWith('· 작성일 '))?.slice(6) ?? '',
    conditions, metrics,
    mainIngredients: frequencies(field('다빈도 주원료')),
    subIngredients: frequencies(field('다빈도 부원료')),
    mainCombos: combos(field('다빈도 주원료 조합')),
    subCombos: combos(field('다빈도 부원료 조합') || field('다빈도 조합')),
  }
}
