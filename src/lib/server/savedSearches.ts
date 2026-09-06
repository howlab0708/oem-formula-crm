import { getSql } from '../db'
import type { SavedSearch, SavedSearchInput } from '../savedSearches'

let ready: Promise<void> | null = null
async function prepare() {
  if (!ready) ready = getSql().begin(async sql => {
    await sql`create table if not exists saved_searches (
      id uuid primary key, owner_key text not null,
      scope text not null check (scope in ('private', 'team')), name text not null,
      filters jsonb not null, rda_profile text not null, generation text,
      result_count integer not null check (result_count >= 0), created_at timestamptz not null default now()
    )`
    await sql`create index if not exists saved_searches_owner_created_idx on saved_searches(owner_key, created_at desc)`
    await sql`create index if not exists saved_searches_team_created_idx on saved_searches(created_at desc) where scope = 'team'`
    await sql`alter table saved_searches enable row level security`
    await sql`revoke all on saved_searches from public`
    await sql`do $$ begin
      if exists(select 1 from pg_roles where rolname='anon') then revoke all on saved_searches from anon; end if;
      if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on saved_searches from authenticated; end if;
    end $$`
  }).then(() => undefined).catch(error => { ready = null; throw error })
  await ready
  return getSql()
}
type Row = { id: string; owner_key: string; scope: 'private'|'team'; name: string; filters: SavedSearchInput['filters']; rda_profile: string; generation: string|null; result_count: number; created_at: string }
const present = (row: Row, owner: string): SavedSearch => ({ id: row.id, name: row.name, scope: row.scope, filters: row.filters,
  rdaProfile: row.rda_profile, generation: row.generation, resultCount: row.result_count, createdAt: row.created_at, canDelete: row.owner_key === owner })
export async function listSavedSearches(owner: string, page = 1) {
  const sql = await prepare()
  const rows = await sql<Row[]>`select * from saved_searches where owner_key=${owner} or scope='team' order by created_at desc, id desc limit 31 offset ${(page-1)*30}`
  return { items: rows.slice(0,30).map(row => present(row, owner)), hasMore: rows.length > 30 }
}
export async function getSavedSearch(id: string, owner: string) {
  const sql = await prepare()
  const [row] = await sql<Row[]>`select * from saved_searches where id=${id} and (owner_key=${owner} or scope='team')`
  return row ? present(row, owner) : null
}
export async function createSavedSearch(id: string, owner: string, input: SavedSearchInput) {
  const sql = await prepare()
  const [row] = await sql<Row[]>`insert into saved_searches(id,owner_key,scope,name,filters,rda_profile,generation,result_count)
    values(${id},${owner},${input.scope},${input.name},${sql.json(input.filters)},${input.rdaProfile},${input.generation},${input.resultCount}) returning *`
  return present(row, owner)
}
export async function deleteSavedSearch(id: string, owner: string) {
  const sql = await prepare()
  const rows = await sql`delete from saved_searches where id=${id} and owner_key=${owner} returning id`
  return rows.length > 0
}
