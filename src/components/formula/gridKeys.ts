'use client'

/**
 * 엑셀식 셀 이동.
 *
 * 각 입력란에 `data-cell="행:열"` 을 붙여 두고, 키를 받으면 같은 표(`[data-grid]`)
 * 안에서 이웃 칸을 DOM 으로 찾아 포커스를 옮긴다. 셀 좌표를 리액트 상태로 들고
 * 있지 않은 이유는 그러면 화살표를 누를 때마다 표 전체가 다시 그려지기 때문이다.
 *
 * 좌우 화살표는 캐럿이 글자 끝에 닿았을 때만 칸을 옮긴다. 그러지 않으면 숫자를
 * 고치려고 캐럿을 움직이는 것과 칸 이동이 구분되지 않는다.
 */

type Cell = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const selector = (row: number, column: number) => `[data-cell="${row}:${column}"]`

/** 표 안의 특정 칸에 포커스를 준다. 값이 있으면 전체 선택해서 바로 덮어쓸 수 있게 한다. */
export function focusCell(grid: HTMLElement | null, row: number, column: number): boolean {
  const target = grid?.querySelector<Cell>(selector(row, column))
  if (!target || target.disabled) return false
  target.focus()
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select()
  return true
}

/**
 * 아직 그려지지 않은 칸에 포커스를 준다.
 *
 * 줄을 추가한 직후의 칸은 리액트가 다시 그린 뒤에야 DOM 에 생긴다. 한 번만
 * 기다리면 커밋보다 먼저 실행되어 포커스가 이전 칸에 남으므로, 칸이 나타날
 * 때까지 몇 번 다시 시도한다.
 *
 * `requestAnimationFrame` 을 쓰지 않는다: 창이 가려져 화면을 그리지 않는 동안에는
 * 콜백이 아예 실행되지 않아 포커스가 조용히 멈춘다. 우리가 기다리는 것은 화면
 * 그리기가 아니라 DOM 반영이므로 타이머가 맞다.
 */
export function focusCellSoon(grid: HTMLElement | null, row: number, column: number, attempts = 8): void {
  setTimeout(() => {
    if (focusCell(grid, row, column) || attempts <= 1) return
    focusCellSoon(grid, row, column, attempts - 1)
  }, 0)
}

/** 같은 행에서 왼쪽·오른쪽으로 실제 존재하는 칸을 찾는다(가려진 열을 건너뛴다). */
function focusNearest(grid: HTMLElement | null, row: number, column: number, step: number, limit: number): boolean {
  for (let next = column + step; next >= 0 && next <= limit; next += step) {
    if (focusCell(grid, row, next)) return true
  }
  return false
}

function atStart(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return true
  return target.selectionStart === 0 && target.selectionEnd === 0
}

function atEnd(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return true
  const length = target.value.length
  return target.selectionStart === length && target.selectionEnd === length
}

export type GridKeyOptions = {
  row: number
  column: number
  rowCount: number
  columnCount: number
  /** 마지막 줄에서 Enter, 또는 Ctrl+Enter 를 눌렀을 때 줄을 늘린다. */
  onAddRow?: () => void
  /** Alt+↑/↓ 로 줄 순서를 바꾼다. */
  onMoveRow?: (delta: number) => void
}

/**
 * 표 안 입력란의 keydown 처리. Tab 은 손대지 않는다 - 브라우저 기본 순서가
 * 이미 행 → 칸 순서라서 가로채면 오히려 예측이 어려워진다.
 */
export function handleGridKeyDown(
  event: React.KeyboardEvent<Cell>,
  { row, column, rowCount, columnCount, onAddRow, onMoveRow }: GridKeyOptions,
): void {
  const grid = event.currentTarget.closest<HTMLElement>('[data-grid]')
  const lastRow = rowCount - 1
  const lastColumn = columnCount - 1

  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    if (!onMoveRow) return
    event.preventDefault()
    const delta = event.key === 'ArrowUp' ? -1 : 1
    onMoveRow(delta)
    // 줄이 옮겨진 뒤에도 같은 칸을 계속 잡고 있게 한다.
    focusCellSoon(grid, row + delta, column)
    return
  }

  switch (event.key) {
    case 'Enter': {
      event.preventDefault()
      // 마지막 줄에서의 Enter 와 Ctrl+Enter 는 줄을 늘린다. 엑셀에서 아래로 내려가며
      // 계속 입력하던 손을 그대로 쓸 수 있게 하려는 것.
      const wantsNewRow = event.ctrlKey || event.metaKey || (row === lastRow && !event.shiftKey)
      if (wantsNewRow && onAddRow) {
        onAddRow()
        focusCellSoon(grid, row + 1, column)
        return
      }
      focusCell(grid, event.shiftKey ? Math.max(row - 1, 0) : Math.min(row + 1, lastRow), column)
      return
    }
    case 'ArrowDown':
      event.preventDefault()
      focusCell(grid, Math.min(row + 1, lastRow), column)
      return
    case 'ArrowUp':
      event.preventDefault()
      focusCell(grid, Math.max(row - 1, 0), column)
      return
    case 'ArrowLeft':
      if (!atStart(event.target)) return
      if (focusNearest(grid, row, column, -1, lastColumn)) event.preventDefault()
      return
    case 'ArrowRight':
      if (!atEnd(event.target)) return
      if (focusNearest(grid, row, column, 1, lastColumn)) event.preventDefault()
      return
    default:
      return
  }
}
