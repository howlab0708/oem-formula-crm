import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { withSchema } from '../db'
import type { Product } from '../types'
import { SyncError, type MFDSPayload } from './mfdsC003'

type Row = Record<string, unknown>
export type Query = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>
export type SyncDatabase = { query: Query; transaction: <T>(fn: (q: Query) => Promise<T>) => Promise<T> }
export type SyncRun = {
  id: string; baseline: string | null; state: 'running' | 'paused' | 'complete' | 'failed'
  expected: number | null; fetched: number; added: number; changed: number; retained: number
  owner: string | null; lease_until: string | null; started_at: string; finished_at: string | null
  message: string | null; updated_through: string | null; dated_rows: number
}
const LOCK = 'select pg_advisory_xact_lock(734003, 1)'
export const SYNC_SCHEMA = `
  create schema if not exists oem_sync;
  create table if not exists oem_sync.runs (
    id text primary key, baseline text, state text not null,
    expected integer, fetched integer not null default 0,
    added integer not null default 0, changed integer not null default 0, retained integer not null default 0,
    owner text, lease_until timestamptz, started_at timestamptz not null default now(), finished_at timestamptz,
    message text, updated_through text, dated_rows integer not null default 0
  );
  create unique index if not exists one_pending_sync on oem_sync.runs ((true)) where state in ('running', 'paused');
  create table if not exists oem_sync.requests (singleton boolean primary key default true check(singleton), times timestamptz[] not null default '{}');
  insert into oem_sync.requests(singleton) values(true) on conflict do nothing;
  alter table oem_sync.runs enable row level security;
  alter table oem_sync.requests enable row level security;
  create index if not exists products_generation_report_idx on public.products (generation, (payload->>'reportNo'));
`

let ready: Promise<void> | null = null
export async function productionSyncStore(): Promise<SyncStore> {
  const sql = await withSchema()
  const db: SyncDatabase = {
    query: async <T extends Row>(query: string, params: unknown[] = []) => [...await sql.unsafe<T[]>(query, params as never[])],
    transaction: fn => sql.begin(async tx => fn(async <T extends Row>(query: string, params: unknown[] = []) => [...await tx.unsafe<T[]>(query, params as never[])])) as ReturnType<typeof fn>,
  }
  if (!ready) ready = db.query(SYNC_SCHEMA).then(() => undefined).catch(error => { ready = null; throw error })
  await ready
  return new SyncStore(db)
}

/** Short transactions only. No transaction holds a database connection while calling MFDS. */
export class SyncStore {
  constructor(private db: SyncDatabase) {}

  async reclaimSpace(): Promise<void> {
    // A full dataset is ~159 MB. Reuse pages released by old staging/rollback generations
    // before filling another generation; do not wait for a later autovacuum cycle.
    // VACUUM runs outside a transaction and does not remove live rows or lock out readers.
    await this.db.query('vacuum public.products')
  }

  async latest(): Promise<(SyncRun & { busy: boolean }) | null> {
    const [row] = await this.db.query<SyncRun & { busy: boolean }>(`select *, coalesce(lease_until > now(), false) as busy from oem_sync.runs order by started_at desc limit 1`)
    return row ?? null
  }

