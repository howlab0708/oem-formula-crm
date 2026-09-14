'use client'

import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Modal } from '@/components/Modal'
import type { freshnessLabel } from '@/lib/datasetProvenance'

export type WorkspaceTab = 'consulting' | 'design' | 'ingredients' | 'notes'

/** 화면 이름은 사이드바와 상단 제목이 함께 쓴다. 두 곳이 어긋나지 않게 한 곳에 둔다. */
export const WORKSPACE_TABS = [
  { id: 'consulting', label: '배합비 검색' },
  { id: 'design', label: '배합 설계' },
  { id: 'ingredients', label: '기능성 원료 조회' },
  { id: 'notes', label: '노트' },
] as const

export function tabLabel(tab: WorkspaceTab) {
  return WORKSPACE_TABS.find((item) => item.id === tab)?.label ?? ''
}

/*
 * 접기는 넓은 화면에서만 쓴다. 좁은 화면에서는 사이드바가 서랍으로 열리므로
 * 접을 이유가 없다. CSS 로만 감추면 접힌 줄과 펼친 줄이 둘 다 살아 있어
 * 즐겨찾기·연동이 두 번 요청을 보내므로, 폭을 직접 보고 한쪽만 그린다.
 */
const DESKTOP = '(min-width: 1024px)'
const subscribeDesktop = (callback: () => void) => {
  const query = window.matchMedia(DESKTOP)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

/*
 * 사이드바의 여백 규칙 - 한 곳에 적어 두고 모든 구획이 같은 값을 쓴다.
 * - 좌우 여백 16px. 메뉴 줄은 배경이 8px 안쪽에서 시작하고 글자가 다시 8px 들어가
 *   다른 구획의 제목과 시작선이 맞는다.
 * - 구획 사이 간격 24px. 구분선은 맨 위(이름)와 맨 아래(데이터)에만 긋는다.
 */
const SIDE = 'px-4'
const ROW = 'mx-2 px-2'

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function TabIcon({ tab }: { tab: WorkspaceTab }) {
  const common = { ...iconProps, className: 'h-[17px] w-[17px] shrink-0' }
  if (tab === 'consulting') return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
  if (tab === 'design') return <svg {...common}><path d="M9 3h6" /><path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" /><path d="M7.5 15h9" /></svg>
  if (tab === 'ingredients') return <svg {...common}><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" /><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" /></svg>
  return <svg {...common}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /><path d="M9 13h7" /><path d="M9 17h5" /></svg>
}

/** 접었을 때 쓰는 아이콘 단추. 이름은 말풍선과 스크린리더 모두에 남긴다. */
function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="mx-2 flex h-9 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-sunken hover:text-ink">
      {children}
    </button>
  )
}

/**
 * 작업 화면의 왼쪽 기둥.
 *
 * 상단 탭과 조건 레일로 나뉘어 있던 두 겹의 내비게이션을 한 겹으로 합친 자리다.
 * 위에서부터 업무 메뉴 · 즐겨찾기 · 데이터(연동 상태와 출처) 세 묶음이고,
 * 검색 조건은 본문 맨 위 조건 줄(`FilterBar`)로 올라갔다.
 *
 * 접으면 아이콘 줄만 남는다. 즐겨찾기와 데이터는 사라지지 않고 아이콘으로 남아
 * 작은 창으로 열린다 - 접었다는 이유로 못 하는 일이 생기지 않게 한다.
 */
