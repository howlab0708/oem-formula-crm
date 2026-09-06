'use client'

import { useRef } from 'react'

export type WorkspaceTab = 'consulting' | 'ingredients' | 'notes'
const tabs = [
  { id: 'consulting', label: '배합비 검색' },
  { id: 'ingredients', label: '기능성 원료' },
  { id: 'notes', label: '노트' },
] as const

export function WorkspaceTabs({ value, onChange }: { value: WorkspaceTab; onChange: (tab: WorkspaceTab) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="tablist" aria-label="업무 화면" className="flex shrink-0 gap-1 border-b border-line bg-surface px-4 lg:px-6">
      {tabs.map((tab, index) => (
        <button key={tab.id} type="button" role="tab" id={`workspace-tab-${tab.id}`}
          aria-controls={`workspace-panel-${tab.id}`} aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1} ref={(element) => { buttons.current[index] = element }}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length
            onChange(tabs[next].id)
            buttons.current[next]?.focus()
          }}
          className={`border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors ${value === tab.id
            ? 'border-accent text-accent-strong' : 'border-transparent text-ink-2 hover:bg-surface-sunken'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}
