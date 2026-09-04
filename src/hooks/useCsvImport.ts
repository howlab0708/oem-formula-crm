'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImportReport, Product, WorkerResponse } from '@/lib/types'

export type ImportStatus =
  | { phase: 'idle' }
  | { phase: 'reading'; fileName: string }
  | { phase: 'parsing'; fileName: string; parsedRows: number; ratio: number }
  | { phase: 'done'; report: ImportReport }
  | { phase: 'error'; message: string }

type Options = {
  onLoaded: (products: Product[], report: ImportReport) => void
}

/**
 * CSV 파싱을 전용 워커에 위임한다.
 * 메인 스레드는 파일을 ArrayBuffer 로 읽어 넘기기만 하므로, 수만 행짜리
 * 공공데이터를 올려도 필터 입력이나 스크롤이 멈추지 않는다.
 */
export function useCsvImport({ onLoaded }: Options) {
  const workerRef = useRef<Worker | null>(null)
  const [status, setStatus] = useState<ImportStatus>({ phase: 'idle' })
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(new URL('../workers/csvParser.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setStatus((prev) => ({
          phase: 'parsing',
          fileName: prev.phase === 'parsing' || prev.phase === 'reading' ? prev.fileName : '',
          parsedRows: message.parsedRows,
          ratio: message.totalBytes > 0 ? message.readBytes / message.totalBytes : 0,
        }))
        return
      }

      if (message.type === 'done') {
        onLoadedRef.current(message.products, message.report)
        setStatus({ phase: 'done', report: message.report })
        return
      }

      setStatus({ phase: 'error', message: message.message })
    }

    worker.onerror = (event) => {
      setStatus({ phase: 'error', message: event.message || '워커 실행 중 오류가 발생했습니다.' })
    }

    workerRef.current = worker
    return worker
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const importFile = useCallback(
    async (file: File, encoding: 'auto' | 'utf-8' | 'euc-kr' = 'auto') => {
      setStatus({ phase: 'reading', fileName: file.name })
      try {
        const buffer = await file.arrayBuffer()
        const worker = ensureWorker()
        setStatus({ phase: 'parsing', fileName: file.name, parsedRows: 0, ratio: 0 })
        worker.postMessage({ type: 'parse', fileName: file.name, buffer, encoding }, [buffer])
      } catch (error) {
        setStatus({
          phase: 'error',
          message: error instanceof Error ? error.message : '파일을 읽지 못했습니다.',
        })
      }
    },
    [ensureWorker],
  )

  const reset = useCallback(() => setStatus({ phase: 'idle' }), [])

  return { status, importFile, reset }
}
