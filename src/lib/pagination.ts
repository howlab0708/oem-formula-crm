export const REFERENCE_PAGE_SIZE = 50

export function referencePage(total: number, requestedPage: number) {
  const pages = Math.max(1, Math.ceil(total / REFERENCE_PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1))
  const start = (page - 1) * REFERENCE_PAGE_SIZE
  return { page, pages, start, end: Math.min(start + REFERENCE_PAGE_SIZE, total) }
}

export function referencePageButtons(page: number, pages: number): Array<number | 'gap-left' | 'gap-right'> {
  const start = Math.max(1, Math.min(page - 2, pages - 4))
  const end = Math.min(pages, Math.max(page + 2, 5))
  const buttons: Array<number | 'gap-left' | 'gap-right'> = []
  if (start > 1) buttons.push(1)
  if (start > 2) buttons.push('gap-left')
  for (let value = start; value <= end; value++) buttons.push(value)
  if (end < pages - 1) buttons.push('gap-right')
  if (end < pages) buttons.push(pages)
  return buttons
}
