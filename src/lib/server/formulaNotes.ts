import { ensureTenantSchema, withTenant, type TenantSql } from '../db'
import { companyKey, type FormulaNote, type FormulaNoteInput, type NoteCompany, type NoteSummary } from '../formulaNotes'

let ready: Promise<void> | null = null

/**
 * 회사 노트 표. 회사 스키마 안에 만든다(`withTenant` 가 search_path 를 잡아 준다).
 *
 * 배합비 표가 이 표를 외래키로 참조하므로 `ensureFormulaNotesSchema` 를 밖으로 내보내
 * 배합비 스키마 준비 쪽에서 먼저 부를 수 있게 했다. 새 회사 스키마에서 순서가 뒤집히면
 * 외래키를 걸 대상이 없어 표 생성이 실패한다.
 */
export async function createNotesTable(tx: TenantSql): Promise<void> {
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
}

async function ensureSchema() {
  await ensureTenantSchema()
  await withTenant(createNotesTable)
}

/** 스키마 준비는 서버리스 인스턴스당 한 번. 실패하면 다음 요청에서 다시 시도한다. */
async function prepared(): Promise<void> {
  if (!ready) ready = ensureSchema().catch((error) => { ready = null; throw error })
  await ready
}

/** 회사 표를 다루는 모든 함수는 이 경로로만 DB 에 닿는다. */
async function query<T>(run: (tx: TenantSql) => Promise<T>): Promise<T> {
  await prepared()
  return withTenant(run)
}

export async function listNoteCompanies(): Promise<NoteCompany[]> {
  return query((tx) => tx<NoteCompany[]>`select company_key as key, min(company) as name, count(*)::integer as count
    from oem_formula_notes group by company_key order by min(company)`)
}

export async function listNotes(company: string, query_: string, page: number) {
  return query(async (tx) => {
    // 검색어의 %와 _도 와일드카드가 아닌 글자 그대로 찾는다.
    const search = `%${query_.replace(/[\\%_]/g, '\\$&')}%`
    const rows = await tx<NoteSummary[]>`select id, company, title, version,
      created_at::text as "createdAt", updated_at::text as "updatedAt"
      from oem_formula_notes
      where (${company} = '' or company_key = ${company})
        and (${query_} = '' or company ilike ${search} or title ilike ${search} or memo ilike ${search} or source_text ilike ${search})
      order by updated_at desc, id limit 25 offset ${(page - 1) * 24}`
    return { notes: rows.slice(0, 24), hasMore: rows.length > 24 }
  })
}

export async function getNote(id: string): Promise<FormulaNote | null> {
  return query(async (tx) => {
    const rows = await tx<FormulaNote[]>`select id, company, title, source_text as "sourceText", memo, version,
      created_at::text as "createdAt", updated_at::text as "updatedAt" from oem_formula_notes where id = ${id}::uuid`
    return rows[0] ?? null
  })
}

export async function createNote(id: string, input: FormulaNoteInput) {
  const note = await query(async (tx) => {
    // 같은 저장 요청의 재시도는 새 노트를 중복 생성하지 않는다.
    await tx`insert into oem_formula_notes (id, company, company_key, title, source_text, memo)
      values (${id}::uuid, ${input.company}, ${companyKey(input.company)}, ${input.title}, ${input.sourceText}, ${input.memo})
      on conflict (id) do nothing`
    const rows = await tx<FormulaNote[]>`select id, company, title, source_text as "sourceText", memo, version,
      created_at::text as "createdAt", updated_at::text as "updatedAt" from oem_formula_notes where id = ${id}::uuid`
    return rows[0] ?? null
  })
  if (!note || note.company !== input.company || note.title !== input.title || note.sourceText !== input.sourceText || note.memo !== input.memo) {
    throw new Error('NOTE_CONFLICT')
  }
  return note
}

export async function updateNote(id: string, version: number, input: FormulaNoteInput) {
  const rows = await query((tx) => tx<FormulaNote[]>`update oem_formula_notes set company = ${input.company}, company_key = ${companyKey(input.company)},
    title = ${input.title}, source_text = ${input.sourceText}, memo = ${input.memo}, version = version + 1, updated_at = now()
    where id = ${id}::uuid and version = ${version}
    returning id, company, title, source_text as "sourceText", memo, version, created_at::text as "createdAt", updated_at::text as "updatedAt"`)
  if (!rows[0]) throw new Error('NOTE_CONFLICT')
  return rows[0]
}

export async function deleteNote(id: string, version: number) {
  const rows = await query((tx) => tx`delete from oem_formula_notes where id = ${id}::uuid and version = ${version} returning id`)
  if (!rows.length) throw new Error('NOTE_CONFLICT')
}
