'use client'

import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { FIELD_LABELS, type SchemaField } from '@/lib/csvSchema'
import { CSV_MAX_BYTES, CSV_MAX_FILES, COMPANY_CSV_TEMPLATE, companyProducts, previewCompanyCsv, validateMapping, type CompanyLibrary, type CsvPreview } from '@/lib/companyCsv'
import { quoteFromCsv } from '@/lib/companyQuoteCsv'
import { addCompanyCsv, setCompanyFileActive } from '@/lib/api/companyData'
import { downloadProductsAsCsv } from '@/lib/export/download'
import { calculate } from '@/lib/formulaDesign/calc'

type Pending = { name: string; preview?: CsvPreview; error?: string; saved?: string }
const button = 'rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed'
function inspect(file: Pending) {
  try {
    if (!file.preview) return { error: file.error || '파일을 읽는 중입니다.', products: [], warnings: [], skipped: [], duplicates: 0 }
    if (file.preview.quote) {
      const result = quoteFromCsv(file.preview.rows, file.name)
      return { products: [result.product], warnings: result.warnings, skipped: [], duplicates: 0, error: '' }
    }
    validateMapping(file.preview.mapping, file.preview.headers.length)
    const result = companyProducts(file.preview.rows, file.preview.mapping)
    return { ...result, warnings: [], error: result.products.length ? '' : '가져올 제품이 없습니다. 제품명 열을 확인해 주세요.' }
  } catch (error) { return { error: error instanceof Error ? error.message : '파일을 확인해 주세요.', products: [], warnings: [], skipped: [], duplicates: 0 } }
}

