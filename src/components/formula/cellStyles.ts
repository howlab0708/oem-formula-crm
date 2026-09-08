/**
 * 배합 시트 표의 공통 스타일.
 *
 * 셀은 칸 전체를 입력란으로 채운다(테두리 없는 input + 포커스 때만 배경 강조).
 * 엑셀처럼 "칸을 클릭하면 바로 입력" 이 되어야 해서, 입력란에 여백을 주고
 * 테두리를 그리는 일반 폼 스타일과 다르게 잡았다.
 */

export const cellClass =
  'h-9 w-full bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:bg-accent-soft'

export const headClass =
  'border-b border-line bg-surface-sunken px-2 py-2 text-[12px] font-medium text-ink-2'

export const numberCellClass = 'px-2 py-2 text-right text-[13px] tnum text-ink'

export const rowNumberClass = 'px-1 py-2 text-center text-[11px] text-ink-3 tnum'

