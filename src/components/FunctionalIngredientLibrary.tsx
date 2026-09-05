'use client'

import { Fragment, useRef, useState } from 'react'
import {
  findFunctionalIngredients, functionalIngredients, ingredientCategoryLabels, ingredientOriginals,
  ingredientSourceRows, ingredientStandardsForQuery, INGREDIENT_PAGE_SIZE, INGREDIENT_REVIEW_DATE, INGREDIENT_SOURCES,
  type FunctionalIngredient, type IngredientCategory, type IngredientStandard,
} from '@/lib/functionalIngredients'

const categories = ['all', 'notified', 'recognized', 'unresolved'] as const
const categoryCounts = Object.fromEntries(categories.map((category) => [category,
  category === 'all' ? functionalIngredients.length : functionalIngredients.filter((item) => item.category === category).length]))
const linkClass = 'text-accent-strong underline decoration-accent-line underline-offset-4 hover:decoration-accent'
const buttonClass = 'rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-ink-2 hover:bg-surface-sunken disabled:opacity-40'

function StandardIntakes({ standard, compact = false }: { standard: IngredientStandard; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {standard.recognition ? <p className="text-[11px] font-medium text-ink-2">{standard.recognition}</p> : null}
      {standard.intakes.map((intake, index) => (
        <div key={index}>
          <p className="text-[14px] font-semibold text-ink tnum">{intake.amount}</p>
          {!compact || standard.intakes.length > 1 || standard.recognition ? <p className="mt-0.5 text-[11px] leading-5 text-ink-2">{intake.purpose}</p> : null}
          <p className="text-[11px] leading-5 text-ink-3">기준: {intake.basis}</p>
        </div>
      ))}
    </div>
  )
}