  async claim(): Promise<SyncRun> {
    return this.db.transaction(async q => {
      await q(LOCK)
      const [pending] = await q<SyncRun & { busy: boolean; stale: boolean }>(`select *, coalesce(lease_until > now(), false) as busy, started_at < now() - interval '12 hours' as stale from oem_sync.runs where state in ('running','paused') for update`)
      if (pending?.busy) throw new SyncError('busy', '이미 업데이트하고 있습니다.', true)
      // MFDS does not expose snapshot tokens. Never resume pagination across source refresh days.
      if (pending?.stale) {
        await q(`update oem_sync.runs set state='failed', owner=null, lease_until=null, finished_at=now(), message='이전 수집이 오래되어 처음부터 다시 확인합니다.' where id=$1`, [pending.id])
        await q(`delete from public.import_status where generation=$1 and status='sync_staging'`, [pending.id])
      } else if (pending) {
        const [claimed] = await q<SyncRun>(`update oem_sync.runs set state='running', owner=$2, lease_until=now()+interval '6 minutes', message=null where id=$1 returning *`, [pending.id, randomUUID()])
        return claimed
      }
      const [recent] = await q(`select 1 from oem_sync.runs where state='complete' and finished_at > now()-interval '1 hour' limit 1`)
      if (recent) throw new SyncError('recent', '최근 1시간 이내에 업데이트했습니다. 잠시 후 다시 확인해 주세요.', true)
      // Only abandoned CSV staging is disposable; the currently visible generation is never removed here.
      await q(`delete from public.import_status where status='in_progress' and started_at < now()-interval '2 hours'`)
      if ((await q(`select 1 from public.import_status where status in ('in_progress','sync_staging') limit 1`)).length) throw new SyncError('busy', '다른 데이터 적재가 진행 중입니다.', true)
      const [baseline] = await q<{ generation: string }>(`select generation from public.import_status where status='complete' order by finished_at desc limit 1`)
      if (baseline && (await q(`select 1 from public.products where generation=$1 and coalesce(payload->>'reportNo','')<>'' group by payload->>'reportNo' having count(*)>1 limit 1`, [baseline.generation])).length) throw new SyncError('identity', '기존 데이터의 중복 신고번호를 확인한 뒤 연동할 수 있습니다.')
      // Keep one rollback generation after a successful publish; prune it only when preparing the next run.
      await q(`delete from public.import_status where status='archived'`)
      const id = `mfds-${randomUUID()}`
      await q(`insert into public.import_status(generation,status,file_name) values($1,'sync_staging','식약처 C003 자동 연동')`, [id])
      const [run] = await q<SyncRun>(`insert into oem_sync.runs(id,baseline,state,owner,lease_until) values($1,$2,'running',$3,now()+interval '6 minutes') returning *`, [id, baseline?.generation ?? null, randomUUID()])
      return run
    })
  }

  private async owned(q: Query, run: SyncRun): Promise<SyncRun> {
    const [current] = await q<SyncRun>(`select * from oem_sync.runs where id=$1 and owner=$2 and state='running' and lease_until>now() for update`, [run.id, run.owner])
    if (!current || current.fetched !== run.fetched) throw new SyncError('lease', '다른 업데이트 작업이 이어받았습니다.', true)
    return current
  }

  async chargeRequest(run: SyncRun): Promise<void> {
    await this.db.transaction(async q => {
      await this.owned(q, run)
      const [row] = await q<{ count: number }>(`select (select count(*)::int from unnest(times) t where t > now()-interval '1 hour') as count from oem_sync.requests where singleton=true for update`)
      if (Number(row.count) >= 90) throw new SyncError('quota', '시간당 조회 한도에 가까워 잠시 중단했습니다. 1시간 후 이어받을 수 있습니다.', true)
      await q(`update oem_sync.requests set times=array(select t from unnest(times) t where t > now()-interval '1 hour') || array[now()] where singleton=true`)
    })
  }

