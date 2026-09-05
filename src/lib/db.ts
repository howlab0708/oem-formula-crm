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
function getSql() {
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
  await sql`create index if not exists products_generation_seq_idx on products (generation, seq)`
}

/** 스키마 생성은 서버리스 인스턴스당 한 번만 - 매 요청마다 확인하지 않는다. */
async function withSchema() {
  if (!schemaReady) schemaReady = ensureSchema()
  await schemaReady
  return getSql()
}

export type ImportStatusRow = {
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
export async function startImport(fileName: string, totalRows: number): Promise<string> {
  const sql = await withSchema()
  await sql`delete from import_status where status = 'in_progress'`
  const generation = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  await sql`
    insert into import_status (generation, status, file_name, total_rows)
    values (${generation}, 'in_progress', ${fileName}, ${totalRows})
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
    returning generation, status, file_name, total_rows, imported_rows, started_at::text, finished_at::text
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
           started_at::text, finished_at::text
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
           started_at::text, finished_at::text
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
