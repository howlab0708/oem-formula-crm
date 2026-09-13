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
import { customerBriefing, DEFAULT_EXPORT_VISIBILITY, EXPORT_FIELDS } from '@/lib/export/customerView'
import { loadStoredLogo, subscribeLogo } from '@/lib/export/logo'
import { loadStoredIssuer, subscribeIssuer } from '@/lib/export/issuer'
import type { freshnessLabel } from '@/lib/datasetProvenance'
import { renderBriefingCard } from '@/lib/export/renderCard'
import { Modal } from './Modal'
import { DocumentIdentity } from './DocumentIdentity'


type Props = {
  briefing: Briefing
  disabled: boolean
  freshness: ReturnType<typeof freshnessLabel>
}

type Busy = null | 'text' | 'image' | 'pdf' | 'clipboard' | 'preview' | 'logo'
const navyButton = 'border-[#40566e] bg-[#40566e] text-white hover:border-[#34465b] hover:bg-[#34465b]'
const exportButton = 'flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function ExportIcon({ kind }: { kind: 'download' | 'copy' | 'preview' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
    {kind === 'download' ? <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M4 16v4h16v-4" /></> : kind === 'copy' ? <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></> : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>
}

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
  const [exportOpen, setExportOpen] = useState(false)
  const [customer, setCustomer] = useState(false)
  const [hidden, setHidden] = useState(DEFAULT_EXPORT_VISIBILITY)
  // 로고는 등록 화면(`DocumentIdentity`)이 저장하고, 저장하면 여기로 곧바로 알려 온다.
  const logo = useSyncExternalStore(subscribeLogo, loadStoredLogo, () => null)
  const issuer = useSyncExternalStore(subscribeIssuer, loadStoredIssuer, () => null)
  const [preview, setPreview] = useState<{ image: string; text: string } | null>(null)
  const briefing = customerBriefing(original, customer, hidden)
  const sourceLines = [freshness.date, freshness.source, freshness.schedule]
  const render = () => renderBriefingCard(briefing, { logo, issuer, sourceLines, customer })
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
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" aria-haspopup="dialog" aria-expanded={exportOpen} onClick={() => { setMessage(null); setExportOpen(true) }}
        className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-[14px] font-semibold transition-colors ${navyButton}`}>
        <ExportIcon kind="download" />검색 결과 내보내기
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {exportOpen ? <Modal title="검색 결과 내보내기" onClose={() => setExportOpen(false)}>
        <div className="mb-5 rounded-lg border border-line bg-surface-sunken p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-ink">검색 결과 {original.referenceCount.toLocaleString('ko-KR')}건의 시장 요약</p>
            <span className="rounded border border-line bg-surface px-2 py-0.5 text-[12px] text-ink-2">{customer ? '고객용 보기' : '전체 항목 표시'}</span>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">현재 검색 조건과 배합·원료 통계를 한 장으로 정리합니다.</p>
          <button type="button" disabled={disabled || busy !== null}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[14px] font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void run('preview', async () => { setPreview({ image: (await render()).toDataURL('image/png'), text: exportText() }); return '현재 설정의 내보내기 미리보기입니다.' })}>
            <span className="flex items-center gap-2"><ExportIcon kind="preview" />{busy === 'preview' ? '미리보기 만드는 중…' : '저장 전 미리보기'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <section aria-label="파일로 저장">
          <h3 className="mb-2 text-[13px] font-semibold text-ink">파일로 저장</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={onSavePdf} disabled={disabled || busy !== null} className={`${exportButton} ${navyButton}`}>
              <ExportIcon kind="download" /><span><span className="block text-[15px] font-semibold">{busy === 'pdf' ? 'PDF 저장 중…' : 'PDF 저장'}</span><span className="mt-0.5 block text-[12px] opacity-85">고객 전달·인쇄용 문서</span></span>
            </button>
            <button type="button" onClick={onSaveImage} disabled={disabled || busy !== null} className={`${exportButton} border-line-strong bg-surface text-ink hover:bg-surface-sunken`}>
              <ExportIcon kind="download" /><span><span className="block text-[15px] font-semibold">{busy === 'image' ? '이미지 저장 중…' : '이미지 저장 (PNG)'}</span><span className="mt-0.5 block text-[12px] text-ink-2">보고서·자료에 첨부</span></span>
            </button>
          </div>
        </section>
        <section aria-label="복사해서 붙여넣기" className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold text-ink">복사해서 붙여넣기</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {canCopyImage ? <button type="button" onClick={onCopyImage} disabled={disabled || busy !== null} className={`${exportButton} border-line bg-surface text-ink hover:bg-surface-sunken`}>
              <ExportIcon kind="copy" /><span><span className="block text-[14px] font-semibold">{busy === 'clipboard' ? '이미지 복사 중…' : '이미지 복사'}</span><span className="mt-0.5 block text-[12px] text-ink-2">메일·메신저에 붙여넣기</span></span>
            </button> : null}
            <button type="button" onClick={onCopyText} disabled={disabled || busy !== null} className={`${exportButton} border-line bg-surface text-ink hover:bg-surface-sunken`}>
              <ExportIcon kind="copy" /><span><span className="block text-[14px] font-semibold">{busy === 'text' ? '텍스트 복사 중…' : '텍스트 복사'}</span><span className="mt-0.5 block text-[12px] text-ink-2">문구를 붙여넣어 편집</span></span>
            </button>
          </div>
        </section>
        <details className="mt-5 border-t border-line pt-4 text-[13px] text-ink-2">
          <summary className="cursor-pointer font-medium">로고 · 고객용 표시 설정{customer ? ' · 고객용 사용 중' : ''}</summary>
          <div className="mt-4"><DocumentIdentity /></div>
          <label className="mt-4 flex items-center gap-2 font-medium"><input type="checkbox" checked={customer} onChange={e => { setCustomer(e.target.checked); setPreview(null) }} />고객용 보기</label>
          <p className="mt-2 text-[12px] leading-5 text-ink-3">고객용 보기를 켜면 아래에서 선택한 항목을 모든 내보내기에서 숨깁니다.</p>
          <fieldset className="mt-3 space-y-2" disabled={!customer}><legend className="mb-2">고객용 보기에서 숨길 항목</legend>{EXPORT_FIELDS.map(field => <label key={field.key} className="flex items-center gap-2"><input type="checkbox" checked={hidden[field.key]} onChange={e => { setHidden({ ...hidden, [field.key]: e.target.checked }); setPreview(null) }} />{field.label}</label>)}</fieldset>
          <p className="mt-3 text-[12px] leading-5 text-ink-3">자유 검색어에 입력한 회사명은 자동으로 가리지 않습니다. 미리보기에서 확인해 주세요.</p>
        </details>
        {disabled ? <p className="mt-3 text-[13px] text-ink-3">내보낼 검색 결과가 없습니다. 검색 조건을 변경해 주세요.</p> : null}
        {message ? <p role="status" className="mt-3 rounded-md bg-surface-sunken p-3 text-[13px] text-ink-2">{message}</p> : null}
      </Modal> : null}
      {preview ? <ExportPreview preview={preview} onClose={() => setPreview(null)} busy={busy} disabled={disabled} message={message} onSavePdf={onSavePdf} onSaveImage={onSaveImage} /> : null}
    </div>
  )
}

function ExportPreview({ preview, onClose, busy, disabled, message, onSavePdf, onSaveImage }: {
  preview: { image: string; text: string }; onClose: () => void; busy: Busy; disabled: boolean; message: string | null
  onSavePdf: () => Promise<void>; onSaveImage: () => Promise<void>
}) {
  return <Modal title="내보내기 미리보기" onClose={onClose} wide footer={<div className="flex flex-wrap items-center justify-end gap-2">
    <button type="button" onClick={onClose} className="mr-auto rounded-md border border-line px-3 py-2 text-[13px] text-ink-2 hover:bg-surface-sunken">← 형식·설정으로 돌아가기</button>
    <button type="button" onClick={onSaveImage} disabled={disabled || busy !== null} className="rounded-md border border-line-strong px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-50">{busy === 'image' ? '이미지 저장 중…' : '이미지 저장 (PNG)'}</button>
    <button type="button" onClick={onSavePdf} disabled={disabled || busy !== null} className={`rounded-md border px-3 py-2 text-[13px] font-semibold disabled:opacity-50 ${navyButton}`}>{busy === 'pdf' ? 'PDF 저장 중…' : 'PDF 저장'}</button>
    {message ? <p role="status" className="w-full text-right text-[12px] text-ink-2">{message}</p> : null}
  </div>}>
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.image} alt="로고와 고객용 설정이 반영된 브리핑" className="w-full" />
      <details className="mt-3 text-[13px]"><summary>텍스트 복사 내용 확인</summary><pre className="mt-2 whitespace-pre-wrap break-words">{preview.text}</pre></details>
    </div>
  </Modal>
}
