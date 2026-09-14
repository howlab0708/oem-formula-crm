'use client'

import { useState, useSyncExternalStore } from 'react'
import { isCardCollapsed, storeCardCollapsed } from '@/lib/collapsedCards'

const subscribeNever = () => () => {}

/**
 * 대시보드 카드 한 장의 접힘 상태.
 *
 * 차트 카드(`charts/ChartCard`)와 권장 섭취량 패널(`DashboardSummaryCards`)이 같은
 * 규칙으로 접히도록 한곳에 둔다 - 한쪽만 상태가 유지되면 같은 조작인데 결과가 달라
 * 접는 게 되는지 매번 확인해 봐야 한다.
 *
 * @param id 저장소에 남길 열쇠. 카드 제목을 그대로 쓴다.
 * @param defaultCollapsed 아직 한 번도 건드리지 않았을 때의 상태.
 *   기본이 '접힘' 인 카드는 사용자가 편 것도 남겨야 하므로 `id::open` 을 따로 표시한다.
 *   둘 중 하나만 저장되고, 아무 표시도 없으면 이 기본값으로 돈다.
 */
export function useCollapsedCard(id: string, defaultCollapsed = false): [boolean, (next: boolean) => void] {
  const openId = `${id}::open`
  // 저장해 둔 값은 클라이언트에서만 읽는다(서버 렌더에는 없는 값이므로 하이드레이션 불일치 방지).
  const markedCollapsed = useSyncExternalStore(subscribeNever, () => isCardCollapsed(id), () => false)
  const markedOpen = useSyncExternalStore(subscribeNever, () => isCardCollapsed(openId), () => false)
  const stored = markedCollapsed ? true : markedOpen ? false : defaultCollapsed
  // null 은 '이번 화면에서 아직 건드리지 않음'. 그때는 저장해 둔 값을 쓴다.
  // 열쇠가 바뀌면(화면별로 따로 기억하는 경우) 이번 화면의 선택도 함께 버린다.
  const [choice, setChoice] = useState<{ id: string; value: boolean } | null>(null)

  const setCollapsed = (next: boolean) => {
    setChoice({ id, value: next })
    storeCardCollapsed(id, next)
    storeCardCollapsed(openId, !next)
  }

  return [choice?.id === id ? choice.value : stored, setCollapsed]
}
