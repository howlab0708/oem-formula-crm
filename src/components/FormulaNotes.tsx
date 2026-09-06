'use client'

import { useEffect, useRef, useState } from 'react'
import { FormulaNotePreview } from '@/components/FormulaNotePreview'
import { copyText } from '@/lib/export/download'
import { companyKey, NOTE_TEXT_LIMIT, parseBriefingText, validateNoteInput, type FormulaNote, type FormulaNoteInput, type NoteCompany, type NoteSummary } from '@/lib/formulaNotes'

const fieldClass = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 disabled:opacity-60'
const buttonClass = 'rounded-md border border-line bg-surface px-3 py-2 text-[12px] font-medium text-ink-2 hover:bg-surface-sunken disabled:opacity-50'
const primaryClass = 'rounded-md bg-accent px-4 py-2 text-[12px] font-medium text-white hover:bg-accent-strong disabled:opacity-50'

async function noteRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw new Error('로그인이 만료되었을 수 있습니다. 입력 내용을 복사한 뒤 다시 로그인해 주세요.')
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? '노트 요청을 처리하지 못했습니다.')
  return data as T
}

export default function FormulaNotes() {
  const [companies, setCompanies] = useState<NoteCompany[]>([])
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [company, setCompany] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<{ key: number; note: FormulaNote | null }>({ key: 0, note: null })
  const dirty = useRef(false)
  const saving = useRef(false)
  const requestId = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ company, query, page: String(page) })
      noteRequest<{ companies: NoteCompany[]; notes: NoteSummary[]; hasMore: boolean }>(`/api/notes?${params}`, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) { setCompanies(data.companies); setNotes(data.notes); setHasMore(data.hasMore) } })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '목록을 불러오지 못했습니다.') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [company, query, page, refresh])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault() }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const canLeave = () => !saving.current && (!dirty.current || window.confirm('저장하지 않은 내용이 있습니다. 변경사항을 버리고 이동할까요?'))
  function newNote() {
    if (!canLeave()) return
    requestId.current += 1
    setOpening(false)
    dirty.current = false
    setEditor((current) => ({ key: current.key + 1, note: null }))
  }
  async function openNote(id: string) {
    if (!canLeave()) return
    const token = ++requestId.current
    setOpening(true)
    try {
      const data = await noteRequest<{ note: FormulaNote }>(`/api/notes?id=${encodeURIComponent(id)}`)
      if (token !== requestId.current) return
      dirty.current = false
      setEditor((current) => ({ key: current.key + 1, note: data.note }))
    } catch (cause) { if (token === requestId.current) setError(cause instanceof Error ? cause.message : '노트를 열지 못했습니다.') }
    finally { if (token === requestId.current) setOpening(false) }
  }

  return <main className="mx-auto max-w-[100rem] space-y-5 px-4 py-6 lg:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-[20px] font-semibold">회사별 배합비 노트</h2>
        <p className="mt-1 text-[13px] text-ink-2">검색한 배합 조건과 시장 근거를 회사별로 모아 두고, 상담 내용을 이어서 관리하세요.</p>
        <p className="mt-2 text-[11px] text-ink-3">서버에 저장 · 같은 서비스 사용자와 공유</p></div>
      <button type="button" className={primaryClass} onClick={newNote}>+ 새 노트</button>
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-lg border border-line bg-surface p-4" aria-label="회사별 노트 목록">
        <div className="flex items-center justify-between"><h3 className="text-[14px] font-semibold">저장된 노트</h3>
          <button type="button" className="text-[12px] text-accent-strong" onClick={() => setRefresh((n) => n + 1)}>새로고침</button></div>
        <label className="block text-[12px] text-ink-2">회사 선택
          <select aria-label="회사 선택" className={`${fieldClass} mt-1.5`} value={company} onChange={(event) => { setCompany(event.target.value); setPage(1) }}>
            <option value="">전체 회사 ({companies.reduce((sum, item) => sum + item.count, 0)}건)</option>
            {companies.map((item) => <option key={item.key} value={item.key}>{item.name} ({item.count}건)</option>)}
          </select>
        </label>
        <input aria-label="노트 검색" placeholder="회사명, 제목, 원료, 메모 검색" maxLength={150} className={fieldClass} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
        {error ? <p role="alert" className="rounded-md bg-danger-soft p-3 text-[12px] text-danger">{error}</p> : null}
        {loading ? <p role="status" className="py-6 text-center text-[12px] text-ink-3">목록을 불러오는 중…</p>
          : !notes.length && !error ? <p className="py-8 text-center text-[12px] text-ink-3">{query || company ? '조건에 맞는 노트가 없습니다.' : '첫 번째 회사 노트를 저장해 보세요.'}</p>
          : <ul className="max-h-[32rem] space-y-2 overflow-y-auto">{notes.map((note) => <li key={note.id}>
            <button type="button" disabled={opening} onClick={() => openNote(note.id)} aria-pressed={editor.note?.id === note.id}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${editor.note?.id === note.id ? 'border-accent-line bg-accent-soft' : 'border-line hover:bg-surface-sunken'}`}>
              <span className="text-[11px] font-medium text-accent-strong">{note.company}</span>
              <strong className="mt-1 block text-[13px] font-medium keep-all">{note.title}</strong>
              <span className="mt-2 block text-[11px] text-ink-3">{dateLabel(note.updatedAt)} 수정</span>
            </button>
          </li>)}</ul>}
        <div className="flex items-center justify-between text-[12px] text-ink-3">
          <button type="button" className={buttonClass} disabled={page <= 1 || loading} onClick={() => setPage((n) => n - 1)}>이전</button>
          <span>{page}페이지</span><button type="button" className={buttonClass} disabled={!hasMore || loading} onClick={() => setPage((n) => n + 1)}>다음</button>
        </div>
      </aside>
      <div className="min-w-0">
        {opening ? <p role="status" className="p-4 text-[12px] text-ink-3">노트를 여는 중…</p> : null}
        <NoteEditor key={editor.key} note={editor.note} companies={companies}
          defaultCompany={companies.find((item) => item.key === company)?.name ?? ''}
          onDirty={(value) => { dirty.current = value }} onBusy={(value) => { saving.current = value }}
          onSaved={(note) => {
            dirty.current = false
            setEditor((current) => ({ key: current.key + 1, note }))
            setCompany(companyKey(note.company)); setQuery(''); setPage(1); setRefresh((n) => n + 1)
          }} onDeleted={() => { dirty.current = false; setEditor((current) => ({ key: current.key + 1, note: null })); setCompany(''); setPage(1); setRefresh((n) => n + 1) }} />
      </div>
    </div>
  </main>
}

function NoteEditor({ note, companies, defaultCompany, onDirty, onBusy, onSaved, onDeleted }: {
  note: FormulaNote | null; companies: NoteCompany[]; defaultCompany: string
  onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void
  onSaved: (note: FormulaNote) => void; onDeleted: () => void
}) {
  const initial: FormulaNoteInput = note ?? { company: defaultCompany, title: '', sourceText: '', memo: '' }
  const [draft, setDraft] = useState<FormulaNoteInput>(initial)
  const [editing, setEditing] = useState(!note)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const createId = useRef<string | null>(null)
  const parsed = parseBriefingText(draft.sourceText)

  function change(field: keyof FormulaNoteInput, value: string) {
    const next = { ...draft, [field]: value }
    setDraft(next)
    onDirty(['company', 'title', 'sourceText', 'memo'].some((key) => next[key as keyof FormulaNoteInput] !== initial[key as keyof FormulaNoteInput]))
    setError(''); setMessage('')
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(''); setMessage('')
    let input
    try { input = validateNoteInput(draft) } catch (cause) { setError((cause as Error).message); return }
    setBusy(true); onBusy(true)
    try {
      createId.current ??= crypto.randomUUID()
      const result = await noteRequest<{ note: FormulaNote }>('/api/notes', {
        method: note ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, id: note?.id ?? createId.current, version: note?.version }),
      })
      onSaved(result.note)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.') }
    finally { setBusy(false); onBusy(false) }
  }
  async function remove() {
    if (!note || busy || !window.confirm(`‘${note.company} / ${note.title}’ 노트를 삭제할까요?`)) return
    setBusy(true); onBusy(true); setError('')
    try {
      await noteRequest('/api/notes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: note.id, version: note.version }) })
      onDeleted()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '삭제하지 못했습니다.') }
    finally { setBusy(false); onBusy(false) }
  }

  return <section className="space-y-5" aria-label="노트 상세">
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-[16px] font-semibold">{note ? (editing ? '노트 수정' : note.title) : '새 배합비 노트'}</h3>
          {note ? <p className="mt-1 text-[12px] text-ink-3">{note.company} · {dateLabel(note.updatedAt)} 서버 저장</p> : null}</div>
        {note && !editing ? <div className="flex gap-2">
          <button type="button" className={buttonClass} disabled={busy} onClick={async () => {
            try { setMessage(await copyText(note.sourceText) ? '브리핑 원문을 복사했습니다.' : '복사 권한을 확인해 주세요.') }
            catch { setError('복사하지 못했습니다. 아래 원문에서 직접 복사해 주세요.') }
          }}>텍스트 복사</button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing(true)}>수정</button>
          <button type="button" className={`${buttonClass} text-danger`} disabled={busy} onClick={remove}>삭제</button>
        </div> : null}
      </div>
      {editing ? <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] text-ink-2">회사명 <span className="text-accent">*</span>
              <input required maxLength={100} list="note-company-options" className={`${fieldClass} mt-1.5`} placeholder="예: 한빛헬스케어" value={draft.company} onChange={(event) => change('company', event.target.value)} />
              <datalist id="note-company-options">{companies.map((item) => <option key={item.key} value={item.name} />)}</datalist>
            </label>
            <label className="text-[12px] text-ink-2">노트 제목 <span className="text-accent">*</span>
              <input required maxLength={150} className={`${fieldClass} mt-1.5`} placeholder="예: 비타민 복합 정제 · 1차 상담" value={draft.title} onChange={(event) => change('title', event.target.value)} />
            </label>
          </div>
          <label className="block text-[12px] text-ink-2">브리핑 붙여넣기 <span className="text-accent">*</span>
            <textarea required maxLength={NOTE_TEXT_LIMIT} rows={5} className={`${fieldClass} mt-1.5 resize-y leading-5`} placeholder="배합비 검색에서 ‘텍스트 복사’를 누른 뒤 여기에 붙여넣으세요." value={draft.sourceText} onChange={(event) => change('sourceText', event.target.value)} />
          </label>
          {draft.sourceText ? <p role="status" className={`text-[12px] ${parsed ? 'text-accent-strong' : 'text-danger'}`}>{parsed ? '브리핑을 인식했습니다. 아래에서 정리된 내용을 확인하세요.' : '브리핑 형식을 인식하지 못했습니다. ‘텍스트 복사’한 내용 전체를 붙여넣어 주세요.'}</p> : null}
          <label className="block text-[12px] text-ink-2">상담 메모
            <textarea maxLength={10_000} rows={3} className={`${fieldClass} mt-1.5 resize-y leading-5`} placeholder="고객 요청, 배합 검토 사항, 다음 상담에서 확인할 내용을 기록하세요." value={draft.memo} onChange={(event) => change('memo', event.target.value)} />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={!parsed || busy} className={primaryClass}>{busy ? '저장 중…' : note ? '변경사항 저장' : '회사 노트에 저장'}</button>
            {note ? <button type="button" className={buttonClass} onClick={() => { setDraft(initial); setEditing(false); onDirty(false); setError('') }}>취소</button> : null}
          </div>
        </fieldset>
      </form> : note?.memo ? <div className="rounded-md bg-surface-sunken p-4"><h4 className="text-[12px] font-medium text-ink-2">상담 메모</h4><p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6">{note.memo}</p></div> : null}
      {error ? <p role="alert" className="mt-3 rounded-md bg-danger-soft p-3 text-[12px] text-danger">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-[12px] text-accent-strong">{message}</p> : null}
    </div>
    <FormulaNotePreview text={draft.sourceText} />
    {draft.sourceText ? <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer text-[12px] font-medium text-ink-2">복사 원문 확인</summary>
      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-[12px] leading-6 text-ink-2">{draft.sourceText}</pre>
    </details> : null}
  </section>
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
