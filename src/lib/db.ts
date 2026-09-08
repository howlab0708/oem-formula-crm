/**
 * Postgres 연결과 레퍼런스 데이터 영속화.
 *
 * 이 앱은 원래 브라우저 메모리에만 데이터를 뒀다(새로고침하면 예시 데이터로 복귀).
 * 여기서는 CSV 업로드 결과를 Supabase(Postgres)에 통째로 적재해 모든 사용자·모든
 * 새로고침에서 같은 데이터를 보게 한다.
 *
 * 적재 방식은 "세대(generation) 통째 교체"다. CSV 를 다시 올릴 때마다 새 세대 id 를
 * 발급하고, 배치별로 그 세대에 행을 쌓다가, 마지막에 하나만 `complete` 로 표시하고
 * 나머지 세대는 지운다. 그래서 업로드 도중 브라우저가 닫혀도 이전 데이터가 반쯤
 * 섞인 상태로 보이는 일이 없다 - 항상 마지막으로 "완료"된 세대만 보인다.
 */

import postgres from 'postgres'
import type { TransactionSql } from 'postgres'
import type { DatasetProvenance } from './datasetProvenance'
import type { Product } from './types'

let sqlInstance: ReturnType<typeof postgres> | null = null
let schemaReady: Promise<void> | null = null

/** Vercel 의 Supabase 연동이 넣어주는 환경변수 중 접속 가능한 것을 고른다. */
function connectionString(): string | null {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  )
}

export function isDatabaseConfigured(): boolean {
  return connectionString() !== null
}

/**
 * 커넥션 풀은 지연 생성한다. 서버리스 함수가 재사용될 때 같은 인스턴스를 그대로 쓴다.
 * `prepare: false` 는 Supabase 커넥션 풀러(Supavisor, transaction mode)에서
 * 프로토콜 수준 프리페어드 스테이트먼트가 깨지는 걸 막기 위함이다.
 */
