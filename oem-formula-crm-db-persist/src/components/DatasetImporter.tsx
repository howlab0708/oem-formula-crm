'use client'

import { useRef, useState } from 'react'
import type { ImportStatus, SaveStatus } from '@/hooks/useCsvImport'
import { formatInt, formatDuration, formatPercent } from '@/lib/format'

type Encoding = 'auto' | 'utf-8' | 'euc-kr'

type Props = {
  status: ImportStatus
  saveStatus: SaveStatus
  source: 'seed' | 'csv' | 'db'
  productCount: number
  onFile: (file: File, encoding: Encoding) => void
  onRestoreSample: () => void
}

export function DatasetImporter({
  status,
  saveStatus,
  source,
  productCount,
  onFile,
  onRestoreSample,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [encoding, setEncoding] = useState<Encoding>('auto')
  const [showDetail, setShowDetail] = useState(false)

  const busy = status.phase === 'reading' || status.phase === 'parsing'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">식약처 품목제조보고 연동</span>
        <span className="text-[11px] text-ink-3">
          {source === 'seed' ? '예시 데이터' : source === 'db' ? '저장된 데이터' : '업로드 데이터'} ·{' '}
          {formatInt(productCount)}건
        </span>
      </div>

      <p className="mt-1 text-[11px] leading-4 text-ink-3 keep-all">
        원본 CSV 를 그대로 올리세요. 파싱은 백그라운드 워커에서 처리해 화면이 멈추지 않고, 완료되면
        서버에 자동 저장되어 다음에 접속할 때도 그대로 남아 있습니다.{' '}
        <a
          href="/sample-reference.csv"
          download
          className="text-ink-2 underline underline-offset-2 hover:text-ink"
        >
          예시 파일
        </a>
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file, encoding)
          event.target.value = ''
        }}
      />

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[12px] font-medium text-ink transition-colors hover:bg-surface-sunken disabled:text-ink-3"
        >
          {busy ? '불러오는 중…' : 'CSV 선택'}
        </button>
        {source !== 'seed' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRestoreSample}
            className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            예시로
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="encoding" className="text-[11px] text-ink-3">
          인코딩
        </label>
        <select
          id="encoding"
          value={encoding}
          onChange={(event) => setEncoding(event.target.value as Encoding)}
          className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink-2"
        >
          <option value="auto">자동 감지 (권장)</option>
          <option value="utf-8">UTF-8 고정</option>
          <option value="euc-kr">EUC-KR 고정</option>
        </select>
      </div>

      {status.phase === 'parsing' ? (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${Math.min(Math.max(status.ratio, 0.02), 1) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3 tnum">
            {formatInt(status.parsedRows)}행 처리 · {formatPercent(Math.min(status.ratio, 1))}
          </p>
        </div>
      ) : null}

      {status.phase === 'error' ? (
        <p className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-2 text-[11px] leading-4 text-danger keep-all">
          {status.message}
        </p>
      ) : null}

      {status.phase === 'done' ? (
        <div className="mt-3 rounded-md border border-line bg-surface-sunken px-2.5 py-2">
          <p className="text-[11px] leading-4 text-ink-2 keep-all">
            <span className="font-medium text-ink">{formatInt(status.report.accepted)}건</span> 적재
            · {status.report.encoding} · {formatDuration(status.report.elapsedMs)}
            {status.report.skipped > 0
              ? ` · ${formatInt(status.report.skipped)}행 건너뜀`
              : ''}
          </p>
          <button
            type="button"
            onClick={() => setShowDetail((prev) => !prev)}
            className="mt-1 text-[11px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            {showDetail ? '열 매핑 접기' : '열 매핑 보기'}
          </button>

          {showDetail ? (
            <dl className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
              {Object.entries(status.report.columnMap).map(([source, target]) => (
                <div key={source} className="flex items-start justify-between gap-2 text-[11px]">
                  <dt className="min-w-0 truncate text-ink-3" title={source}>
                    {source}
                  </dt>
                  <dd className="shrink-0 text-ink-2">{target}</dd>
                </div>
              ))}
              {status.report.unmappedHeaders.length > 0 ? (
                <p className="mt-1 text-[11px] leading-4 text-ink-3 keep-all">
                  미사용 열 {status.report.unmappedHeaders.length}개
                </p>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}

      {saveStatus.phase === 'saving' ? (
        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{
                width: `${saveStatus.total > 0 ? Math.min((saveStatus.sent / saveStatus.total) * 100, 100) : 5}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3 tnum">
            서버에 저장 중 · {formatInt(saveStatus.sent)}/{formatInt(saveStatus.total)}건
          </p>
        </div>
      ) : null}

      {saveStatus.phase === 'saved' ? (
        <p className="mt-2 text-[11px] leading-4 text-ink-3 keep-all">
          서버 저장 완료 · 다음 접속에도 이 데이터가 유지됩니다.
        </p>
      ) : null}

      {saveStatus.phase === 'error' ? (
        <p className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-2 text-[11px] leading-4 text-danger keep-all">
          서버 저장 실패: {saveStatus.message} (화면에는 남아 있지만, 새로고침하면 사라집니다)
        </p>
      ) : null}
    </div>
  )
}