function IngredientDetails({ ingredient }: { ingredient: FunctionalIngredient }) {
  return (
    <div className="space-y-4 p-4 lg:p-5">
      <p className="text-[12px] leading-6 text-ink-2">{ingredient.note || '공전의 일일섭취량을 기준 성분과 함께 정리했습니다. 제조기준·규격은 원문을 확인하세요.'}</p>
      {ingredient.standards.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {ingredient.standards.map((standard, index) => (
            <section key={index} className="rounded-lg border border-line bg-surface p-4">
              <h4 className="text-[13px] font-semibold text-ink">{standard.name}</h4>
              {standard.holder ? <p className="mt-1 text-[12px] text-ink-2">인정업체: {standard.holder}</p> : null}
              <div className="my-3"><StandardIntakes standard={standard} /></div>
              <p className="mb-3 text-[11px] leading-5 text-ink-2">섭취 시 참고: {standard.caution}</p>
              <a href={standard.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-[12px]`}>
                {standard.sourceLabel} ↗<span className="sr-only"> (새 창)</span>
              </a>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-ink-2">정식 원료명·인정번호·인정업체 확인 후 섭취량을 확정할 수 있습니다.</p>
      )}
      {ingredient.upcoming.map((change, index) => (
        <p key={index} className="rounded-md border border-accent-line bg-accent-soft px-4 py-3 text-[12px] leading-6 text-ink-2">
          <strong>{change.effectiveOn} 시행 예정</strong> · {change.text}
        </p>
      ))}
      <details className="text-[12px] text-ink-2">
        <summary className="w-fit cursor-pointer py-1">첨부 CSV 원문 보기 (검증 전 표기)</summary>
        <ul className="mt-2 space-y-2">
          {ingredientOriginals(ingredient).map((row) => (
            <li key={row.id} className="rounded border border-line bg-surface px-3 py-2 leading-6">
              {row.name} · CSV 분류: {row.category}<br />
              CSV 기능성: {row.functionality}<br />CSV 섭취량: {row.dailyIntake}
            </li>
          ))}
        </ul>
      </details>
      <p className="text-[11px] text-ink-3">검토일 {ingredient.reviewedOn} · 첨부 자료와 확인한 공식 자료의 대조 결과입니다.</p>
    </div>
  )
}

export default function FunctionalIngredientLibrary() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<IngredientCategory | 'all'>('all')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const results = findFunctionalIngredients(query, category)
  const pages = Math.max(1, Math.ceil(results.length / INGREDIENT_PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * INGREDIENT_PAGE_SIZE
  const visible = results.slice(start, start + INGREDIENT_PAGE_SIZE)
  const resultsRef = useRef<HTMLDivElement>(null)
  const reset = () => { setQuery(''); setCategory('all'); setPage(1); setExpanded(null) }

  return (
    <main className="mx-auto max-w-[104rem] space-y-5 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">기능성 원료 조회</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-ink-2">원료 종류와 기능성, 기준 성분별 일일 섭취량을 확인하세요.</p>
          <p className="mt-1 text-[11px] leading-5 text-ink-3">첨부 CSV {ingredientSourceRows.length}개 항목 기반 · {functionalIngredients.length}개 조회 항목 · 검토일 {INGREDIENT_REVIEW_DATE}</p>
        </div>
        <div className="flex flex-wrap gap-3 py-1 text-[12px]">
          <a className={linkClass} href={INGREDIENT_SOURCES.codex} target="_blank" rel="noopener noreferrer">건강기능식품공전 ↗<span className="sr-only"> (새 창)</span></a>
          <a className={linkClass} href={INGREDIENT_SOURCES.search} target="_blank" rel="noopener noreferrer">식품안전나라 원료 검색 ↗<span className="sr-only"> (새 창)</span></a>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <label htmlFor="functional-ingredient-search" className="mb-2 block text-[12px] font-medium text-ink">원료명 · 기능성 · 인정번호 · 업체명 검색</label>
        <div className="flex gap-2">
          <input id="functional-ingredient-search" type="search" value={query} placeholder="예: 비타민 C, 관절, 보스웰리아, 제2025-14호"
            onChange={(event) => { setQuery(event.target.value); setPage(1); setExpanded(null) }}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-[13px]" />
          <button type="button" onClick={reset} className={buttonClass}>초기화</button>
        </div>
        <div role="group" aria-label="원료 종류" className="mt-3 flex flex-wrap gap-2">
          {categories.map((value) => (
            <button key={value} type="button" aria-pressed={category === value}
              onClick={() => { setCategory(value); setPage(1); setExpanded(null) }}
              className={`rounded-md border px-3 py-2 text-[12px] transition-colors ${category === value ? 'border-accent-line bg-accent-soft font-medium text-accent-strong' : 'border-line text-ink-2 hover:bg-surface-sunken'}`}>
              {value === 'all' ? '전체' : ingredientCategoryLabels[value]} <span className="ml-1 tnum">{categoryCounts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] leading-6 text-ink-2">
        섭취량은 <strong>하루 기준</strong>이며 원료·지표성분·균수 등 표시된 기준을 따릅니다. 개별인정형은 확인한 인정 사례만 수록했습니다.
        식약처 전체 원료 목록이나 식사를 포함한 영양소 권장량(KDRIs)과는 범위가 다릅니다.
      </p>

      <div ref={resultsRef} className="scroll-mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-2">
          <p role="status" aria-live="polite">검색 결과 <strong className="text-ink">{results.length}개</strong>{results.length ? ` · ${start + 1}~${Math.min(start + INGREDIENT_PAGE_SIZE, results.length)}개 표시` : ''}</p>
          <span>{INGREDIENT_PAGE_SIZE}개씩 보기 · {currentPage}/{pages}페이지</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
            <caption className="sr-only">기능성 원료별 분류, 기능성, 일일섭취량과 공식 출처</caption>
            <thead className="bg-surface-sunken text-[12px] text-ink-2">
              <tr>
                <th scope="col" className="w-[25%] px-4 py-3 font-medium">원료명 · 종류</th>
                <th scope="col" className="w-[23%] px-4 py-3 font-medium">기능성 요약</th>
                <th scope="col" className="w-[34%] px-4 py-3 font-medium">일일 섭취량 · 기준 성분</th>
                <th scope="col" className="w-[18%] px-4 py-3 font-medium">확인 · 출처</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((ingredient) => {
                const matchingStandards = ingredientStandardsForQuery(ingredient, query)
                const first = matchingStandards[0]
                const isOpen = expanded === ingredient.id
                const purposes = [...new Set(ingredient.standards.flatMap((standard) => standard.intakes.map((intake) => intake.purpose)))]
                return (
                  <Fragment key={ingredient.id}>
                    <tr className="border-t border-line align-top">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <span className={`mb-1 inline-block rounded px-2 py-0.5 text-[11px] ${ingredient.category === 'unresolved' ? 'bg-surface-sunken text-ink-2' : 'bg-accent-soft text-accent-strong'}`}>{ingredientCategoryLabels[ingredient.category]}</span>
                        <p className="keep-all text-[13px] font-semibold leading-6 text-ink">{ingredient.name}</p>
                        {ingredient.upcoming.length ? <p className="mt-1 text-[11px] text-accent-strong">2027년 시행 예정 변경 있음</p> : null}
                      </th>
                      <td className="keep-all px-4 py-3 text-[12px] leading-6 text-ink-2">
                        {ingredient.category === 'notified' ? first?.functionality : purposes.length ? purposes.join(' / ') : '정식 인정 원료 확인 후 기능성 확정'}
                        {ingredient.category === 'recognized' ? <p className="mt-2 text-[11px] text-ink-3">인정번호별 기능성은 상세에서 확인</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        {first ? <StandardIntakes standard={first} compact /> : <p className="text-[13px] font-medium text-ink-2">공식 기준 미확정</p>}
                        {ingredient.standards.length > 1 ? <p className="mt-3 text-[11px] font-medium text-accent-strong">외 {ingredient.standards.length - 1}개 인정 사례 · 상세 비교</p> : null}
                      </td>
                      <td className="px-4 py-3 text-[11px] leading-5">
                        <a className={linkClass} href={first?.sourceUrl ?? INGREDIENT_SOURCES.search} target="_blank" rel="noopener noreferrer">
                          {first ? '공식 원문' : '공식 목록 검색'} ↗<span className="sr-only"> (새 창)</span>
                        </a>
                        <button type="button" aria-expanded={isOpen} aria-controls={`ingredient-detail-${ingredient.id}`}
                          aria-label={`${ingredient.name} 상세 ${isOpen ? '닫기' : '보기'}`} onClick={() => setExpanded(isOpen ? null : ingredient.id)}
                          className="mt-1.5 block rounded border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-sunken">
                          {isOpen ? '상세 닫기' : '기준 상세'}
                        </button>
                      </td>
                    </tr>
                    <tr id={`ingredient-detail-${ingredient.id}`} hidden={!isOpen} className="border-t border-line bg-surface-muted">
                      <td colSpan={4}>{isOpen ? <IngredientDetails ingredient={ingredient} /> : null}</td>
                    </tr>
                  </Fragment>
                )
              })}
              {!results.length ? <tr><td colSpan={4} className="px-4 py-14 text-center text-[13px] text-ink-2">검색 결과가 없습니다. 원료명이나 기능성을 바꾸거나 초기화를 눌러 주세요.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <nav aria-label="기능성 원료 페이지" className="mt-4 flex justify-center gap-2">
          <button type="button" disabled={currentPage === 1} className={buttonClass} onClick={() => { setPage(currentPage - 1); setExpanded(null); resultsRef.current?.scrollIntoView({ block: 'start' }) }}>이전</button>
          {Array.from({ length: pages }, (_, index) => index + 1).map((value) => (
            <button key={value} type="button" aria-label={`원료 ${value}페이지`} aria-current={currentPage === value ? 'page' : undefined}
              onClick={() => { setPage(value); setExpanded(null); resultsRef.current?.scrollIntoView({ block: 'start' }) }}
              className={`${buttonClass} ${currentPage === value ? '!border-accent-line !bg-accent-soft font-semibold !text-accent-strong' : ''}`}>{value}</button>
          ))}
          <button type="button" disabled={currentPage === pages} className={buttonClass} onClick={() => { setPage(currentPage + 1); setExpanded(null); resultsRef.current?.scrollIntoView({ block: 'start' }) }}>다음</button>
        </nav>
      </div>
      <details className="rounded-lg border border-line bg-surface p-4 text-[12px] leading-6 text-ink-2">
        <summary className="cursor-pointer font-medium">자료 범위와 검증 기준</summary>
        <p className="mt-3">{INGREDIENT_REVIEW_DATE} 확인한 공전(제2026-43호) 및 식품안전나라 공개 인정 자료를 기준으로 정리했습니다. 시행 예정 변경은 해당 원료의 상세에 별도로 표시합니다. 실시간 갱신 자료는 아니므로 업무 적용 시 공식 원문과 보유 원료 인정서를 확인하세요.</p>
        <p className="mt-2">고시형은 공전의 원료·제조·규격 조건을 충족하는 경우의 기준입니다. 개별인정형은 특정 인정 원료의 기준이며, 같은 통칭의 다른 원료나 혼합물에 일괄 적용하지 않습니다. 기능성 문구는 조회를 위한 요약입니다.</p>
        <a className={linkClass} href={INGREDIENT_SOURCES.amendment} target="_blank" rel="noopener noreferrer">제2026-43호 개정 고시 ↗<span className="sr-only"> (새 창)</span></a>
      </details>
    </main>
  )
}