export function getSql() {
  if (sqlInstance) return sqlInstance
  const url = connectionString()
  if (!url) {
    throw new Error(
      'POSTGRES_URL 환경변수가 없습니다. Vercel 프로젝트에서 Storage > Postgres(Supabase) 연결을 확인하세요.',
    )
  }
  sqlInstance = postgres(url, {
    ssl: 'require',
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return sqlInstance
}

/**
 * 이 배포가 쓰는 회사 스키마 이름.
 *
 * 회사마다 배포를 따로 두고 `APP_TENANT` 만 다르게 준다. 값이 없으면 `public` -
 * 회사가 한 곳뿐인 기존 배포가 그대로 동작한다.
 *
 * 제품 레퍼런스(`products`, `import_status`, `oem_cache.dataset_snapshots`)는 이
 * 스키마에 넣지 않는다. 식약처 공개 데이터라 회사별로 가릴 이유가 없고, 159MB 를
 * 회사마다 복사하면 무료 요금제 용량(500MB)에 세 곳부터 들어가지 않는다.
 * 회사별로 나누는 것은 배합비·노트·원료단가·즐겨찾기뿐이다.
 */
export function tenantSchema(): string {
  const raw = process.env.APP_TENANT?.trim()
  if (!raw) return 'public'
  // SQL 식별자로 그대로 들어가는 값이라 형태를 좁게 제한한다.
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(raw)) {
    throw new Error('APP_TENANT 는 소문자·숫자·밑줄만 쓸 수 있습니다(첫 글자는 문자 또는 밑줄).')
  }
  if (raw === 'pg_catalog' || raw.startsWith('pg_')) {
    throw new Error('APP_TENANT 에 pg_ 로 시작하는 이름은 쓸 수 없습니다.')
  }
  return raw
}

/** 회사 데이터를 읽고 쓰는 트랜잭션. 이 안에서만 회사 표에 접근한다. */
export type TenantSql = TransactionSql

/**
 * 회사 스키마로 한정한 트랜잭션을 열어 준다.
 *
 * `search_path` 에 이 회사 스키마만 넣는다 - `public` 을 뒤에 붙이지 않는 게 핵심이다.
 * 붙이면 회사 스키마에 표가 없을 때 조용히 `public` 의 표로 넘어가, 다른 회사 데이터가
 * 보이는 최악의 실패가 된다. 지금 형태에서는 표가 없으면 오류로 멈춘다.
 *
 * `set local` 이라 트랜잭션이 끝나면 되돌아간다. 커넥션 풀러가 접속을 돌려 써도
 * 다음 요청에 설정이 새지 않는다.
 *
 * 회사 표를 다루는 모듈은 `getSql` 을 직접 쓰지 않고 이 함수만 쓴다.
 * `scripts/verify-tenant-isolation.mjs` 가 그 규칙을 확인한다.
 */
export async function withTenant<T>(run: (tx: TenantSql) => Promise<T>): Promise<T> {
  const schema = tenantSchema()
  const sql = getSql()
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local search_path to ${schema}`)
    return run(tx)
  }) as Promise<T>
}

/**
 * 이 배포에서 제품 레퍼런스 CSV 를 갈아 끼울 수 있는지.
 *
 * 제품 레퍼런스는 회사별로 나누지 않고 한 벌만 둔다(용량 때문에). 그래서 어느
 * 배포에서 CSV 를 올리면 다른 회사가 보는 데이터 기준일까지 함께 바뀐다.
 * 식약처 공개 데이터를 관리하는 쪽(관리자 배포)에서만 올리도록 `APP_DATASET_ADMIN=1`
 * 이 있을 때만 허용한다.
 *
 * 회사가 한 곳뿐이면(`APP_TENANT` 없음) 지금까지처럼 그냥 올릴 수 있다.
 */
export function canReplaceDataset(): boolean {
  if (tenantSchema() === 'public') return true
  return process.env.APP_DATASET_ADMIN === '1'
}

/** 회사 스키마를 만든다. 표 생성 전에 한 번 부른다. */
export async function ensureTenantSchema(): Promise<void> {
  const schema = tenantSchema()
  if (schema === 'public') return
  await getSql().unsafe(`create schema if not exists ${schema}`)
}

async function ensureSchema(): Promise<void> {
  const sql = getSql()
  await sql`
    create table if not exists import_status (
      generation text primary key,
      status text not null default 'in_progress',
      file_name text,
      total_rows integer,
      imported_rows integer not null default 0,
      started_at timestamptz not null default now(),
      finished_at timestamptz
    )
  `
  await sql`
    create table if not exists products (
      id text not null,
      generation text not null references import_status(generation) on delete cascade,
      seq integer not null,
      payload jsonb not null,
      primary key (generation, id)
    )
  `
  await sql`alter table import_status add column if not exists provenance jsonb`
  await sql`create index if not exists products_generation_seq_idx on products (generation, seq)`
}

/** 스키마 생성은 서버리스 인스턴스당 한 번만 - 매 요청마다 확인하지 않는다. */
async function withSchema() {
  if (!schemaReady) schemaReady = ensureSchema()
  await schemaReady
  return getSql()
}

export type ImportStatusRow = {
  provenance?: DatasetProvenance | null
  generation: string
  status: string
  file_name: string | null
  total_rows: number | null
  imported_rows: number
  started_at: string
  finished_at: string | null
}

/**
 * 새 적재를 시작한다. 이전에 중단된(끝맺지 못한) `in_progress` 세대가 있으면
 * 먼저 지운다 - 그러지 않으면 업로드가 실패할 때마다 고아 행이 쌓인다.
 */
export async function startImport(fileName: string, totalRows: number, provenance: DatasetProvenance | null = null): Promise<string> {
  const sql = await withSchema()
  await sql`delete from import_status where status = 'in_progress'`
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  await sql`
    insert into import_status (generation, status, file_name, total_rows, provenance)
    values (${generation}, 'in_progress', ${fileName}, ${totalRows}, ${provenance ? sql.json(provenance) : null})
  `
  return generation
}

/** 한 배치(수천 건 이하)를 적재한다. 요청 본문 크기 제한 때문에 호출 쪽에서 나눠 보낸다. */
export async function insertBatch(
  generation: string,
  products: Product[],
  seqOffset: number,
): Promise<void> {
  if (products.length === 0) return
  const sql = await withSchema()
  const rows = products.map((product, index) => ({
    id: product.id,
    generation,
    seq: seqOffset + index,
    payload: sql.json(product),
  }))
  await sql`insert into products ${sql(rows, 'id', 'generation', 'seq', 'payload')}`
  await sql`
    update import_status set imported_rows = imported_rows + ${products.length}
    where generation = ${generation}
  `
}

/** 적재를 마무리한다. 이 세대만 `complete` 로 표시하고 나머지는 지운다(연쇄삭제로 상품행도 함께). */
export async function finishImport(generation: string): Promise<ImportStatusRow> {
  const sql = await withSchema()
  const [status] = await sql<ImportStatusRow[]>`
    update import_status set status = 'complete', finished_at = now()
    where generation = ${generation}
    returning generation, status, file_name, total_rows, imported_rows, started_at::text, finished_at::text, provenance
  `
  if (!status) throw new Error('알 수 없는 세대입니다. 처음부터 다시 업로드해 주세요.')
  await sql`delete from import_status where generation <> ${generation}`
  return status
}

export type ActiveDataset = {
  meta: ImportStatusRow
  products: Product[]
}

/** 화면에 보여줄 "완료된" 최신 데이터셋. 없으면 null(예시 데이터를 쓰라는 신호). */
export async function getActiveDataset(): Promise<ActiveDataset | null> {
  const sql = await withSchema()
  const [status] = await sql<ImportStatusRow[]>`
    select generation, status, file_name, total_rows, imported_rows,
           started_at::text, finished_at::text, provenance
    from import_status
    where status = 'complete'
    order by finished_at desc
    limit 1
  `
  if (!status) return null

  const rows = await sql<{ payload: Product }[]>`
    select payload from products where generation = ${status.generation} order by seq asc
  `
  return { meta: status, products: rows.map((row) => row.payload) }
}

/**
 * 완료된 최신 세대의 메타데이터만 가볍게 가져온다(상품 본문은 포함하지 않음).
 *
 * `getActiveDataset` 처럼 4만 건 넘는 상품 payload 를 한 번에 다 실어 보내면
 * 응답이 수십 MB 가 되어 Vercel 서버리스 함수의 응답 크기 제한을 넘겨 매번
 * 조용히 실패한다(로컬 `next dev` 에서는 이 제한이 없어서 재현되지 않았다).
 * 그래서 목록은 `getProductsPage` 로 나눠 받는다.
 */
export async function getDatasetMeta(): Promise<ImportStatusRow | null> {
  const sql = await withSchema()
  const [status] = await sql<ImportStatusRow[]>`
    select generation, status, file_name, total_rows, imported_rows,
           started_at::text, finished_at::text, provenance
    from import_status
    where status = 'complete'
    order by finished_at desc
    limit 1
  `
  return status ?? null
}

/** 한 세대의 상품 목록 중 일부(offset~offset+limit)만 가져온다. 응답 크기를 작게 유지하기 위함. */
export async function getProductsPage(
  generation: string,
  offset: number,
  limit: number,
): Promise<Product[]> {
  const sql = await withSchema()
  const rows = await sql<{ payload: Product }[]>`
    select payload from products
    where generation = ${generation}
    order by seq asc
    offset ${offset} limit ${limit}
  `
  return rows.map((row) => row.payload)
}

/** 한 세대를 한 번에 읽어 재사용 가능한 전송용 묶음을 만든다. */
export async function getSnapshotProducts(generation: string): Promise<Product[]> {
  const sql = await withSchema()
  const rows = await sql<{ payload: Product }[]>`
    select payload from products where generation = ${generation} order by seq asc
  `
  return rows.map((row) => row.payload)
}

let snapshotSchemaReady: Promise<void> | null = null

async function snapshotSql() {
  const sql = await withSchema()
  if (!snapshotSchemaReady) {
    snapshotSchemaReady = (async () => {
      // 공개 Data API에 노출하지 않는 전용 스키마. 원본 삭제 시 캐시도 함께 정리된다.
      await sql`create schema if not exists oem_cache`
      await sql`
        create table if not exists oem_cache.dataset_snapshots (
          generation text not null references public.import_status(generation) on delete cascade,
          version integer not null,
          payload bytea not null,
          primary key (generation, version)
        )
      `
      await sql`alter table oem_cache.dataset_snapshots enable row level security`
    })().catch((error) => {
      snapshotSchemaReady = null
      throw error
    })
  }
  await snapshotSchemaReady
  return sql
}

export async function readDatasetSnapshot(generation: string, version: number): Promise<Buffer | null> {
  const sql = await snapshotSql()
  const [row] = await sql<{ payload: Buffer }[]>`
    select payload from oem_cache.dataset_snapshots
    where generation = ${generation} and version = ${version}
  `
  return row?.payload ?? null
}

export async function writeDatasetSnapshot(generation: string, version: number, payload: Buffer): Promise<void> {
  const sql = await snapshotSql()
  await sql`
    insert into oem_cache.dataset_snapshots (generation, version, payload)
    values (${generation}, ${version}, ${payload})
    on conflict (generation, version) do nothing
  `
}
