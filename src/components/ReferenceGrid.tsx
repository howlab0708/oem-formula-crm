'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { formatInt } from '@/lib/format'
import type { Product } from '@/lib/types'

const ROW_HEIGHT = 88
const GRID_TEMPLATE =
  'grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,2.5fr)]'

type Props = {
  products: Product[]
  totalCount: number
  selectedId: string | null
  onSelect: (product: Product) => void
  /** 대시보드와 그리드를 함께 담은 바깥 스크롤 컨테이너 */
  scrollRef: RefObject<HTMLDivElement | null>
  /** 헤더 우측 액션 슬롯 (CSV 내보내기 등) */
  actions?: ReactNode
}

/**
 * 레퍼런스 리스트.
 *
 * 식약처 원본은 수만 행이라 전부 DOM 에 올리면 스크롤이 끊긴다.
 * 화면에 보이는 구간만 렌더하고, 행 높이를 고정해 스크롤 위치가 튀지 않게 한다.
 */
export function ReferenceGrid({
  products,
  totalCount,
  selectedId,
  onSelect,
  scrollRef,
  actions,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const hasRows = products.length > 0

  /*
   * 가상 목록이 스크롤 컨테이너의 맨 위가 아니라 대시보드 아래에서 시작하므로,
   * 목록 시작점의 오프셋(scrollMargin)을 정확히 넘겨야 렌더 구간이 어긋나지 않는다.
   * 조건이 바뀌면 위쪽 대시보드 높이도 달라지므로 크기 변화를 계속 관찰한다.
   *
   * useLayoutEffect 가 아니라 useEffect 인 이유: 스크롤 컨테이너 ref 는 이 컴포넌트의
   * 부모에 달려 있어 레이아웃 이펙트 시점에는 아직 비어 있을 수 있다.
   */
  useEffect(() => {
    const list = listRef.current
    const scroller = scrollRef.current
    if (!list || !scroller) return

    const measure = () => {
      const offset =
        list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      setScrollMargin((previous) => (Math.abs(previous - offset) < 0.5 ? previous : offset))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    const content = scroller.firstElementChild
    if (content) observer.observe(content)

    return () => observer.disconnect()
  }, [scrollRef, hasRows])

  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="sticky top-0 z-20 rounded-t-lg border-b border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[14px] font-semibold text-ink">품목제조보고 레퍼런스</h2>
            <p className="text-[12px] text-ink-3 tnum">
              {formatInt(products.length)}건
              {products.length !== totalCount ? ` / 전체 ${formatInt(totalCount)}건` : ''}
            </p>
          </div>
          {actions}
        </div>
        <div
          className={`grid ${GRID_TEMPLATE} gap-4 border-t border-line bg-surface-muted px-5 py-2.5 text-[11px] font-medium text-ink-3`}
        >
          <span>제품명 · 제조원</span>
          <span>제형 · 규격</span>
          <span>지표성분 함량</span>
          <span>부원료 배합</span>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="px-5 py-16 text-center text-[13px] text-ink-3">
          조건에 맞는 레퍼런스가 없습니다. 왼쪽에서 조건을 완화해 보세요.
        </p>
      ) : (
        <div ref={listRef}>
          <div
            className="relative"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            role="list"
            aria-label="레퍼런스 목록"
          >
            {items.map((item) => {
              const product = products[item.index]
              const isSelected = product.id === selectedId

              return (
                <div
                  key={product.id}
                  role="listitem"
                  className="absolute inset-x-0 top-0 px-2"
                  style={{
                    height: `${item.size}px`,
                    transform: `translateY(${item.start - scrollMargin}px)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(product)}
                    aria-current={isSelected}
                    className={`grid h-full w-full ${GRID_TEMPLATE} items-start gap-4 rounded-md border-b border-line px-3 py-3.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-accent-soft'
                        : item.index % 2 === 1
                          ? 'bg-surface-muted hover:bg-surface-sunken'
                          : 'hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] leading-5 font-medium text-ink">
                        {product.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-3">
                        {product.manufacturer}
                      </span>
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-[13px] leading-5 text-ink-2">
                        {product.form}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-4 text-ink-3 tnum">
                        {product.weightLabel}
                      </span>
                    </span>

                    <span className="min-w-0 text-[12px] leading-5 text-ink-2">
                      <span className="line-clamp-3 keep-all">{product.mainDetail || '-'}</span>
                    </span>

                    <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
                      {product.subIngredients.slice(0, 4).map((sub) => (
                        <span
                          key={sub}
                          className="max-w-[10rem] truncate rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] leading-4 text-ink-2"
                        >
                          {sub}
                        </span>
                      ))}
                      {product.subIngredients.length > 4 ? (
                        <span className="px-1 py-0.5 text-[11px] leading-4 text-ink-3 tnum">
                          +{product.subIngredients.length - 4}
                        </span>
                      ) : null}
                      {product.subIngredients.length === 0 ? (
                        <span className="text-[11px] leading-4 text-ink-3">-</span>
                      ) : null}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