export function CompanyDataPanel({ compact, library, error, loading, onReload, onShowCompany }: {
  compact: boolean; library: CompanyLibrary; error: string; loading: boolean
  onReload: () => Promise<void>; onShowCompany: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const file = pending[selected]
  const review = useMemo(() => file ? inspect(file) : null, [file])
  const quote = review?.products[0]?.companyFormula
  const totals = useMemo(() => quote ? calculate(quote) : null, [quote])
  const allValid = pending.length > 0 && pending.every(item => item.saved || !inspect(item).error)
  const remaining = pending.filter(item => !item.saved).length

  const selectFiles = async (files: FileList | File[]) => {
    if (busy) return
    if (files.length > CSV_MAX_FILES) { setNotice('한 번에 최대 10개 파일을 선택해 주세요.'); return }
    setBusy(true); setNotice(''); setConfirmed(false); setSelected(0)
    const next: Pending[] = []
    for (const f of Array.from(files)) {
      try {
        if (!/\.csv$/i.test(f.name)) throw new Error('엑셀에서 CSV UTF-8로 저장한 파일을 선택해 주세요. PDF·XLSX는 직접 가져오지 않습니다.')
        if (f.size > CSV_MAX_BYTES) throw new Error('파일당 1MB 이하로 나누어 주세요.')
        next.push({ name: f.name, preview: previewCompanyCsv(await f.arrayBuffer()) })
      } catch (error) { next.push({ name: f.name, error: error instanceof Error ? error.message : '파일을 읽지 못했습니다.' }) }
    }
    setPending(next); setBusy(false)
    if (input.current) input.current.value = ''
  }
  const mapColumn = (column: number, field: string) => {
    setConfirmed(false)
    setPending(items => items.map((item, index) => {
      if (index !== selected || !item.preview) return item
      const mapping = { ...item.preview.mapping }
      for (const key of Object.keys(mapping) as SchemaField[]) if (mapping[key] === column) delete mapping[key]
      if (field) mapping[field as SchemaField] = column
      return { ...item, preview: { ...item.preview, mapping } }
    }))
  }
  const save = async () => {
    if (!allValid || !confirmed || busy) return
    setBusy(true); setNotice('')
    const results = [...pending]
    for (let i = 0; i < results.length; i++) {
      const item = results[i]
      if (item.saved || !item.preview) continue
      try {
        const result = await addCompanyCsv({ name: item.name, text: item.preview.text, mapping: item.preview.mapping })
        results[i] = { ...item, saved: result.duplicate ? (result.file.active ? '이미 등록된 파일 · 중복 추가 안 함' : '이미 등록된 파일 · 파일 관리에서 다시 표시 가능') : '저장 완료' }
        setPending([...results])
      } catch (error) {
        setNotice(`${item.name}: ${error instanceof Error ? error.message : '저장 실패'} · 완료된 파일은 유지되며 나머지는 다시 시도할 수 있습니다.`)
        break
      }
    }
    await onReload()
    setBusy(false)
  }
  const toggle = async (id: string, active: boolean) => {
    setBusy(true); setNotice('')
    try { await setCompanyFileActive(id, active); await onReload() }
    catch (error) { setNotice(error instanceof Error ? error.message : '변경 실패') }
    finally { setBusy(false) }
  }
  const template = () => {
    const url = URL.createObjectURL(new Blob([COMPANY_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = '회사_제품목록_양식.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    {compact ? <button type="button" title="회사 데이터 가져오기" aria-label="회사 데이터 가져오기" onClick={() => setOpen(true)} className="mx-2 flex h-9 items-center justify-center rounded-md text-ink-2 hover:bg-surface-sunken"><UploadIcon /></button>
      : <section aria-label="회사 데이터" className="mt-5 rounded-xl border border-line bg-surface-muted p-3">
        <div className="flex items-center gap-2"><UploadIcon /><h2 className="text-[14px] font-semibold">회사 데이터</h2></div>
        <p className="mt-2 text-[12px] leading-5 text-ink-2 keep-all">보유한 제품 목록과 견적서를 가져와 배합 설계에 활용하세요.</p>
        <button type="button" onClick={() => setOpen(true)} className={`${button} mt-3 w-full border-accent-line`}>CSV 가져오기 <span aria-hidden>＋</span></button>
        <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
          <span>{loading ? '불러오는 중…' : `${library.products.length.toLocaleString()}건 · ${library.files.filter(f => f.active).length}개 파일`}</span>
          <button type="button" onClick={() => setOpen(true)} className="rounded px-1 py-1 text-ink-2 underline">파일 관리</button>
        </div>
        {library.products.length ? <button type="button" onClick={onShowCompany} className="mt-1 text-[12px] text-accent-strong underline">회사 데이터만 보기 →</button> : null}
        {error ? <p role="alert" className="mt-2 text-[12px] text-danger">{error} <button type="button" onClick={() => void onReload()} className="underline">다시 시도</button></p> : null}
      </section>}
    {open ? <Modal title="회사 데이터 가져오기" wide onClose={() => { if (!busy) setOpen(false) }} footer={
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-ink-2">{library.local ? '로컬 테스트 저장소 · 운영 서버에 전송하지 않습니다.' : '이 회사의 저장소에 보관되며 식약처 자동 갱신 후에도 유지됩니다.'}</span>
        {pending.length ? remaining ? <button type="button" disabled={!allValid || !confirmed || busy} onClick={() => void save()} className={`${button} border-accent-line text-accent-strong`}>{busy ? '처리 중…' : `${remaining}개 파일 회사 데이터에 추가`}</button>
          : <button type="button" onClick={() => { setOpen(false); onShowCompany() }} className={`${button} border-accent-line`}>가져온 데이터 보기 →</button> : null}
      </div>
    }>
      <p className="text-[14px] leading-6 text-ink-2">제품 목록은 열을 연결하고, 견적서 양식은 원료비·부자재비·가공비·분석비 표를 읽습니다. 저장 전에 가져올 내용을 확인하세요.</p>
      <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void selectFiles(event.dataTransfer.files) }} className="mt-4 rounded-xl border-2 border-dashed border-accent-line bg-surface-muted p-5 text-center">
        <input ref={input} type="file" accept=".csv,text/csv" multiple disabled={busy} aria-label="회사 CSV 파일 선택" className="sr-only" onChange={event => { if (event.target.files?.length) void selectFiles(event.target.files) }} />
        <p className="text-[14px] font-medium">CSV 파일을 끌어 놓거나 선택하세요</p>
        <p className="mt-1 text-[12px] text-ink-3">엑셀 → 다른 이름으로 저장 → CSV UTF-8 · 최대 10개 파일 · 파일당 1MB / 2,000행</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2"><button type="button" disabled={busy} onClick={() => input.current?.click()} className={button}>파일 선택</button><button type="button" onClick={template} className={button}>제품 목록 양식 내려받기</button></div>
      </div>
      {notice ? <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-[13px] text-danger">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-[13px] text-danger">{error} <button type="button" onClick={() => void onReload()} className="underline">다시 불러오기</button></p> : null}
      {pending.length ? <div className="mt-5">
        <div className="flex flex-wrap gap-2" aria-label="선택한 CSV 파일">{pending.map((item, index) => <button type="button" key={index} onClick={() => setSelected(index)} aria-pressed={selected === index} className={`${button} max-w-full truncate ${index === selected ? 'border-accent-line bg-accent-soft' : ''}`}>{item.name} {item.saved ? '✓' : item.error ? '· 확인 필요' : ''}</button>)}</div>
        {file && !file.saved ? <button type="button" disabled={busy} className="mt-2 text-[12px] text-ink-2 underline disabled:opacity-40" onClick={() => { setPending(items => items.filter((_, index) => index !== selected)); setSelected(0); setConfirmed(false) }}>이 파일을 선택에서 제외</button> : null}
        {file?.saved ? <p role="status" className="mt-3 text-[13px] text-accent-strong">{file.saved}</p> : null}
        {file?.preview && review ? <>
          <div className="my-4 flex flex-wrap gap-3 text-[13px]"><strong>{file.preview.quote ? '견적서 양식' : '제품 목록'} 감지</strong><span>{file.preview.encoding.toUpperCase()}</span><span>가져오기 {review.products.length}건</span>{review.skipped.length ? <span className="text-danger">제품명 없는 행 {review.skipped.length}개 제외 ({review.skipped.slice(0, 8).join(', ')}행)</span> : null}{review.duplicates ? <span>파일 안 동일 제품 {review.duplicates}건 제외</span> : null}</div>
          {!file.preview.quote ? <details open={!!review.error} className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-[13px] font-medium">열 연결 확인 · 미연결 열 {file.preview.headers.length - Object.keys(file.preview.mapping).length}개</summary>
            <p className="mt-2 text-[12px] text-ink-3">제품명은 필수입니다. 연결하지 않은 열은 저장하지 않습니다.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{file.preview.headers.map((header, index) => <label key={index} className="flex min-w-0 items-center gap-2 text-[13px]"><span className="w-1/2 truncate" title={header}>{header || `열 ${index + 1}`}</span><select aria-label={`${index + 1}열 ${header} 연결`} disabled={busy || !!file.saved} value={Object.entries(file.preview!.mapping).find(([, col]) => col === index)?.[0] || ''} onChange={event => mapColumn(index, event.target.value)} className="min-w-0 flex-1 rounded border border-line p-2"><option value="">가져오지 않음</option>{Object.entries(FIELD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>)}</div>
          </details> : null}
          {review.error ? <p role="alert" className="mt-3 text-[13px] text-danger">{review.error}</p> : <div className="mt-3 overflow-x-auto rounded-lg border border-line"><table className="w-full text-left text-[13px]"><caption className="p-3 text-left font-medium">가져올 내용 미리보기 {file.preview.quote ? '' : '(최대 5건)'}</caption><thead className="bg-surface-sunken"><tr>{['제품명', '제형·규격', '원료', '포장 개수'].map(label => <th key={label} className="px-3 py-2 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{review.products.slice(0, 5).map((p, i) => <tr key={i} className="border-t border-line"><td className="p-3">{p.name}</td><td className="p-3">{p.form} · {p.weightLabel}</td><td className="max-w-xs p-3">{[...p.mainIngredients, ...p.subIngredients].join(' · ') || '미제공'}</td><td className="p-3">{p.referenceDetails?.unitsPerSet || '미제공'}</td></tr>)}</tbody></table></div>}
          {review.products[0]?.companyFormula ? <div className="mt-3 overflow-x-auto rounded-lg border border-line"><table className="w-full text-[13px]"><caption className="p-3 text-left font-medium">원료 배합·단가 확인</caption><thead className="bg-surface-sunken"><tr><th className="p-2 text-left">원료명</th><th>배합비율 (%)</th><th>사용량 (kg)</th><th>단가 (원/kg)</th></tr></thead><tbody>{review.products[0].companyFormula.materials.map(row => <tr key={row.id} className="border-t border-line"><td className="p-2">{row.name}</td><td className="p-2 text-right">{row.ratio}</td><td className="p-2 text-right">{row.usage || '자동'}</td><td className="p-2 text-right">{row.unitPrice || '미제공'}</td></tr>)}</tbody></table></div> : null}
          {review.warnings.length ? <ul className="mt-3 list-disc space-y-1 rounded-lg bg-surface-sunken py-3 pr-3 pl-7 text-[12px] leading-5 text-ink-2">{review.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
          {quote && totals ? <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer text-[13px] font-medium">비용표·원본 합계 대조 · 계산 공급가 {Math.round(totals.supplyTotal).toLocaleString()}원</summary>
            <p className="mt-2 text-[12px] text-ink-3">원본의 셀 수식은 CSV에 남지 않습니다. 가져온 수량·단가로 다시 계산한 결과입니다.</p>
            {[['부자재비', quote.packagingItems], ['가공비', quote.processItems], ['분석비', quote.analysisItems]] .map(([title, rows]) => <div key={String(title)} className="mt-3"><h4 className="text-[13px] font-semibold">{String(title)}</h4>{(rows as typeof quote.packagingItems).map(row => <p key={row.id} className="mt-1 text-[12px] text-ink-2">{row.label} · {row.quantity || '미제공'} × {row.unitPrice || '미제공'}원 · {row.included ? '합계 포함' : '별도/제공'} {row.note}</p>)}</div>)}
            <pre className="mt-3 whitespace-pre-wrap border-t border-line pt-3 font-sans text-[12px] leading-5 text-ink-2">{quote.memo}</pre>
          </details> : null}
        </> : <p role="alert" className="mt-3 text-[13px] text-danger">{file?.error}</p>}
        {remaining ? <label className="mt-4 flex items-start gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={confirmed} disabled={busy || !allValid} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5" />선택한 파일의 열 연결·가져올 값·제외 항목을 확인했습니다.</label> : null}
      </div> : null}
      <section className="mt-6 border-t border-line pt-4" aria-label="가져온 파일 관리"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-[14px] font-semibold">가져온 파일 · {library.files.length}개</h3>{library.products.length ? <button type="button" className="text-[12px] underline" onClick={() => downloadProductsAsCsv(library.products, '회사_제품목록.csv')}>제품 목록 CSV 내보내기</button> : null}</div>
        <p className="mt-1 text-[12px] text-ink-3">검색에서 제외해도 파일은 보관되며 다시 표시할 수 있습니다. 동일 내용의 파일은 중복 추가하지 않습니다.</p>
        {library.files.length ? <ul className="mt-3 divide-y divide-line">{library.files.map(f => <li key={f.id} className="flex items-center justify-between gap-3 py-3 text-[13px]"><div className="min-w-0"><p className="truncate" title={f.name}>{f.name}</p><p className="mt-1 text-[12px] text-ink-3">{f.count}건 · {f.createdAt.slice(0, 10)} · {f.active ? '검색에 표시' : '검색에서 제외됨'}</p></div><button type="button" disabled={busy} className={`${button} shrink-0`} onClick={() => void toggle(f.id, !f.active)}>{f.active ? '검색에서 제외' : '다시 표시'}</button></li>)}</ul> : <p className="py-5 text-center text-[13px] text-ink-3">아직 가져온 회사 데이터가 없습니다.</p>}
      </section>
    </Modal> : null}
  </>
}
function UploadIcon() { return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0 text-accent-strong"><path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6" /></svg> }