export function WorkspaceSidebar({
  deployLabel,
  value,
  onChange,
  freshness,
  dateTitle,
  favorites,
  importer,
  collapsed,
  onToggleCollapsed,
}: {
  /** 회사 이름표(`APP_LABEL`). 배포가 여러 개일 때 화면만 보고 구분한다. */
  deployLabel: string
  value: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
  freshness: ReturnType<typeof freshnessLabel>
  /** 기준일 줄의 설명 말풍선. 원본 최종수정일이 있을 때만 붙는다. */
  dateTitle?: string
  /** 검색 조건 즐겨찾기. 배합비 검색 화면에서만 쓰므로 없을 수 있다. */
  favorites: ReactNode
  importer: ReactNode
  /** 넓은 화면에서 아이콘 줄로 접은 상태. */
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [railPanel, setRailPanel] = useState<null | 'favorites' | 'data'>(null)
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false)
  const rail = desktop && collapsed

  const dataBlock = (
    <>
      {importer}
      <div className="mt-2.5" aria-label="데이터 출처와 최신성">
        <p title={dateTitle}>{freshness.date}</p>
        <p className="mt-0.5 keep-all">
          {freshness.url
            ? <a href={freshness.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{freshness.source}</a>
            : freshness.source} · {freshness.schedule}
        </p>
      </div>
    </>
  )

  return (
    <aside aria-label="업무 화면과 데이터" className="flex h-full flex-col overflow-hidden border-r border-line bg-surface">
      <div className={`flex h-[60px] shrink-0 items-center gap-2 border-b border-line ${rail ? 'justify-center px-2' : SIDE}`}>
        {rail ? null : (
          <div className="min-w-0 flex-1">
            {deployLabel ? <p className="text-[12px] leading-4 font-semibold text-accent-strong">{deployLabel}</p> : null}
            <h1 className="text-[15px] leading-5 font-semibold text-ink keep-all">건기식 OEM 배합비 솔루션</h1>
          </div>
        )}
        {/* 접기는 넓은 화면에서만 의미가 있다. 서랍으로 열리는 좁은 화면에서는 숨긴다. */}
        <button
          type="button"
          onClick={() => { setRailPanel(null); onToggleCollapsed() }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-sunken hover:text-ink lg:flex"
        >
          <svg {...iconProps} strokeWidth={1.8} className="h-[18px] w-[18px]"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
        </button>
      </div>

      <nav role="tablist" aria-orientation="vertical" aria-label="업무 화면" className="flex shrink-0 flex-col gap-0.5 py-2">
        {WORKSPACE_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`workspace-tab-${tab.id}`}
            aria-controls={`workspace-panel-${tab.id}`}
            aria-selected={value === tab.id}
            aria-label={tab.label}
            tabIndex={value === tab.id ? 0 : -1}
            ref={(element) => { buttons.current[index] = element }}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? WORKSPACE_TABS.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + WORKSPACE_TABS.length) % WORKSPACE_TABS.length
              onChange(WORKSPACE_TABS[next].id)
              buttons.current[next]?.focus()
            }}
            title={rail ? tab.label : undefined}
            className={`flex h-9 items-center gap-2.5 rounded-md text-left text-[13.5px] transition-colors ${ROW} ${
              rail ? 'justify-center px-0' : ''
            } ${
              value === tab.id
                ? 'bg-accent-soft font-semibold text-accent-strong'
                : 'font-medium text-ink-2 hover:bg-surface-sunken'
            }`}
          >
            <TabIcon tab={tab.id} />
            {rail ? null : <span className="truncate">{tab.label}</span>}
          </button>
        ))}
      </nav>

      {rail ? (
        // 접은 줄: 즐겨찾기와 데이터는 아이콘으로 남기고 작은 창으로 연다.
        <div className="flex flex-1 flex-col gap-0.5 pt-2">
          {favorites ? (
            <RailButton label="즐겨찾기" onClick={() => setRailPanel('favorites')}>
              <svg {...iconProps} className="h-[17px] w-[17px]"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" /></svg>
            </RailButton>
          ) : null}
          <RailButton label="데이터 상태와 출처" onClick={() => setRailPanel('data')}>
            <svg {...iconProps} className="h-[17px] w-[17px]"><ellipse cx="12" cy="6" rx="7.5" ry="3" /><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" /><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></svg>
          </RailButton>
        </div>
      ) : (
        <>
          {/* 가운데는 즐겨찾기. 남는 여백은 그대로 둔다. */}
          <div className={`min-h-0 flex-1 overflow-y-auto scroll-contain ${favorites ? `pt-4 ${SIDE}` : ''}`}>
            {favorites}
          </div>

          <div className={`shrink-0 border-t border-line py-3.5 text-[12px] leading-4 text-ink-3 ${SIDE}`}>
            {dataBlock}
          </div>
        </>
      )}

      {/*
        접은 줄에서만 연다. 창이 넓어지거나 사이드바를 펴면 저절로 닫힌다 - 그러지 않으면
        같은 즐겨찾기·연동이 본문과 창에 두 번 살아 있고, 닫히지 않은 창이 화면을 덮는다.
      */}
      {rail && railPanel ? (
        <Modal title={railPanel === 'favorites' ? '즐겨찾기' : '데이터 상태와 출처'} onClose={() => setRailPanel(null)}>
          {railPanel === 'favorites' ? favorites : <div className="text-[12px] leading-4 text-ink-3">{dataBlock}</div>}
        </Modal>
      ) : null}
    </aside>
  )
}
