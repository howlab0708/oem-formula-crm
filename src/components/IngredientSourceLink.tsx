'use client'

import { useId, useRef, useState } from 'react'
import { INGREDIENT_SOURCES } from '@/lib/functionalIngredients'

export function IngredientSourceLink({ url, pageUrl, label, className }: { url: string; pageUrl?: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const isDownload = url.startsWith('https://various.foodsafetykorea.go.kr/fsd/api/object-storage/download/')
    || url.startsWith('https://www.mfds.go.kr/brd/m_211/down.do?')

  if (!isDownload) return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
    {label} ↗<span className="sr-only"> (새 창)</span>
  </a>

  return (
    <div onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }
    }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen((value) => !value)} className={`${className ?? ''} text-left`}>
        {label} <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open ? <div id={id} role="group" aria-label={`${label} 이용 방법`} className="mt-2 flex flex-col items-start gap-2 rounded-md border border-line bg-surface p-3 text-[13px]">
        <a href={url} download className={className}>{url.includes('/down.do?') ? '공전 파일 다운로드 (ZIP)' : 'PDF 다운로드'}</a>
        <a href={pageUrl ?? INGREDIENT_SOURCES.codex} target="_blank" rel="noopener noreferrer" className={className}>
          공전 웹페이지로 이동 ↗<span className="sr-only"> (새 창)</span>
        </a>
      </div> : null}
    </div>
  )
}
