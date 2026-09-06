'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveDatasetToServer, type DatasetMeta } from '@/lib/api/products'
import type { ImportReport, Product, WorkerResponse } from '@/lib/types'

export type ImportStatus =
  | { phase: 'idle' }
  | { phase: 'reading'; fileName: string }
  | { phase: 'parsing'; fileName: string; parsedRows: number; ratio: number }
  | { phase: 'done'; report: ImportReport }
  | { phase: 'error'; message: string }

/**
 * 화면(로컬 상태)은 파싱이 끝나는 즉시 바뀐다 - 이건 그 뒤에서 같은 데이터를
 * 서버(Postgres)에 올리는 별개의 진행 상태다. 실패해도 화면에 보이는 데이터는
 * 그대로 남는다 - 저장만 실패한 것이지 상담이 막히는 건 아니다.
 */
export type SaveStatus =
  | { phase: 'idle' }
  | { phase: 'saving'; sent: number; total: number }
  | { phase: 'saved'; meta: DatasetMeta }
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ phase: 'idle' })
  const onLoadedRef = useRef(onLoaded)
  /** 저장이 끝나기 전에 같은 파일을 또 올리는 경우, 이전 저장 결과가 뒤늦게 화면을 덮지 않게 세대를 센다. */
  const saveRunId = useRef(0)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  const saveToServer = useCallback((fileName: string, products: Product[], provenance?: ImportReport['provenance']) => {
    const runId = (saveRunId.current += 1)
    setSaveStatus({ phase: 'saving', sent: 0, total: products.length })
    saveDatasetToServer(fileName, products, (progress) => {
      if (saveRunId.current !== runId) return
      setSaveStatus({ phase: 'saving', sent: progress.sent, total: progress.total })
    }, provenance)
      .then((meta) => {
        if (saveRunId.current !== runId) return
        setSaveStatus({ phase: 'saved', meta })
      })
      .catch((error: unknown) => {
        if (saveRunId.current !== runId) return
        setSaveStatus({
          phase: 'error',
          message:
            error instanceof Error
              ? error.message
              : '서버 저장에 실패했습니다. 화면에는 그대로 남아 있지만, 새로고침하면 사라집니다.',
        })
      })
  }, [])

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
        saveToServer(message.report.fileName, message.products, message.report.provenance)
        return
      }

      setStatus({ phase: 'error', message: message.message })
    }

    worker.onerror = (event) => {
      setStatus({ phase: 'error', message: event.message || '워커 실행 중 오류가 발생했습니다.' })
    }

    workerRef.current = worker
    return worker
  }, [saveToServer])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  const importFile = useCallback(
    async (file: File, encoding: 'auto' | 'utf-8' | 'euc-kr' = 'auto') => {
      setStatus({ phase: 'reading', fileName: file.name })
      setSaveStatus({ phase: 'idle' })
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

  const reset = useCallback(() => {
    setStatus({ phase: 'idle' })
    setSaveStatus({ phase: 'idle' })
  }, [])

  return { status, saveStatus, importFile, reset }
}
