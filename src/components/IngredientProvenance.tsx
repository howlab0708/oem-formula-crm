'use client'

import { useState } from 'react'
import { copyText } from '@/lib/export/download'
import { currentProvenance, hasProvenance, originLabel, productProvenance, provenanceToText, type IngredientProvenance } from '@/lib/ingredientProvenance'
import type { Product } from '@/lib/types'

export function ProvenanceDetails({ source }: { source: IngredientProvenance }) {
  return <details className="mt-1 text-[12px] leading-5 text-ink-2">
    <summary className="cursor-pointer underline underline-offset-2">근거 보기</summary>
    <div className="mt-2 space-y-1 break-words rounded border border-line bg-surface-sunken p-2">
      <p>{source.statement}</p>
      {source.scope ? <p>확인 범위: {source.scope}</p> : null}
      <p>참고 제품: {source.productName}</p>
      {source.referenceVariant ? <p>이력 제품명: {source.referenceVariant}</p> : null}
      {source.productionDate ? <p>생산일: {source.productionDate} · 식품이력번호: {source.traceabilityNo}</p> : null}
      <p>확인일: {source.checkedAt || '미확인'}</p>
      {/^https?:\/\//i.test(source.sourceUrl) ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer"
        className="underline underline-offset-2">{source.sourceTitle} ↗</a> : null}
      {source.additionalSources?.map(extra => <div key={extra.sourceUrl} className="mt-2 border-t border-line pt-2">
        <p>{extra.statement}</p>
        <p>확인일: {extra.checkedAt}</p>
        <a href={extra.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{extra.sourceTitle} ↗</a>
      </div>)}
    </div>
  </details>
}

export function ReferenceIngredientInfo({ name, source }: { name: string; source?: IngredientProvenance }) {
  const current = currentProvenance(name, source)
  if (!name.trim()) return null
  return <div className="border-t border-dashed border-line px-2 py-1.5 text-[11px] leading-4 text-ink-2">
    <p>원료사: {current?.supplier || '미확인'}</p>
    <p>원산지: {originLabel(current)}</p>
    {current?.scope ? <p>{current.scope}</p> : null}
    {current ? <p className="mt-1 text-ink-3">참고 제품 기준{current.productionDate ? ` · ${current.productionDate} 생산분` : ''}</p> : null}
    {current && hasProvenance(current) ? <ProvenanceDetails source={current} /> : null}
  </div>
}

export function IngredientCopyButton({ getText, label = '원료 정보 복사', disabled = false }: { getText: () => string; label?: string; disabled?: boolean }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function copy() {
    setBusy(true)
    try {
      setMessage(await copyText(getText()) ? '복사했습니다. 원료사·원산지·근거가 함께 포함됩니다.' : '복사하지 못했습니다. 브라우저의 복사 권한을 확인해 주세요.')
    } catch {
      setMessage('복사하지 못했습니다. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }
  return <div>
    <button type="button" onClick={copy} disabled={busy || disabled}
      className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-surface-sunken disabled:opacity-50">
      {busy ? '복사 중…' : label}
    </button>
    {message ? <p role="status" className="mt-1 max-w-72 text-[12px] text-ink-2">{message}</p> : null}
  </div>
}

export function ProductProvenanceSection({ product, loading = false, refreshing = false, error, onRetry }: { product: Product; loading?: boolean; refreshing?: boolean; error?: string; onRetry?: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const rows = productProvenance(product)
  const origins = rows.filter(row => row.country).length
  const suppliers = rows.filter(row => row.supplier).length
  const trace = product.traceability
  const ordered = [...rows.filter(hasProvenance), ...rows.filter((source) => !hasProvenance(source))]
  const visible = showAll ? ordered : ordered.slice(0, 6)
  return <section aria-label="원료사 · 원산지" className="border-b border-line py-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-[14px] font-semibold text-ink">원료사 · 원산지</h3>
        <p role="status" className="mt-1 text-[12px] text-ink-2">{loading ? '공개 생산 이력에서 제품·제조원·원료를 대조하고 있습니다…' : `전체 ${rows.length}개 원료 · 원산지 확인 ${origins}개 · 원료사 확인 ${suppliers}개`}</p>
      </div>
      {rows.length ? <IngredientCopyButton disabled={loading} getText={() => provenanceToText(rows.map((source) => ({ name: source.ingredientName, provenance: source })), product.name)} /> : null}
    </div>
    {refreshing ? <p role="status" className="mt-2 text-[12px] text-ink-3">이전에 확인한 정보를 표시하며 최신 자료를 확인 중입니다.</p> : null}
    {error ? <div role="alert" className="mt-3 rounded border border-line-strong p-3 text-[12px] text-ink-2">
      <p>{error} 아래에는 기존에 확인된 자료만 표시합니다.</p>
      <button type="button" onClick={onRetry} className="mt-2 rounded border border-line-strong px-3 py-1.5">다시 조회</button>
    </div> : !loading && trace ? <div className="mt-3 rounded border border-line bg-surface-sunken p-3 text-[12px] leading-5 text-ink-2">
      {trace.status === 'matched' && trace.lot ? <><p className="font-medium text-ink">{trace.lot.productionDate} 생산분의 원산지</p><p>{trace.message}</p>
        <a href={trace.lot.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">생산 이력 원문 보기 ↗</a></> : <>
        <p className="font-medium text-ink">{trace.status === 'needs_review' ? '유사 이력 발견 · 추가 대조 필요' : '일치하는 공개 이력 없음'}</p>
        <p>{trace.message}</p>
        {trace.candidates.map(candidate => <a key={candidate.sourceUrl} href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block underline underline-offset-2">{candidate.productName} 이력 확인 ↗</a>)}
      </>}
    </div> : null}
    <p className="my-3 text-[12px] leading-5 text-ink-3">원산지는 공개 생산 이력, 원료사는 별도 공식 제품 설명을 기준으로 확인합니다. 미확인은 연결된 자료에 근거가 없다는 뜻이며, 실제 사용 원료는 생산분에 따라 달라질 수 있습니다.</p>
    {rows.length ? <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] table-fixed border-collapse text-left text-[13px]">
        <caption className="sr-only">{product.name} 원료별 원료사와 원산지</caption>
        <colgroup><col className="w-2/5" /><col className="w-1/5" /><col className="w-2/5" /></colgroup>
        <thead className="bg-surface-sunken text-[12px] text-ink-2"><tr>
          <th scope="col" className="p-2 font-medium">원료</th>
          <th scope="col" className="p-2 font-medium">원료사</th>
          <th scope="col" className="p-2 font-medium">원산지 · 근거</th>
        </tr></thead>
        <tbody>{visible.map((source) => <tr key={source.ingredientName} className="border-b border-line align-top">
          <th scope="row" className="w-2/5 p-2 font-normal text-ink">{source.ingredientName}
            {source.scope ? <p className="mt-1 text-[11px] text-ink-2">{source.scope}</p> : null}
          </th>
          <td className="p-2 text-ink-2">{source.supplier || '미확인'}</td>
          <td className="p-2 text-ink-2">{loading && !hasProvenance(source) ? '조회 중…' : originLabel(source)}{hasProvenance(source) ? <ProvenanceDetails source={source} /> : null}</td>
        </tr>)}</tbody>
      </table>
      {ordered.length > 6 ? <button type="button" onClick={() => setShowAll((value) => !value)}
        aria-expanded={showAll} className="mt-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-ink-2 hover:bg-surface-sunken">
        {showAll ? '원료 목록 접기' : `나머지 ${ordered.length - 6}개 원료 보기`}
      </button> : null}
    </div> : <p className="text-[13px] text-ink-3">원료명 미확인</p>}
  </section>
}
