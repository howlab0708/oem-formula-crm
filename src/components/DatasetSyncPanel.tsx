'use client'

import { useCallback, useEffect, useState } from 'react'

type Status = {
  configured: boolean; enabled: boolean; canRun: boolean; generation: string | null; lastSuccess: string | null
  run: null | { state: 'running' | 'paused' | 'complete' | 'failed'; busy: boolean; fetched: number; expected: number | null; added: number; changed: number; retained: number; removed: number; message: string | null; finishedAt: string | null }
}
const dateLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

export function DatasetSyncPanel({ productCount, generation, onRefresh }: { productCount: number; generation: string | null; onRefresh: () => Promise<void> }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pollAttempt, setPollAttempt] = useState(0)
  const read = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/products/sync', { cache: 'no-store', signal })
    const body = await response.json()
    if (!response.ok) throw new Error('연동 상태를 확인하지 못했습니다. 다시 확인해 주세요.')
    setStatus(body)
    setStatusError(null)
    return body as Status
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      let delay = 60_000
      try {
        const next = await read(controller.signal)
        if (next.run?.busy) delay = 3000
      } catch {
        if (!controller.signal.aborted) setStatusError('연동 상태를 확인하지 못했습니다. 기존 데이터는 계속 이용할 수 있습니다.')
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [read, pollAttempt])

  const start = async () => {
    setPending(true); setError(null)
    try {
      const response = await fetch('/api/products/sync', { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? '업데이트를 시작하지 못했습니다.')
      await read()
      setPollAttempt(value => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '업데이트를 시작하지 못했습니다.') }
    finally { setPending(false) }
  }
  const run = status?.run
  const newData = Boolean(status?.generation && status.generation !== generation)
  const busy = pending || Boolean(run?.busy)
  const visibleError = error ?? statusError
  const button = 'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-50'

  return <section className="rounded-lg border border-line bg-surface p-3" aria-labelledby="dataset-sync-title">
    <h2 id="dataset-sync-title" className="text-[14px] font-semibold text-ink">식약처 자동 연동</h2>
    <p className="mt-2 text-[13px] text-ink-2">{generation ? '저장된 데이터' : '예시 레퍼런스'} <strong>{productCount.toLocaleString('ko-KR')}건</strong></p>
    <p className="mt-1 text-[12px] leading-5 text-ink-3">{!status ? '연동 상태 확인 중…' : status.configured ? '매일 밤 10시대 자동 확인 · 한국 시간' : status.lastSuccess ? '공유 데이터는 관리 배포에서 갱신합니다.' : '자동 연동 준비 중 · 기존 데이터 이용 가능'}</p>
    {status?.lastSuccess && <p className="mt-1 text-[12px] text-ink-3">최근 반영 {dateLabel(status.lastSuccess)}</p>}
    {run && <div className="my-2 text-[12px] leading-5 text-ink-2" role="status" aria-live="polite">
      {run.busy ? <><p>식약처 자료 확인 중 {run.fetched.toLocaleString('ko-KR')}{run.expected ? ` / ${run.expected.toLocaleString('ko-KR')}건` : '건'}</p>{run.expected && <progress className="mt-1 w-full accent-blue-600" aria-label="식약처 자료 수집" value={run.fetched} max={run.expected} />}</>
        : run.state === 'complete' ? <>
          <p>신규 {run.added.toLocaleString('ko-KR')}건 · 변경 {run.changed.toLocaleString('ko-KR')}건 · 삭제 {(run.removed ?? 0).toLocaleString('ko-KR')}건</p>
          {run.retained > 0 ? <p>최신 원본에서 제외된 {run.retained.toLocaleString('ko-KR')}건은 다음 업데이트에서 삭제됩니다.</p>
            : <p>최신 식약처 원본에 있는 제품만 반영합니다.</p>}
        </>
          : <p>{run.message ?? '수집이 중단됐습니다. 이어받기로 다시 진행할 수 있습니다.'}</p>}
    </div>}
    {visibleError && <p role="alert" className="my-2 text-[12px] leading-5 text-red-700">{visibleError}</p>}
    {newData ? <button type="button" className={`${button} mt-3`} disabled={refreshing} onClick={async () => {
      setRefreshing(true); setError(null)
      try { await onRefresh() } catch { setError('새 자료를 불러오지 못했습니다. 다시 시도해 주세요.') }
      finally { setRefreshing(false) }
    }}>{refreshing ? '새 자료 불러오는 중…' : '업데이트된 자료 보기'}</button>
      : status?.canRun ? <button type="button" disabled={busy} className={`${button} mt-3`} onClick={start}>{busy ? '업데이트 중…' : run && ['paused','running'].includes(run.state) ? '중단된 업데이트 이어받기' : '지금 업데이트'}</button> : null}
    {visibleError && <button type="button" className="mt-2 text-[12px] text-accent-strong underline underline-offset-2" onClick={() => { setError(null); setStatusError(null); setPollAttempt(value => value + 1) }}>연동 상태 다시 확인</button>}
    <p className="mt-2 text-[11px] leading-4 text-ink-3">자료 검증이 끝나면 반영합니다. 작업 중인 배합 설계 시트는 유지됩니다.</p>
  </section>
}
