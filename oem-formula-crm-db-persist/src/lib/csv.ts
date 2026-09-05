/**
 * CSV 토크나이저와 인코딩 감지.
 *
 * 식약처 공공데이터는 EUC-KR(CP949) 로 내려오는 경우가 많고, 엑셀을 거치면
 * UTF-8 BOM 이 붙는다. 업로드하는 사람이 인코딩을 신경 쓰지 않아도 되도록
 * UTF-8 로 먼저 엄격 디코딩해 보고 실패하면 EUC-KR 로 되돌린다.
 */

export type DecodeResult = {
  text: string
  encoding: string
}

const BOM = 0xfeff

export function decodeBuffer(buffer: ArrayBuffer, preferred: string): DecodeResult {
  if (preferred !== 'auto') {
    return { text: stripBom(new TextDecoder(preferred).decode(buffer)), encoding: preferred }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return { text: stripBom(text), encoding: 'utf-8' }
  } catch {
    // 무시: UTF-8 로 못 읽으면 국내 공공데이터 기본값인 EUC-KR 로 재시도한다.
  }

  try {
    const text = new TextDecoder('euc-kr').decode(buffer)
    return { text: stripBom(text), encoding: 'euc-kr' }
  } catch {
    return { text: stripBom(new TextDecoder('utf-8').decode(buffer)), encoding: 'utf-8 (대체)' }
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === BOM ? text.slice(1) : text
}

/** 헤더 줄에서 쉼표/탭/세미콜론 중 가장 많이 쓰인 문자를 구분자로 고른다. */
export function detectDelimiter(text: string): string {
  const head = text.slice(0, 4096).split(/\r?\n/, 1)[0] ?? ''
  const candidates = [',', '\t', ';', '|']
  let best = ','
  let bestCount = -1
  for (const candidate of candidates) {
    const count = head.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return bestCount > 0 ? best : ','
}

export type ParseCsvOptions = {
  delimiter?: string
  /** rowsParsed, charIndex 를 받아 진행률을 보고한다. */
  onProgress?: (rowsParsed: number, charIndex: number) => void
  /** onProgress 호출 간격(행 수) */
  progressEvery?: number
}

/**
 * RFC 4180 기준 토크나이저. 따옴표 안의 구분자/줄바꿈/이스케이프("")를 처리한다.
 * 대용량 파일에서 한 번에 배열을 만들지 않도록 행 콜백 대신 배열을 반환하되,
 * 진행률 콜백으로 UI 를 살려 둔다(워커 안에서 돌리는 것이 전제다).
 */
export function parseCsv(text: string, options: ParseCsvOptions = {}): string[][] {
  const delimiter = options.delimiter ?? detectDelimiter(text)
  const progressEvery = options.progressEvery ?? 2000
  const rows: string[][] = []

  let row: string[] = []
  let field = ''
  let inQuotes = false
  let hasContent = false

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    pushField()
    if (hasContent || row.length > 1) rows.push(row)
    row = []
    hasContent = false
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true
      hasContent = true
      continue
    }

    if (ch === delimiter) {
      pushField()
      continue
    }

    if (ch === '\r') continue

    if (ch === '\n') {
      pushRow()
      if (options.onProgress && rows.length % progressEvery === 0) {
        options.onProgress(rows.length, i)
      }
      continue
    }

    field += ch
    if (ch.trim() !== '') hasContent = true
  }

  if (field.length > 0 || row.length > 0) pushRow()

  return rows
}
