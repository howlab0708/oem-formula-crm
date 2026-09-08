'use client'

/**
 * 고객 배포용 배합 제안서 내보내기.
 *
 * 원가 내역(원료단가·금액·간접비·공급가)은 어떤 설정에서도 PDF 에 들어가지 않는다.
 * 고르는 것은 "고객이 알아야 하는 값을 넣을지" 뿐이다 - 최종 단가·수량 구간·별도
 * 청구 항목. 무엇이 들어가는지 미리보기로 눌러 확인한 뒤 내보내도록 했다.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { downloadPagesAsPdf } from '@/lib/export/download'
import { loadStoredLogo } from '@/lib/export/logo'
import { DEFAULT_SHEET_EXPORT, renderFormulaSheetPages, type SheetExportOptions } from '@/lib/export/renderFormulaSheet'
import type { Tier, Totals } from '@/lib/formulaDesign/calc'
import type { FormulaSheet } from '@/lib/formulaDesign/types'

const buttonClass =
  'rounded-md border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50'
const primaryClass =
  'rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50'

const subscribeNever = () => () => {}

const TOGGLES: { key: 'showPrice' | 'showExtras' | 'showTiers'; label: string; hint: string }[] = [
  { key: 'showPrice', label: '견적 금액', hint: '최종 단가·합계·결제 금액' },
  { key: 'showTiers', label: '수량 구간별 단가', hint: '1,000 / 3,000 / 5,000set 비교' },
  { key: 'showExtras', label: '별도 청구 항목', hint: '초도 1회성 비용' },
]

function fileStem(sheet: FormulaSheet): string {
  const name = sheet.spec.productName || sheet.spec.customer || '배합제안서'
  const date = (sheet.spec.quotedOn || '').replace(/[^0-9]/g, '') || '제안'
  return `${name.replace(/[\\/:*?"<>|\s]+/g, '_')}_${date}`
}

type Props = { sheet: FormulaSheet; totals: Totals; tiers: Tier[] }

export function SheetExportPanel({ sheet, totals, tiers }: Props) {
  const [options, setOptions] = useState<SheetExportOptions>(DEFAULT_SHEET_EXPORT)
  const [busy, setBusy] = useState<'pdf' | 'preview' | null>(null)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<string[] | null>(null)
  // 저장해 둔 회사 로고는 클라이언트에서만 읽는다(하이드레이션 불일치 방지).
  const storedLogo = useSyncExternalStore(subscribeNever, loadStoredLogo, () => null)

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(''), 3200)
    return () => window.clearTimeout(id)
  }, [message])

  const render = () => renderFormulaSheetPages(sheet, totals, tiers, { ...options, logo: storedLogo })

  const run = async (kind: 'pdf' | 'preview') => {
    setBusy(kind)
    try {
      const pages = await render()
      if (kind === 'pdf') {
        await downloadPagesAsPdf(pages, `${fileStem(sheet)}.pdf`)
        setMessage(`배합 제안서 PDF(${pages.length}쪽)를 저장했습니다.`)
      } else {
        setPreview(pages.map((page) => page.toDataURL('image/png')))
        setMessage('현재 설정으로 만들어질 문서입니다.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '내보내기에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="sheet-export-title" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="sheet-export-title" className="text-[14px] font-semibold text-ink">
            고객 배포용 PDF
          </h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            제품 규격 · 구성 및 포장지 · 최종 배합표만 담습니다. 원료단가·금액·간접비·공급가는 어떤 설정에서도 들어가지
            않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass} onClick={() => run('preview')} disabled={busy !== null}>
            {busy === 'preview' ? '만드는 중…' : '미리보기'}
          </button>
          <button type="button" className={primaryClass} onClick={() => run('pdf')} disabled={busy !== null}>
            {busy === 'pdf' ? '만드는 중…' : 'PDF 저장'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block text-[12px] font-medium text-ink-2">문서 제목</span>
          <input
            value={options.title}
            maxLength={40}
            onChange={(event) => {
              setOptions({ ...options, title: event.target.value })
              setPreview(null)
            }}
            className="w-56 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink"
          />
        </label>
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
          <legend className="mb-1 w-full text-[12px] font-medium text-ink-2">포함할 항목</legend>
          {TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={options[toggle.key]}
                onChange={(event) => {
                  setOptions({ ...options, [toggle.key]: event.target.checked })
                  setPreview(null)
                }}
              />
              {toggle.label}
              <span className="text-[11px] text-ink-3">{toggle.hint}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <p className="mt-2 text-[12px] text-ink-3">
        회사 로고는 ‘배합비 검색’ 탭의 내보내기 설정에서 등록한 로고를 함께 씁니다.
        {storedLogo ? ' 등록된 로고가 문서 맨 위에 들어갑니다.' : ' 지금은 등록된 로고가 없습니다.'}
      </p>

      {message ? (
        <p aria-live="polite" className="mt-2 text-[12px] text-ink-2">
          {message}
        </p>
      ) : null}

      {preview ? <PreviewDialog pages={preview} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}

function PreviewDialog({ pages, onClose }: { pages: string[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      aria-label="배합 제안서 미리보기"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-hidden rounded-lg bg-surface p-4 backdrop:bg-ink/40"
    >
      <div className="flex items-center justify-between">
        <strong className="text-[14px]">배합 제안서 미리보기 · {pages.length}쪽</strong>
        <button type="button" autoFocus onClick={onClose} className="rounded border border-line px-3 py-1 text-[13px]">
          닫기
        </button>
      </div>
      <div className="mt-3 max-h-[calc(100dvh-8rem)] space-y-4 overflow-auto bg-canvas p-3">
        {pages.map((page, index) => (
          // 로컬에서 만든 캔버스 이미지다. 외부 요청이 없다.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={page} alt={`배합 제안서 ${index + 1}쪽`} className="w-full shadow" />
        ))}
      </div>
    </dialog>
  )
}
