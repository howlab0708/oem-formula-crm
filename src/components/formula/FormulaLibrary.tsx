'use client'

/**
 * 저장된 배합비 목록과 견적 버전 이력.
 *
 * 회사 선택 값은 회사 노트 화면과 같은 `company_key` 라서, 노트에서 쓰던 회사
 * 이름으로 배합비도 바로 찾힌다. 목록의 단가는 저장할 때 서버가 계산해 둔 값이라
 * 시트를 열지 않고도 견적 규모를 비교할 수 있다.
 */

import { useEffect, useState } from 'react'
import { fetchFormulaList, fetchVersions, type FormulaCompany } from '@/lib/api/formulas'
import { formatWon } from '@/lib/formulaDesign/calc'
import type { FormulaSummary, QuoteVersion } from '@/lib/formulaDesign/types'

const fieldClass = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink'
const buttonClass =
  'rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50'

type Props = {
  refreshKey: number
  currentId: string | null
  onOpen: (id: string) => void
  onOpenVersion: (version: number) => void
  onClose: () => void
}

export function FormulaLibrary({ refreshKey, currentId, onOpen, onOpenVersion, onClose }: Props) {
  const [companies, setCompanies] = useState<FormulaCompany[]>([])
  const [formulas, setFormulas] = useState<FormulaSummary[]>([])
  const [company, setCompany] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [versions, setVersions] = useState<QuoteVersion[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      fetchFormulaList(company, query, page, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return
          setCompanies(data.companies)
          setFormulas(data.formulas)
          setHasMore(data.hasMore)
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [company, query, page, refreshKey])

  // 열려 있는 배합비의 버전 이력을 함께 보여준다.
  useEffect(() => {
    if (!currentId) return
    let cancelled = false
    fetchVersions(currentId)
      .then((data) => {
        if (!cancelled) setVersions(data.versions)
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [currentId, refreshKey])

  // 다른 배합비를 열기 전까지 남아 있던 이력을 보여주지 않는다.
  const shownVersions = currentId ? versions : []

  return (
    <section aria-labelledby="library-title" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <h3 id="library-title" className="text-[14px] font-semibold text-ink">
          저장된 배합비
        </h3>
        <button type="button" onClick={onClose} className="text-[13px] text-ink-2 underline underline-offset-2">
          닫기
        </button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="회사 선택"
              className={`${fieldClass} max-w-[16rem]`}
              value={company}
              onChange={(event) => {
                setCompany(event.target.value)
                setPage(1)
              }}
            >
              <option value="">전체 회사 ({companies.reduce((sum, item) => sum + item.count, 0)}건)</option>
              {companies.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name} ({item.count}건)
                </option>
              ))}
            </select>
            <input
              aria-label="배합비 검색"
              className={`${fieldClass} max-w-[18rem]`}
              value={query}
              placeholder="회사명, 제목, 제품명, 메모 검색"
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
          </div>

          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p role="status" className="py-6 text-center text-[13px] text-ink-3">
              불러오는 중…
            </p>
          ) : formulas.length === 0 && !error ? (
            <p className="py-6 text-center text-[13px] text-ink-3">
              {query || company ? '조건에 맞는 배합비가 없습니다.' : '첫 배합비를 저장해 보세요.'}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {formulas.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className={`flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1 py-2 text-left transition-colors hover:bg-surface-sunken ${
                      item.id === currentId ? 'bg-accent-soft' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="mr-2 text-[12px] font-medium text-accent-strong">{item.company}</span>
                      <span className="text-[13px] text-ink">{item.title}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-3 tnum">
                      {item.setCount ? `${item.setCount.toLocaleString('ko-KR')}set · ` : ''}
                      {item.supplyPerSet ? `${formatWon(item.supplyPerSet)}원/set · ` : ''}
                      v{item.version} · {item.updatedAt.slice(0, 10)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
            <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              이전
            </button>
            <span>{page}페이지</span>
            <button type="button" className={buttonClass} disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>
              다음
            </button>
          </div>
        </div>

        <div className="rounded-md border border-line bg-surface-muted p-3">
          <h4 className="text-[13px] font-semibold text-ink">견적 버전 이력</h4>
          {!currentId ? (
            <p className="mt-2 text-[12px] text-ink-3">배합비를 저장하거나 불러오면 버전 이력이 보입니다.</p>
          ) : shownVersions.length === 0 ? (
            <p className="mt-2 text-[12px] text-ink-3">아직 기록된 버전이 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {shownVersions.map((version) => {
                const unitPrice = typeof version.totals.unitPrice === 'number' ? version.totals.unitPrice : null
                const setCount = typeof version.totals.setCount === 'number' ? version.totals.setCount : null
                return (
                  <li key={version.version} className="flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenVersion(version.version)}
                      className="text-[13px] text-accent-strong underline underline-offset-2"
                    >
                      버전 {version.version}
                    </button>
                    <span className="text-[12px] text-ink-3 tnum">
                      {setCount ? `${setCount.toLocaleString('ko-KR')}set · ` : ''}
                      {unitPrice !== null ? `${formatWon(unitPrice)}원/set · ` : ''}
                      {version.createdAt.slice(0, 10)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-2 text-[12px] text-ink-3">
            버전을 누르면 그때의 시트를 화면으로 되돌립니다. 저장하면 새 버전으로 기록되고 기존 버전은 남습니다.
          </p>
        </div>
      </div>
    </section>
  )
}
