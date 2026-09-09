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
 */
export function useCollapsedCard(id: string): [boolean, (next: boolean) => void] {
  // 저장해 둔 값은 클라이언트에서만 읽는다(서버 렌더에는 없는 값이므로 하이드레이션 불일치 방지).
  const stored = useSyncExternalStore(subscribeNever, () => isCardCollapsed(id), () => false)
  // null 은 '이번 화면에서 아직 건드리지 않음'. 그때는 저장해 둔 값을 쓴다.
  const [choice, setChoice] = useState<boolean | null>(null)

  const setCollapsed = (next: boolean) => {
    setChoice(next)
    storeCardCollapsed(id, next)
  }

  return [choice ?? stored, setCollapsed]
}
