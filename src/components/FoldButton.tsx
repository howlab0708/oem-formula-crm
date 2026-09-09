'use client'

type Props = {
  collapsed: boolean
  onToggle: () => void
  /** 무엇을 접는지. 화면 낭독기가 읽는 이름에 들어간다. */
  label: string
  /** 이 버튼이 여닫는 영역의 id */
  controls: string
}

/**
 * 접기 · 펼치기 버튼.
 *
 * 두 방향이 **같은 자리에 같은 모양으로** 있어야 한다. 접었을 때 이 버튼이 사라지면
 * 다시 열 방법이 제목 클릭뿐인데, 제목은 눌릴 것처럼 보이지 않아서 되돌릴 수 없는
 * 것처럼 느껴진다 - 실제로 그렇게 막혔다는 피드백을 받았다.
 *
 * 제목 줄도 여전히 누르면 열린다. 이 버튼은 그 사실을 눈에 보이게 하는 쪽이다.
 */
export function FoldButton({ collapsed, onToggle, label, controls }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-controls={controls}
      aria-label={`${label} ${collapsed ? '펼치기' : '접기'}`}
      className="shrink-0 rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
    >
      {collapsed ? '펼치기' : '접기'}
    </button>
  )
}
