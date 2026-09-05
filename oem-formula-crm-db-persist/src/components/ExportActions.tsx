'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Briefing } from '@/lib/export/briefing'
import { briefingToText } from '@/lib/export/briefing'
import {
  copyCanvasToClipboard,
  copyText,
  downloadCanvasAsPdf,
  downloadCanvasAsPng,
} from '@/lib/export/download'
import { renderBriefingCard } from '@/lib/export/renderCard'

type Props = {
  briefing: Briefing
  disabled: boolean
}

type Busy = null | 'text' | 'image' | 'pdf' | 'clipboard'

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
export function ExportActions({ briefing, disabled }: Props) {
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
      const ok = await copyText(briefingToText(briefing))
      return ok ? '브리핑 텍스트를 복사했습니다.' : '복사 권한이 거부되었습니다.'
    })

  const onSaveImage = () =>
    run('image', async () => {
      const canvas = await renderBriefingCard(briefing)
      await downloadCanvasAsPng(canvas, `${fileStem(briefing)}.png`)
      return '브리핑 이미지를 저장했습니다.'
    })

  const onCopyImage = () =>
    run('clipboard', async () => {
      const canvas = await renderBriefingCard(briefing)
      const ok = await copyCanvasToClipboard(canvas)
      return ok ? '브리핑 이미지를 클립보드에 복사했습니다.' : '이미지 복사를 지원하지 않는 브라우저입니다.'
    })

  const onSavePdf = () =>
    run('pdf', async () => {
      const canvas = await renderBriefingCard(briefing)
      await downloadCanvasAsPdf(canvas, `${fileStem(briefing)}.pdf`)
      return '브리핑 PDF를 저장했습니다.'
    })

  return (
    <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
      {message ? (
        <p aria-live="polite" className="hidden text-[11px] text-ink-3 lg:block">
          {message}
        </p>
      ) : null}

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
      className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors disabled:opacity-50 ${
        primary
          ? 'bg-accent text-white hover:bg-accent-strong'
          : 'border border-line bg-surface text-ink-2 hover:bg-surface-sunken'
      }`}
    >
      {busy ? '처리 중…' : children}
    </button>
  )
}
