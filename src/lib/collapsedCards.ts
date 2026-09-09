/**
 * 접어 둔 대시보드 카드.
 *
 * 대시보드에 표·차트가 일곱 장이라 한 화면에 다 안 들어온다. 상담마다 보는 카드가
 * 달라서(제형 점유율만 볼 때가 있고 부원료 조합만 볼 때가 있다) 필요한 것만 남기고
 * 접을 수 있어야 한다.
 *
 * 접은 상태는 브라우저에 남긴다 - 새로 고칠 때마다 다시 접어야 하면 접는 의미가 없다.
 * 사람별 화면 취향이라 서버에 올리지 않는다(즐겨찾기·노트와 달리 공유할 값이 아니다).
 *
 * 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서는 조용히 '전부 펼침' 으로 돈다.
 * 로고 저장(`lib/export/logo.ts`)과 같은 규칙이다.
 */

const STORAGE_KEY = 'oem.dashboard.collapsedCards'

/** 읽은 값을 붙들어 둔다. 카드마다 렌더 때 조회하므로 매번 저장소를 파싱하지 않는다. */
let cached: ReadonlySet<string> | undefined

function read(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    // 저장소를 못 읽거나 남아 있는 값이 깨진 경우. 전부 펼친 상태로 시작한다.
    return new Set()
  }
}

export function collapsedCards(): ReadonlySet<string> {
  if (cached === undefined) cached = read()
  return cached
}

export function isCardCollapsed(id: string): boolean {
  return collapsedCards().has(id)
}

/** 접기·펼치기를 저장한다. 저장에 실패해도 이번 화면의 조작은 그대로 유지된다. */
export function storeCardCollapsed(id: string, collapsed: boolean): void {
  const next = new Set(collapsedCards())
  if (collapsed) next.add(id)
  else next.delete(id)
  cached = next

  try {
    if (next.size === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // 저장은 못 했지만 화면은 접힌 채로 둔다. 다음 방문에 펼쳐진 상태로 돌아갈 뿐이다.
  }
}

/** 테스트용. 모듈 안에 붙들어 둔 값을 버린다. */
export function resetCollapsedCardsCache(): void {
  cached = undefined
}
