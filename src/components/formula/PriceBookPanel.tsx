'use client'

/**
 * 원료단가 기억장 관리.
 *
 * 배합비를 저장하면 시트에 적힌 단가가 원료명별로 쌓이고, 다음 배합비의 자동완성이
 * 그 값을 채운다. 쌓기만 하면 한 번 잘못 넣은 단가가 계속 따라붙으므로 여기서 지운다.
 *
 * 목록이 수백 줄까지 늘어나므로 검색을 먼저 두고, 지우기는 두 단계로 나눴다 -
 * 한 줄 삭제는 바로, 전체 비우기는 개수를 보여 주고 확인을 받는다.
 */

import { useEffect, useState } from 'react'
import { Modal } from '@/components/Modal'
import { clearIngredientPrices, deleteIngredientPrice } from '@/lib/api/formulas'
import { nameKey } from '@/lib/formulaDesign/suggest'
import type { IngredientPrice } from '@/lib/formulaDesign/types'

const buttonClass =
  'rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50'

type Props = {
  prices: IngredientPrice[]
  /** 지운 뒤 자동완성 색인을 다시 받도록 알린다. */
  onChanged: () => void
  onClose: () => void
}

export function PriceBookPanel({ prices, onChanged, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(''), 3200)
    return () => window.clearTimeout(id)
  }, [message])

  const compact = nameKey(query)
  const shown = compact ? prices.filter((price) => nameKey(price.name).includes(compact)) : prices

  const run = async (token: string, task: () => Promise<string>) => {
    setBusy(token)
    setError('')
    try {
      setMessage(await task())
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '원료단가를 지우지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const removeOne = (price: IngredientPrice) =>
    run(price.name, async () => {
      await deleteIngredientPrice(price.name)
      return `‘${price.name}’ 단가를 지웠습니다.`
    })

  const removeAll = () =>
    run('all', async () => {
      const result = await clearIngredientPrices()
      return `원료단가 ${result.deleted.toLocaleString('ko-KR')}건을 지웠습니다.`
    })

  return (
    <Modal title="원료단가 기억장" onClose={onClose} wide>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="mt-0.5 text-[12px] text-ink-3">
            배합비를 저장할 때 쌓인 원료별 최근 단가 {prices.length.toLocaleString('ko-KR')}건입니다. 자동완성이 이 값을
            채웁니다. 잘못된 단가는 지우거나, 올바른 단가로 배합비를 다시 저장하면 덮어써집니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 목록은 화면을 열 때 받아 둔 값이라, 다른 사람이 저장한 단가는 새로고침해야 보인다. */}
          <button type="button" onClick={onChanged} className="text-[13px] text-ink-2 underline underline-offset-2">
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          aria-label="원료단가 검색"
          value={query}
          placeholder="원료명 검색"
          onChange={(event) => setQuery(event.target.value)}
          className="w-full max-w-[18rem] rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3"
        />
        <button
          type="button"
          className={`${buttonClass} hover:bg-danger-soft hover:text-danger`}
          disabled={busy !== null || prices.length === 0}
          onClick={() => {
            if (
              window.confirm(
                `원료단가 ${prices.length.toLocaleString('ko-KR')}건을 모두 지울까요?\n\n저장된 배합비와 견적 버전은 지워지지 않습니다. 자동완성이 단가를 채우지 않게 되고, 앞으로 배합비를 저장할 때 다시 쌓입니다.`,
              )
            ) {
              void removeAll()
            }
          }}
        >
          {busy === 'all' ? '지우는 중…' : '전체 비우기'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p aria-live="polite" className="mt-2 text-[13px] text-ink-2">
          {message}
        </p>
      ) : null}

      {prices.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">
          쌓인 단가가 없습니다. 배합비를 저장하면 원료별 단가가 여기에 기록됩니다.
        </p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-3">‘{query}’ 에 맞는 원료가 없습니다.</p>
      ) : (
        <div className="mt-2 max-h-[22rem] overflow-y-auto">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">원료명, 단가, 비고, 갱신일과 삭제 버튼</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-[12px] text-ink-2">
                <th scope="col" className="px-2 py-1.5 text-left font-medium">원료명</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">단가(원/kg)</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">비고</th>
                <th scope="col" className="px-2 py-1.5 text-left font-medium">갱신</th>
                <th scope="col" className="w-10 px-2 py-1.5" aria-label="삭제" />
              </tr>
            </thead>
            <tbody>
              {shown.map((price) => (
                <tr key={price.name} className="border-b border-line/70">
                  <th scope="row" className="px-2 py-1.5 text-left font-normal text-ink">
                    {price.name}
                  </th>
                  <td className="px-2 py-1.5 text-right tnum">{price.unitPrice.toLocaleString('ko-KR')}</td>
                  <td className="px-2 py-1.5 text-ink-3">{price.note || '-'}</td>
                  <td className="px-2 py-1.5 text-ink-3 tnum">{price.updatedAt.slice(0, 10)}</td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void removeOne(price)}
                      aria-label={`${price.name} 단가 삭제`}
                      className="rounded px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    >
                      {busy === price.name ? '…' : '✕'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {compact && shown.length ? (
        <p className="mt-2 text-[12px] text-ink-3">
          {shown.length.toLocaleString('ko-KR')}건 표시 · 전체 {prices.length.toLocaleString('ko-KR')}건
        </p>
      ) : null}
    </Modal>
  )
}
