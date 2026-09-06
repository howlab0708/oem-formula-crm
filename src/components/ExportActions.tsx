'use client'

import { useCallback, useEffect, useState, useSyncExternalStore, useRef } from 'react'
import type { Briefing } from '@/lib/export/briefing'
import { briefingToText } from '@/lib/export/briefing'
import {
  copyCanvasToClipboard,
  copyText,
  downloadCanvasAsPdf,
  downloadCanvasAsPng,
} from '@/lib/export/download'
import { customerBriefing, DEFAULT_EXPORT_VISIBILITY, EXPORT_FIELDS } from '@/lib/export/customerView'
import { loadStoredLogo, readLogo, storeLogo } from '@/lib/export/logo'
import type { freshnessLabel } from '@/lib/datasetProvenance'
import { renderBriefingCard } from '@/lib/export/renderCard'

type Props = {
  briefing: Briefing
  disabled: boolean
  freshness: ReturnType<typeof freshnessLabel>
}

type Busy = null | 'text' | 'image' | 'pdf' | 'clipboard' | 'preview' | 'logo'

/** 값이 바뀌지 않는 브라우저 기능 감지용 구독자. */
const subscribeNever = () => () => {}

function fileStem(briefing: Briefing): string {
  const condition =
    briefing.conditions.find((c) => c.group === '주원료')?.label ??
    briefing.standardForm?.label ??
    '전체'
  const safe = condition.replace(/[\\/:*?"<>|\s]+/g, '_')
  return `OEM브리핑_${safe}_${briefing.generatedAt.replace(/\./g, '')}`
}

/**
 * 상담 브리핑 내보내기.
 * 텍스트 / 이미지 / PDF 모두 같은 Briefing 객체를 렌더하므로 숫자가 어긋나지 않는다.
 */
export function ExportActions({ briefing: original, disabled, freshness }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customer, setCustomer] = useState(false)
  const [hidden, setHidden] = useState(DEFAULT_EXPORT_VISIBILITY)
  // undefined 는 '이번 화면에서 아직 건드리지 않음'. 그때는 저장해 둔 로고를 쓴다.
  const [chosenLogo, setChosenLogo] = useState<string | null | undefined>(undefined)
  // 저장해 둔 로고는 클라이언트에서만 읽는다(서버 렌더에는 없는 값이므로 하이드레이션 불일치 방지).
  const storedLogo = useSyncExternalStore(subscribeNever, loadStoredLogo, () => null)
  const logo = chosenLogo === undefined ? storedLogo : chosenLogo
  const [preview, setPreview] = useState<{ image: string; text: string } | null>(null)
  const briefing = customerBriefing(original, customer, hidden)
  const sourceLines = [freshness.date, freshness.source, freshness.schedule]
  const render = () => renderBriefingCard(briefing, { logo, sourceLines, customer })
  const exportText = () => briefingToText(briefing, freshness.source) + '\n\n' + sourceLines.join('\n')
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<string | null>(null)

  // 서버 렌더에서는 false, 클라이언트에서만 실제 지원 여부를 읽는다(하이드레이션 불일치 방지).
  const canCopyImage = useSyncExternalStore(
    subscribeNever,
    () => typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write),
    () => false,
  )

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(null), 3200)
    return () => window.clearTimeout(id)
  }, [message])

  const run = useCallback(
    async (kind: Exclude<Busy, null>, task: () => Promise<string>) => {
      setBusy(kind)
      try {
        setMessage(await task())
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '내보내기에 실패했습니다.')
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  const onCopyText = () =>
    run('text', async () => {
      const ok = await copyText(exportText())
      return ok ? '브리핑 텍스트를 복사했습니다.' : '복사 권한이 거부되었습니다.'
    })

  const onSaveImage = () =>
    run('image', async () => {
      const canvas = await render()
      await downloadCanvasAsPng(canvas, `${fileStem(briefing)}.png`)
      return '브리핑 이미지를 저장했습니다.'
    })

  const onCopyImage = () =>
    run('clipboard', async () => {
      const canvas = await render()
      const ok = await copyCanvasToClipboard(canvas)
      return ok ? '브리핑 이미지를 클립보드에 복사했습니다.' : '이미지 복사를 지원하지 않는 브라우저입니다.'
    })

  const onSavePdf = () =>
    run('pdf', async () => {
      const canvas = await render()
      await downloadCanvasAsPdf(canvas, `${fileStem(briefing)}.pdf`)
      return '브리핑 PDF를 저장했습니다.'
    })

  return (
    <div className="relative flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
      {message ? (
        <p aria-live="polite" className="w-full text-right text-[12px] text-ink-3">
          {message}
        </p>
      ) : null}

      <button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} className="rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2">내보내기 설정{customer ? ' · 고객용' : ''}</button>
      {settingsOpen ? <div className="absolute right-0 top-full z-50 mt-2 max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-line bg-surface p-4 text-[13px] text-ink-2 shadow-lg" aria-label="내보내기 설정">
        <div className="flex items-center justify-between"><strong>내보내기 설정</strong><button type="button" className="underline" onClick={() => setSettingsOpen(false)}>닫기</button></div>
        <label className="mt-3 block">회사 로고 (PNG·JPG, 2MB 이하)
          <input type="file" accept="image/png,image/jpeg" disabled={busy !== null} className="mt-2 w-full text-[12px]" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''
            if (file) void run('logo', async () => {
              const next = await readLogo(file)
              const saved = storeLogo(next)
              setChosenLogo(next); setPreview(null)
              return saved ? '로고를 저장했습니다. 다음 접속에도 적용됩니다.' : '로고를 적용했습니다. 이 브라우저에 저장하지 못해 새로고침하면 사라집니다.'
            })
          }} />
        </label>
        {logo ? <div className="mt-2 flex items-center gap-3">
          {/* Uploaded raster, processed locally; no remote image request. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="내보내기 회사 로고" className="h-10 max-w-40 object-contain" />
          <button type="button" className="underline" onClick={() => { storeLogo(null); setChosenLogo(null); setPreview(null) }}>로고 제거</button>
        </div> : null}
        <p className="mt-2 text-[12px] text-ink-3">로고는 이미지·PDF 내보내기 맨 위에 들어갑니다. 이 브라우저에만 저장하고 서버로 보내지 않으므로, 공용 PC 에서는 사용 후 로고를 제거해 주세요.</p>
        <label className="mt-4 flex items-center gap-2 font-medium"><input type="checkbox" checked={customer} onChange={e => { setCustomer(e.target.checked); setPreview(null) }} />고객용 보기</label>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">기본으로 숨기는 항목은 없습니다. 고객용 보기를 켜면 아래에서 선택한 항목만 모든 내보내기에서 숨깁니다. 검색 결과 수치는 유지됩니다.</p>
        <fieldset className="mt-3 space-y-2"><legend className="mb-2">고객용 보기에서 숨길 항목</legend>{EXPORT_FIELDS.map(field => <label key={field.key} className="flex items-center gap-2"><input type="checkbox" checked={hidden[field.key]} onChange={e => { setHidden({ ...hidden, [field.key]: e.target.checked }); setPreview(null) }} />{field.label}</label>)}</fieldset>
        <p className="mt-2 text-[12px] text-ink-3">자유 검색어에 입력한 회사명 등 다른 텍스트는 자동으로 가리지 않습니다. 미리보기에서 확인해 주세요.</p>
        <button type="button" disabled={disabled || busy !== null} className="mt-4 rounded border border-line px-3 py-2 disabled:opacity-50" onClick={() => void run('preview', async () => { setPreview({ image: (await render()).toDataURL('image/png'), text: exportText() }); return '현재 설정의 내보내기 미리보기입니다.' })}>내보내기 미리보기</button>
      </div> : null}
      {preview ? <ExportPreview preview={preview} onClose={() => setPreview(null)} /> : null}
      <ActionButton onClick={onCopyText} disabled={disabled || busy !== null} busy={busy === 'text'}>
        텍스트 복사
      </ActionButton>
      <ActionButton
        onClick={onSaveImage}
        disabled={disabled || busy !== null}
        busy={busy === 'image'}
      >
        이미지 저장
      </ActionButton>
      {canCopyImage ? (
        <ActionButton
          onClick={onCopyImage}
          disabled={disabled || busy !== null}
          busy={busy === 'clipboard'}
        >
          이미지 복사
        </ActionButton>
      ) : null}
      <ActionButton
        onClick={onSavePdf}
        disabled={disabled || busy !== null}
        busy={busy === 'pdf'}
        primary
      >
        PDF 저장
      </ActionButton>
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  busy,
  primary = false,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  busy: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
        primary
          ? 'bg-accent text-white hover:bg-accent-strong'
          : 'border border-line bg-surface text-ink-2 hover:bg-surface-sunken'
      }`}
    >
      {busy ? '처리 중…' : children}
    </button>
  )
}

function ExportPreview({ preview, onClose }: { preview: { image: string; text: string }; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={dialogRef} onCancel={onClose} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-hidden rounded-lg bg-surface p-4 backdrop:bg-ink/40" aria-label="내보내기 미리보기">
    <div className="flex items-center justify-between"><strong className="text-[14px]">내보내기 미리보기</strong><button type="button" autoFocus className="rounded border border-line px-3 py-1 text-[13px]" onClick={onClose}>미리보기 닫기</button></div>
    <div className="mt-3 max-h-[calc(100dvh-7rem)] overflow-auto">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.image} alt="로고와 고객용 설정이 반영된 브리핑" className="w-full" />
      <details className="mt-3 text-[13px]"><summary>텍스트 복사 내용 확인</summary><pre className="mt-2 whitespace-pre-wrap break-words">{preview.text}</pre></details>
    </div>
  </dialog>
}
