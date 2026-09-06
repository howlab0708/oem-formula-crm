import { getSql } from '../db'
import { companyKey, type FormulaNote, type FormulaNoteInput, type NoteCompany, type NoteSummary } from '../formulaNotes'

let ready: Promise<void> | null = null

async function ensureSchema() {
  const sql = getSql()
  // 기존 제품 데이터와 별도 테이블. 앱의 공용 로그인 뒤에서만 서버가 접근한다.
  await sql.begin(async (tx) => {
    await tx`create table if not exists oem_formula_notes (
      id uuid primary key,
      company text not null,
      company_key text not null,
      title text not null,
      source_text text not null,
      memo text not null default '',
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
    await tx`alter table oem_formula_notes enable row level security`
    await tx`revoke all on oem_formula_notes from public`
    // Supabase의 공개 API 역할에는 회사 노트를 노출하지 않는다.
    await tx`do $$ begin
      if exists(select 1 from pg_roles where rolname = 'anon') then
        revoke all on oem_formula_notes from anon;
      end if;
      if exists(select 1 from pg_roles where rolname = 'authenticated') then
        revoke all on oem_formula_notes from authenticated;
      end if;
    end $$`
    await tx`create index if not exists oem_formula_notes_company_updated_idx on oem_formula_notes (company_key, updated_at desc, id)`
    await tx`create index if not exists oem_formula_notes_updated_idx on oem_formula_notes (updated_at desc, id)`
  })
}

async function database() {
  if (!ready) ready = ensureSchema().catch((error) => { ready = null; throw error })
  await ready
  return getSql()
}

export async function listNoteCompanies(): Promise<NoteCompany[]> {
  const sql = await database()
  return sql<NoteCompany[]>`select company_key as key, min(company) as name, count(*)::integer as count
    from oem_formula_notes group by company_key order by min(company)`
}

export async function listNotes(company: string, query: string, page: number) {
  const sql = await database()
  // 검색어의 %와 _도 와일드카드가 아닌 글자 그대로 찾는다.
  const search = `%${query.replace(/[\\%_]/g, '\\$&')}%`
  const rows = await sql<NoteSummary[]>`select id, company, title, version,
    created_at::text as "createdAt", updated_at::text as "updatedAt"
    from oem_formula_notes
    where (${company} = '' or company_key = ${company})
      and (${query} = '' or company ilike ${search} or title ilike ${search} or memo ilike ${search} or source_text ilike ${search})
    order by updated_at desc, id limit 25 offset ${(page - 1) * 24}`
  return { notes: rows.slice(0, 24), hasMore: rows.length > 24 }
}

export async function getNote(id: string): Promise<FormulaNote | null> {
  const sql = await database()
  const rows = await sql<FormulaNote[]>`select id, company, title, source_text as "sourceText", memo, version,
    created_at::text as "createdAt", updated_at::text as "updatedAt" from oem_formula_notes where id = ${id}::uuid`
  return rows[0] ?? null
}

export async function createNote(id: string, input: FormulaNoteInput) {
  const sql = await database()
  // 같은 저장 요청의 재시도는 새 노트를 중복 생성하지 않는다.
  await sql`insert into oem_formula_notes (id, company, company_key, title, source_text, memo)
    values (${id}::uuid, ${input.company}, ${companyKey(input.company)}, ${input.title}, ${input.sourceText}, ${input.memo})
    on conflict (id) do nothing`
  const note = await getNote(id)
  if (!note || note.company !== input.company || note.title !== input.title || note.sourceText !== input.sourceText || note.memo !== input.memo) {
    throw new Error('NOTE_CONFLICT')
  }
  return note
}

export async function updateNote(id: string, version: number, input: FormulaNoteInput) {
  const sql = await database()
  const rows = await sql<FormulaNote[]>`update oem_formula_notes set company = ${input.company}, company_key = ${companyKey(input.company)},
    title = ${input.title}, source_text = ${input.sourceText}, memo = ${input.memo}, version = version + 1, updated_at = now()
    where id = ${id}::uuid and version = ${version}
    returning id, company, title, source_text as "sourceText", memo, version, created_at::text as "createdAt", updated_at::text as "updatedAt"`
  if (!rows[0]) throw new Error('NOTE_CONFLICT')
  return rows[0]
}

export async function deleteNote(id: string, version: number) {
  const sql = await database()
  const rows = await sql`delete from oem_formula_notes where id = ${id}::uuid and version = ${version} returning id`
  if (!rows.length) throw new Error('NOTE_CONFLICT')
}
