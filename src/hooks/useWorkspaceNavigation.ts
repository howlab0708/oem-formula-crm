'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceTab } from '@/components/WorkspaceSidebar'
import { createWorkspaceNavigation, SEARCH_VIEW } from '@/lib/workspaceNavigation'

export function useWorkspaceNavigation() {
  const [view, setView] = useState(SEARCH_VIEW)
  const navigation = useRef<ReturnType<typeof createWorkspaceNavigation> | null>(null)
  useEffect(() => {
    const controller = createWorkspaceNavigation(window.history, crypto.randomUUID(), setView)
    navigation.current = controller
    window.addEventListener('popstate', controller.pop)
    return () => {
      window.removeEventListener('popstate', controller.pop)
      navigation.current = null
    }
  }, [])
  const setActiveTab = useCallback((tab: WorkspaceTab) => navigation.current?.setTab(tab), [])
  const setSelectedId = useCallback((id: string | null) => navigation.current?.selectProduct(id), [])
  const resetSearch = useCallback(() => navigation.current?.resetSearch(), [])
  const goBack = useCallback(() => navigation.current?.back(), [])
  return { activeTab: view.tab, selectedId: view.selectedId, setActiveTab, setSelectedId, resetSearch, goBack }
}
