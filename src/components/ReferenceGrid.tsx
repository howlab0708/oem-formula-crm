'use client'

import { useRef, type ReactNode, type RefObject } from 'react'
import { formatInt, formatMilligrams } from '@/lib/format'
import { uniqueMainIngredients } from '@/lib/ingredientNames'
import { referencePage, referencePageButtons } from '@/lib/pagination'
import type { Product } from '@/lib/types'

const GRID_TEMPLATE = 'md:grid-cols-[minmax(0,2fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,2fr)_auto]'

type Props = {
  products: Product[]
  totalCount: number
  page: number
  onPageChange: (page: number) => void
  selectedId: string | null
  onSelect: (product: Product) => void
  scrollRef: RefObject<HTMLDivElement | null>
  actions?: ReactNode
}

/** 목록만 50건씩 나눈다. 통계와 CSV 내보내기는 부모의 전체 검색 결과를 사용한다. */
export function ReferenceGrid({
  products, totalCount, page, onPageChange, selectedId, onSelect, scrollRef, actions,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const bounds = referencePage(products.length, page)
  const rows = products.slice(bounds.start, bounds.end)
  const changePage = (next: number) => {
    onPageChange(next)
    const section = sectionRef.current
    const scroller = scrollRef.current
    if (section && scroller) {
      const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      scroller.scrollTo({ top: Math.max(0, top) })
    }
  }

  return (
    <section ref={sectionRef} aria-label="품목제조보고 레퍼런스" className="rounded-lg border border-line bg-surface">
      <div className="rounded-t-lg border-b border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">품목제조보고 레퍼런스</h2>
            <p className="mt-1 text-[12px] text-ink-3 tnum">
              {formatInt(products.length)}건{products.length !== totalCount ? ` / 전체 ${formatInt(totalCount)}건` : ''}
              <span className="ml-2">페이지당 50개 · 제품을 누르면 상세 확인</span>
            </p>
          </div>
          {actions}
        </div>
        {rows.length > 0 ? <PageNavigation position="상단" total={products.length} page={bounds.page} onChange={changePage} /> : null}
        <div className={`hidden ${GRID_TEMPLATE} gap-4 border-t border-line bg-surface-muted px-5 py-2.5 text-[11px] font-medium text-ink-3 md:grid`}>
          <span>제품명 · 제조원</span>
          <span>제형</span>
          <span>1알 중량</span>
          <span>주요 성분</span>
          <span>상세</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-16 text-center text-[13px] text-ink-3">
          조건에 맞는 레퍼런스가 없습니다. 왼쪽에서 조건을 완화해 보세요.
        </p>
      ) : (
        <ul aria-label="레퍼런스 목록" className="px-2">
          {rows.map((product, index) => {
            const mains = uniqueMainIngredients(product.mainIngredients)
            const selected = product.id === selectedId
            return (
              <li key={product.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(product)}
                  aria-label={`${product.name} 상세보기`}
                  aria-current={selected ? 'true' : undefined}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] ${GRID_TEMPLATE} items-center gap-x-4 gap-y-2 rounded-md px-3 py-3 text-left transition-colors ${
                    selected ? 'bg-accent-soft' : index % 2 ? 'bg-surface-muted hover:bg-surface-sunken' : 'hover:bg-surface-sunken'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] leading-5 font-medium text-ink" title={product.name}>{product.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-3" title={product.manufacturer}>{product.manufacturer}</span>
                    {product.brand ? <span className="block truncate text-[11px] leading-4 text-ink-3">브랜드: {product.brand}</span> : null}
                  </span>
                  <span className="hidden text-[12px] text-ink-2 md:block">{product.form}</span>
                  <span className="hidden text-[12px] text-ink-2 tnum md:block">{formatMilligrams(product.unitWeightMg)}</span>
                  <span className="col-span-2 min-w-0 text-[12px] leading-5 text-ink-2 md:col-span-1">
                    <span className="mb-1 block text-[11px] text-ink-3 md:hidden">{product.form} · 1알 {formatMilligrams(product.unitWeightMg)}</span>
                    <span className="line-clamp-2 keep-all">{mains.slice(0, 3).join(' · ') || '-'}{mains.length > 3 ? ` 외 ${mains.length - 3}종` : ''}</span>
                  </span>
                  <span className="col-start-2 row-start-1 text-[12px] font-medium text-accent-strong md:col-auto md:row-auto" aria-hidden="true">보기 ›</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {rows.length > 0 ? <PageNavigation position="하단" total={products.length} page={bounds.page} onChange={changePage} /> : null}
    </section>
  )
}

function PageNavigation({ position, total, page, onChange }: {
  position: string; total: number; page: number; onChange: (page: number) => void
}) {
  const bounds = referencePage(total, page)
  const buttonClass = 'min-w-8 rounded-md border border-line px-2 py-1.5 text-[12px] text-ink-2 hover:bg-surface-sunken disabled:cursor-default disabled:opacity-40'
  return (
    <nav aria-label={`레퍼런스 페이지 ${position}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p aria-live={position === '상단' ? 'polite' : undefined} className="text-[11px] text-ink-3 tnum">
        {formatInt(bounds.start + 1)}–{formatInt(bounds.end)} / {formatInt(total)}건 · {formatInt(bounds.page)}/{formatInt(bounds.pages)}페이지
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" aria-label="이전 페이지" className={buttonClass} disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button>
        {referencePageButtons(bounds.page, bounds.pages).map((item) => typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            aria-label={`${item}페이지`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
            className={item === page ? 'min-w-8 rounded-md border border-accent bg-accent px-2 py-1.5 text-[12px] font-medium text-white' : buttonClass}
          >{item}</button>
        ) : <span key={item} className="px-1 text-[12px] text-ink-3" aria-hidden="true">…</span>)}
        <button type="button" aria-label="다음 페이지" className={buttonClass} disabled={page >= bounds.pages} onClick={() => onChange(page + 1)}>다음</button>
      </div>
    </nav>
  )
}
