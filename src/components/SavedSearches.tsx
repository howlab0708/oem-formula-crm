'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedSearch, SavedSearchInput } from '@/lib/savedSearches'
import { copyText } from '@/lib/export/download'
import { Modal } from '@/components/Modal'
import { filterChips } from '@/lib/filters'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) throw new Error(body?.error ?? '즐겨찾기를 불러오지 못했습니다.')
  return body
}
const button = 'rounded border border-line px-2 py-1 text-[12px] text-ink-2 hover:bg-surface-sunken disabled:opacity-50'
export function SavedSearches({ current, onRestore, onNotice }: {
  current: Omit<SavedSearchInput, 'name' | 'scope'>; onRestore: (item: SavedSearch) => void; onNotice: (message: string) => void
}) {
  const [items, setItems] = useState<SavedSearch[]>([])
  const [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false)
  const [name, setName] = useState(''), [scope, setScope] = useState<'private'|'team'>('private')
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false)
  const [message, setMessage] = useState(''), [open, setOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [selected, setSelected] = useState<SavedSearch | null>(null)
  const restoreRef = useRef(onRestore), noticeRef = useRef(onNotice)
  useEffect(() => { restoreRef.current = onRestore; noticeRef.current = onNotice }, [onRestore, onNotice])
  const refresh = useCallback(async (next = 1) => {
    const result = await request<{ items: SavedSearch[]; hasMore: boolean }>(`/api/favorites?page=${next}`)
    setItems(result.items); setHasMore(result.hasMore); setPage(next); setReady(true)
  }, [])
  useEffect(() => {
    let cancelled = false
    const loadLink = async () => {
      const id = new URL(window.location.href).searchParams.get('saved')
      if (!id) return
      try {
        const result = await request<{ item: SavedSearch }>(`/api/favorites?id=${encodeURIComponent(id)}`)
        if (!cancelled) restoreRef.current(result.item)
      } catch (error) { if (!cancelled) noticeRef.current(error instanceof Error ? error.message : '검색 링크를 확인해 주세요.') }
    }
    /*
     * Establish the browser cookie before loading a private link.
     *
     * 첫 요청이 한 번 어긋나면(데이터베이스 첫 연결 지연 등) 목록이 비고 저장 버튼이
     * 잠긴 채로 남는다. 개발 모드에서는 Strict Mode 가 이 효과를 두 번 돌려 그 실패를
     * 가려 주지만 운영에는 그런 보정이 없다. 그래서 여기서 한 번만 직접 다시 부른다.
     */
    const load = async (): Promise<{ items: SavedSearch[]; hasMore: boolean }> => {
      try {
        return await request<{ items: SavedSearch[]; hasMore: boolean }>('/api/favorites')
      } catch (error) {
        if (cancelled) throw error
        await new Promise(resolve => setTimeout(resolve, 600))
        if (cancelled) throw error
        return await request<{ items: SavedSearch[]; hasMore: boolean }>('/api/favorites')
      }
    }
    load().then(result => {
      if (cancelled) return
      setItems(result.items); setHasMore(result.hasMore); setReady(true)
      return loadLink()
    }).catch(error => { if (!cancelled) { setMessage(error.message); if (new URL(window.location.href).searchParams.has('saved')) noticeRef.current(error.message) } })
    window.addEventListener('popstate', loadLink)
    return () => { cancelled = true; window.removeEventListener('popstate', loadLink) }
  }, [refresh])
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await task() } catch (error) { setMessage(error instanceof Error ? error.message : '요청에 실패했습니다.') }
    finally { setBusy(false) }
  }
  const urlFor = (id: string) => { const url = new URL('/', window.location.origin); url.searchParams.set('saved', id); return url.toString() }
  const restore = (item: SavedSearch) => {
    window.history.pushState(null, '', urlFor(item.id))
    onRestore(item)
    setSelected(null)
    setListOpen(false)
  }
  return <section className="border-t border-line px-4 py-3 text-[13px]" aria-label="저장된 검색">
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-ink">즐겨찾기</h3>
      <button type="button" className={button} aria-haspopup="dialog" onClick={() => setOpen(true)}>+ 현재 검색 저장</button></div>
    {open ? <Modal title="즐겨찾기 저장" onClose={() => setOpen(false)}><form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); void run(async () => {
      await request('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...current, name, scope }) })
      setName(''); setOpen(false); await refresh(); setMessage('검색 조건을 저장했습니다.')
    }) }}>
      <label className="block">검색 이름<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded border border-line p-2" placeholder="예: 비타민C 정제 브리핑" /></label>
      <label className="block">공개 범위<select value={scope} onChange={e => setScope(e.target.value as 'private'|'team')} className="mt-1 w-full rounded border border-line p-2"><option value="private">나만 보기 · 현재 브라우저</option><option value="team">팀 전체 공유</option></select></label>
      <p className="text-[12px] leading-4 text-ink-3">나만 보기는 현재 브라우저에서만 열 수 있습니다. 쿠키를 지우거나 다른 기기를 사용하면 접근할 수 없습니다. 팀 공유 링크도 서비스 로그인이 필요합니다.</p>
      <button disabled={busy || !ready} className={button}>{busy ? '저장 중…' : '즐겨찾기 저장'}</button>
      {message ? <p role="status" className="text-[12px] text-ink-3">{message}</p> : null}
    </form></Modal> : null}
    <ul className="mt-2 space-y-1">{items.slice(0, 3).map(item => <li key={item.id}>
      <button type="button" aria-haspopup="dialog" onClick={() => setSelected(item)} title={item.name}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-sunken">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-ink-3"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z" /></svg><span className="min-w-0 flex-1 truncate">{item.name}</span><span aria-hidden className="text-ink-3">›</span>
      </button>
    </li>)}</ul>
    {!items.length ? <p className="py-1 text-[12px] text-ink-3">{ready ? '자주 쓰는 검색을 저장해 보세요.' : message ? '즐겨찾기를 불러오지 못했습니다.' : '즐겨찾기 불러오는 중…'}</p> : null}
    <button type="button" aria-haspopup="dialog" onClick={() => setListOpen(true)} className="mt-1 text-[12px] text-ink-3 hover:text-accent-strong">즐겨찾기 전체 보기 ↗</button>
    {listOpen ? <Modal title="즐겨찾기" onClose={() => setListOpen(false)}>
    <ul className="mt-3 space-y-2">{items.map(item => <li key={item.id} className="rounded border border-line p-2">
      <button type="button" className="w-full break-words text-left font-medium text-ink hover:underline" aria-haspopup="dialog" onClick={() => setSelected(item)}>{item.name}</button>
      <p className="mt-1 text-[11px] text-ink-3">{item.scope === 'team' ? '팀 공유' : '나만 보기'} · 저장 당시 {item.resultCount.toLocaleString('ko-KR')}건</p>
      <div className="mt-2 flex gap-2"><button type="button" className={button} disabled={busy} onClick={() => void run(async () => { const ok = await copyText(urlFor(item.id)); setMessage(ok ? item.scope === 'team' ? '팀 공유 링크를 복사했습니다.' : '현재 브라우저에서만 열리는 링크를 복사했습니다.' : '링크를 복사하지 못했습니다.') })}>링크 복사</button>
        {item.canDelete ? <button type="button" className={button} disabled={busy} onClick={() => void run(async () => {
          await request('/api/favorites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }); await refresh(); setMessage('즐겨찾기를 삭제했습니다.')
        })}>삭제</button> : null}</div>
    </li>)}</ul>
    {!items.length && ready ? <p className="text-[12px] text-ink-3">저장된 검색이 없습니다.</p> : null}
    <div className="mt-2 flex gap-2">{page > 1 ? <button className={button} disabled={busy} onClick={() => void run(() => refresh(page-1))}>이전 목록</button> : null}{hasMore ? <button className={button} disabled={busy} onClick={() => void run(() => refresh(page+1))}>다음 목록</button> : null}
      <button type="button" className={button} disabled={busy} onClick={() => void run(() => refresh())}>목록 새로고침</button></div>
      {message ? <p role="status" className="mt-2 text-[12px] text-ink-3">{message}</p> : null}
    </Modal> : null}
    {selected ? <Modal title={`즐겨찾기 · ${selected.name}`} onClose={() => setSelected(null)} footer={
      <button type="button" onClick={() => restore(selected)} className="w-full rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-strong">이 조건으로 검색</button>
    }>
      <p className="text-[12px] text-ink-3">{selected.scope === 'team' ? '팀 공유' : '나만 보기'} · 저장 당시 {selected.resultCount.toLocaleString('ko-KR')}건</p>
      <ul className="mt-3 space-y-2">{filterChips(selected.filters).map(chip => <li key={chip.key} className="rounded-md border border-line p-3 text-[13px]">
        <span className="mr-2 text-ink-3">{chip.group}</span>{chip.label}
      </li>)}</ul>
      {!filterChips(selected.filters).length ? <p className="mt-3 text-[13px] text-ink-2">전체 제품</p> : null}
    </Modal> : null}
    {message ? <p role="status" className="mt-2 break-words text-[12px] leading-4 text-ink-3">{message}</p> : null}
  </section>
}
