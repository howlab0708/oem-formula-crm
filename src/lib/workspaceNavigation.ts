import type { WorkspaceTab } from '@/components/WorkspaceSidebar'

export type WorkspaceView = { tab: WorkspaceTab; selectedId: string | null }
export const SEARCH_VIEW: WorkspaceView = { tab: 'consulting', selectedId: null }
export const WORKSPACE_HISTORY_KEY = 'oemWorkspace'

type Entry = { session: string; index: number; view: WorkspaceView }
type HistoryPort = Pick<History, 'state' | 'pushState' | 'replaceState' | 'back'>

/** History contains only screen IDs. Formula drafts stay mounted in React. */
export function createWorkspaceNavigation(history: HistoryPort, session: string, onChange: (view: WorkspaceView) => void) {
  let entries = [SEARCH_VIEW]
  let index = 0
  let pendingBack = false
  const current = () => entries[index]
  const entry = (): Entry | undefined => history.state?.[WORKSPACE_HISTORY_KEY]
  const write = (mode: 'pushState' | 'replaceState') => {
    history[mode]({ ...history.state, [WORKSPACE_HISTORY_KEY]: { session, index, view: current() } }, '')
  }
  write('replaceState')

  const navigate = (view: WorkspaceView, replace = false) => {
    if (pendingBack) return
    // A saved-search link may have added its own history entry.
    if (entry()?.session !== session) {
      entries = [current()]
      index = 0
    }
    if (view.tab === current().tab && view.selectedId === current().selectedId) {
      write('replaceState')
      return
    }
    if (replace) entries[index] = view
    else {
      entries = entries.slice(0, index + 1)
      entries.push(view)
      index += 1
    }
    write(replace ? 'replaceState' : 'pushState')
    onChange(view)
  }
  const back = () => {
    if (pendingBack) return
    if (entry()?.session === session && index > 0) {
      pendingBack = true
      history.back()
    } else navigate(SEARCH_VIEW, true)
  }

  return {
    setTab(tab: WorkspaceTab) { navigate({ tab, selectedId: tab === 'consulting' ? null : current().selectedId }) },
    selectProduct(selectedId: string | null) {
      // Moving between products replaces the detail entry; closing returns to the list.
      if (selectedId === null && current().selectedId && index > 0 && entries[index - 1].tab === 'consulting' && entries[index - 1].selectedId === null) back()
      else navigate({ ...current(), selectedId }, current().selectedId !== null)
    },
    resetSearch() { navigate(SEARCH_VIEW, true) },
    back,
    pop() {
      pendingBack = false
      const target = entry()
      if (target?.session === session && entries[target.index]) {
        index = target.index
        onChange(current())
      } else {
        // A reload or a saved-search entry cannot restore in-memory drafts.
        entries = [SEARCH_VIEW]
        index = 0
        write('replaceState')
        onChange(current())
      }
    },
  }
}
