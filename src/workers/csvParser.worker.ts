/**
 * 식약처 CSV 파싱 워커.
 *
 * 수만 행짜리 공공데이터를 메인 스레드에서 돌리면 입력이 통째로 얼어붙는다.
 * 디코딩 -> 토크나이즈 -> 도메인 변환까지 전부 여기서 끝내고, 메인 스레드에는
 * 진행률과 완성된 Product 배열만 넘긴다.
 */

import { decodeBuffer, detectDelimiter, parseCsv } from '../lib/csv'
import { mapHeaders, rowToProduct } from '../lib/csvSchema'
import type { ImportReport, Product, WorkerRequest, WorkerResponse } from '../lib/types'

/**
 * tsconfig 에 dom 과 webworker lib 를 동시에 넣으면 전역 선언이 충돌하므로,
 * 워커 전역은 필요한 만큼만 좁게 타이핑한다.
 */
type WorkerScope = {
  postMessage: (message: WorkerResponse) => void
  addEventListener: (
    type: 'message',
    listener: (event: { data: WorkerRequest }) => void,
  ) => void
}

const ctx = self as unknown as WorkerScope

function post(message: WorkerResponse) {
  ctx.postMessage(message)
}

ctx.addEventListener('message', (event) => {
  const request = event.data
  if (!request || request.type !== 'parse') return

  const startedAt = Date.now()

  try {
    const { text, encoding } = decodeBuffer(request.buffer, request.encoding)
    const totalChars = text.length

    if (!text.trim()) {
      post({ type: 'error', message: '파일이 비어 있습니다.' })
      return
    }

    const delimiter = detectDelimiter(text)
    const rows = parseCsv(text, {
      delimiter,
      progressEvery: 2000,
      onProgress: (rowsParsed, charIndex) => {
        post({
          type: 'progress',
          parsedRows: rowsParsed,
          totalBytes: totalChars,
          readBytes: charIndex,
        })
      },
    })

    if (rows.length < 2) {
      post({ type: 'error', message: '헤더 외에 읽을 수 있는 데이터 행이 없습니다.' })
      return
    }

    const mapping = mapHeaders(rows[0])
    const dataRows = mapping.positionalFallback ? rows : rows.slice(1)

    const products: Product[] = []
    let skipped = 0

    for (let i = 0; i < dataRows.length; i += 1) {
      const product = rowToProduct(dataRows[i], mapping, i)
      if (product) products.push(product)
      else skipped += 1

      if (i > 0 && i % 5000 === 0) {
        post({ type: 'progress', parsedRows: i, totalBytes: totalChars, readBytes: totalChars })
      }
    }

    if (products.length === 0) {
      post({
        type: 'error',
        message:
          '제품명 열을 찾지 못했습니다. 식약처 원본 CSV이거나 7열 템플릿(제품명·제조원·제형·규격·주원료·지표성분·부원료)이어야 합니다.',
      })
      return
    }

    const report: ImportReport = {
      fileName: request.fileName,
      encoding,
      totalRows: dataRows.length,
      accepted: products.length,
      skipped,
      columnMap: mapping.label,
      unmappedHeaders: mapping.unmapped,
      elapsedMs: Date.now() - startedAt,
    }

    post({ type: 'done', products, report })
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : '알 수 없는 파싱 오류가 발생했습니다.',
    })
  }
})