  async savePage(run: SyncRun, page: MFDSPayload): Promise<SyncRun> {
    return this.db.transaction(async q => {
      await this.owned(q, run)
      if (run.expected !== null && run.expected !== page.total) throw new SyncError('source_changed', '수집 중 식약처 전체 건수가 바뀌었습니다. 다시 업데이트해 주세요.')
      if (!page.products.length || run.fetched + page.products.length > page.total) throw new SyncError('count', '식약처 수집 건수가 맞지 않습니다.')
      if (run.expected === null) {
        const [baseline] = await q<{ count: number }>(`select count(*)::int as count from public.products where generation=$1`, [run.baseline])
        if (page.total < baseline.count * 0.9) throw new SyncError('shrink', '식약처 전체 건수가 기존보다 크게 줄어 반영을 중단했습니다.')
      }
      const reports = page.products.map(p => p.reportNo)
      // JSON is already serialized here. Infer text parameters so postgres.js does not encode it twice.
      const prior = await q<{ id: string; payload: Product }>(`select id,payload from public.products where generation=$1 and payload->>'reportNo' in (select jsonb_array_elements_text($2::text::jsonb))`, [run.baseline, JSON.stringify(reports)])
      const oldByReport = new Map(prior.map(p => [p.payload.reportNo, p]))
      if ((await q(`select 1 from public.products where generation=$1 and payload->>'reportNo' in (select jsonb_array_elements_text($2::text::jsonb)) limit 1`, [run.id, JSON.stringify(reports)])).length) throw new SyncError('duplicate', '수집된 신고번호가 중복되어 기존 데이터를 유지합니다.')
      let added = 0, changed = 0, dated = 0, through = run.updated_through
      const rows = page.products.map((incoming, index) => {
        const old = oldByReport.get(incoming.reportNo)
        if (old && ((old.payload.licenseNo && old.payload.licenseNo !== incoming.licenseNo)
          || (old.payload.mainDetail && !incoming.mainDetail)
          || ((old.payload.mainIngredients.length + old.payload.subIngredients.length) > 0 && !(incoming.mainIngredients.length + incoming.subIngredients.length))
          || (old.payload.sourceUpdatedAt && (!incoming.sourceUpdatedAt || incoming.sourceUpdatedAt < old.payload.sourceUpdatedAt)))) {
          throw new SyncError('regression', '기존 제품의 제조소·원료·기준 정보와 불일치가 있어 반영을 중단했습니다.')
        }
        const product = { ...old?.payload, ...incoming, id: old?.id ?? incoming.id }
        if (!old) added++
        else if (Object.keys(incoming).some(key => !['id','licenseNo','sourceUpdatedAt'].includes(key) && !isDeepStrictEqual(old.payload[key as keyof Product], product[key as keyof Product]))) changed++
        if (incoming.sourceUpdatedAt) { dated++; if (!through || incoming.sourceUpdatedAt > through) through = incoming.sourceUpdatedAt }
        return { id: product.id, seq: run.fetched + index, payload: product }
      })
      await q(`insert into public.products(generation,id,seq,payload) select $1,r.id,r.seq,r.payload from jsonb_to_recordset($2::text::jsonb) as r(id text,seq integer,payload jsonb)`, [run.id, JSON.stringify(rows)])
      await q(`update public.import_status set total_rows=$2, imported_rows=$3 where generation=$1 and status='sync_staging'`, [run.id, page.total, run.fetched + rows.length])
      const [updated] = await q<SyncRun>(`update oem_sync.runs set expected=$3, fetched=fetched+$4, added=added+$5, changed=changed+$6, updated_through=$7, dated_rows=dated_rows+$8, lease_until=now()+interval '6 minutes' where id=$1 and owner=$2 returning *`, [run.id, run.owner, page.total, rows.length, added, changed, through, dated])
      return updated
    })
  }

  async publish(run: SyncRun, verifiedTotal: number): Promise<void> {
    await this.db.transaction(async q => {
      await q(LOCK)
      await this.owned(q, run)
      const [active] = await q<{ generation: string }>(`select generation from public.import_status where status='complete' order by finished_at desc limit 1`)
      const [count] = await q<{ count: number }>(`select count(*)::int as count from public.products where generation=$1`, [run.id])
      if ((active?.generation ?? null) !== run.baseline || run.expected !== verifiedTotal || run.fetched !== verifiedTotal || count.count !== verifiedTotal) throw new SyncError('publish', '전체 자료 검증이 일치하지 않아 기존 데이터를 유지합니다.')
      // Missing from the API is not proof of cancellation. Retain those records, and show the retained count.
      const retained = await q(`insert into public.products(generation,id,seq,payload)
        select $1,p.id,$3+row_number() over(order by p.seq)::int-1,p.payload from public.products p
        where p.generation=$2 and not exists(select 1 from public.products n where n.generation=$1 and n.id=p.id) returning id`, [run.id, run.baseline, run.fetched])
      const provenance = { source: 'mfds-c003', transport: 'api', updatedThrough: run.updated_through, datedRows: run.dated_rows }
      await q(`update public.import_status set status='archived' where status='complete'`)
      await q(`update public.import_status set status='complete', finished_at=now(), total_rows=$2, imported_rows=$2, provenance=$3::text::jsonb where generation=$1 and status='sync_staging'`, [run.id, run.fetched + retained.length, JSON.stringify(provenance)])
      await q(`update oem_sync.runs set state='complete', retained=$3, finished_at=now(), owner=null, lease_until=null, message=null where id=$1 and owner=$2`, [run.id, run.owner, retained.length])
    })
  }

  async stop(run: SyncRun, error: SyncError): Promise<void> {
    await this.db.transaction(async q => {
      await q(LOCK)
      const rows = await q(`update oem_sync.runs set state=$3, message=$4, owner=null, lease_until=null, finished_at=case when $3='failed' then now() else null end where id=$1 and owner=$2 and state='running' returning id`, [run.id, run.owner, error.retryable ? 'paused' : 'failed', error.message])
      if (rows.length && !error.retryable) await q(`delete from public.import_status where generation=$1 and status='sync_staging'`, [run.id])
    })
  }
}
