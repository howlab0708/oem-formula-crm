'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

/** Native modal keeps keyboard focus inside and makes the background inert. */
export function Modal({ title, children, onClose, footer, wide = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
      className={`fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] ${wide ? 'max-w-5xl' : 'max-w-xl'}`}>
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="min-w-0 break-words text-[16px] font-semibold">{title}</h2>
          <button type="button" autoFocus onClick={onClose} aria-label={`${title} 닫기`}
            className="shrink-0 rounded-md border border-line px-3 py-1.5 text-[13px] text-ink-2 hover:bg-surface-sunken">닫기 <span aria-hidden>×</span></button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-line bg-surface-muted px-5 py-3">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
