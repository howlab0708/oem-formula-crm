import { createHash, randomUUID } from 'node:crypto'
import { ensureTenantSchema, isDatabaseConfigured, withTenant } from '../db'
import type { CompanyFile } from '../companyCsv'
import type { Product } from '../types'

type Query = <T>(sql: string, params?: unknown[]) => Promise<T[]>
type Database = { query: Query; transaction: <T>(fn: (query: Query) => Promise<T>) => Promise<T> }
type StoredFile = CompanyFile & { signature: string; products: Product[] }
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
export const COMPANY_SCHEMA = `create table if not exists oem_company_files (
  id uuid primary key, signature text not null unique, name text not null,
  count integer not null, active boolean not null default true,
  products jsonb not null, created_at timestamptz not null default now()
);
alter table oem_company_files enable row level security;
revoke all on oem_company_files from public;
do $$ begin
  if exists(select 1 from pg_roles where rolname='anon') then revoke all on oem_company_files from anon; end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on oem_company_files from authenticated; end if;
end $$;`
const COLUMNS = 'id, name, count, active, created_at::text as "createdAt"'
const meta = ({ id, name, count, active, createdAt }: CompanyFile): CompanyFile => ({ id, name, count, active, createdAt })

function prepareFile(name: string, products: Product[]): StoredFile {
  const serialized = JSON.stringify(products)
  if (Buffer.byteLength(serialized) > 2_500_000) throw new Error('변환 결과가 너무 큽니다. CSV를 작은 파일로 나누어 주세요.')
  const id = randomUUID(), createdAt = new Date().toISOString()
  return { id, name, createdAt, count: products.length, active: true, signature: digest(serialized),
    products: products.map(product => ({ ...product, id: `company-${digest(JSON.stringify(product))}`,
      companySource: { fileId: id, fileName: name, importedAt: createdAt } })) }
}

/** Each adapter is bound to exactly one tenant's transaction; never touches the shared MFDS tables. */
export class CompanyStore {
  constructor(private db: Database) {}
  list() { return this.db.query<CompanyFile>(`select ${COLUMNS} from oem_company_files order by created_at desc, id`) }
  async products(id: string) {
    const rows = await this.db.query<{ products: Product[] }>('select products from oem_company_files where id=$1 and active=true', [id])
    return rows[0]?.products ?? []
  }
  async add(name: string, products: Product[]) {
    const file = prepareFile(name, products)
    return this.db.transaction(async query => {
      // Serialize capacity checks and duplicate writes for this tenant only.
      await query('lock table oem_company_files in share row exclusive mode')
      const existing = await query<CompanyFile>(`select ${COLUMNS} from oem_company_files where signature=$1`, [file.signature])
      if (existing.length) return { file: existing[0], duplicate: true }
      const [size] = await query<{ files: number; rows: number }>('select count(*)::int as files, coalesce(sum(count),0)::int as rows from oem_company_files')
      if (size.files >= 100 || size.rows + file.count > 50000) throw new Error('회사 데이터는 최대 100개 파일, 50,000행까지 보관할 수 있습니다.')
      const [saved] = await query<CompanyFile>(`insert into oem_company_files(id,signature,name,count,products) values($1,$2,$3,$4,$5::jsonb) returning ${COLUMNS}`,
        [file.id, file.signature, name, file.count, JSON.stringify(file.products)])
      return { file: saved, duplicate: false }
    })
  }
  async setActive(id: string, active: boolean) {
    const rows = await this.db.query<CompanyFile>(`update oem_company_files set active=$2 where id=$1 returning ${COLUMNS}`, [id, active])
    if (!rows.length) throw new Error('이 회사의 파일을 찾을 수 없습니다.')
    return rows[0]
  }
}

let ready: Promise<void> | null = null
async function databaseStore() {
  if (!ready) ready = (async () => {
    await ensureTenantSchema()
    await withTenant(async tx => { await tx.unsafe(COMPANY_SCHEMA) })
  })().catch(error => { ready = null; throw error })
  await ready
  const transaction: Database['transaction'] = fn => withTenant(tx => fn(async <T>(sql: string, params: unknown[] = []) =>
    [...await tx.unsafe(sql, params as never[])] as T[]))
  return new CompanyStore({ query: (sql, params) => transaction(query => query(sql, params)), transaction })
}

// Local review without production credentials. The UI labels this storage explicitly.
let localQueue: Promise<unknown> = Promise.resolve()
async function localRun<T>(fn: (files: StoredFile[]) => T, write = false): Promise<T> {
  const task = localQueue.then(async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const dir = path.join(process.cwd(), 'tmp', 'company-data-local')
    const target = path.join(dir, 'files.json')
    const files: StoredFile[] = await fs.readFile(target, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const result = fn(files)
    if (write) {
      await fs.mkdir(dir, { recursive: true })
      const temp = `${target}.${randomUUID()}.tmp`
      await fs.writeFile(temp, JSON.stringify(files))
      await fs.rename(temp, target)
    }
    return result
  })
  localQueue = task.catch(() => {})
  return task
}
const localStore = {
  list: () => localRun(files => files.map(meta).reverse()),
  products: (id: string) => localRun(files => files.find(file => file.id === id && file.active)?.products ?? []),
  add: (name: string, products: Product[]) => localRun(files => {
    const file = prepareFile(name, products)
    const existing = files.find(item => item.signature === file.signature)
    if (existing) return { file: meta(existing), duplicate: true }
    if (files.length >= 100 || files.reduce((sum, f) => sum + f.count, 0) + file.count > 50000) throw new Error('최대 100개 파일, 50,000행까지 보관할 수 있습니다.')
    files.push(file)
    return { file: meta(file), duplicate: false }
  }, true),
  setActive: (id: string, active: boolean) => localRun(files => {
    const file = files.find(file => file.id === id)
    if (!file) throw new Error('파일을 찾을 수 없습니다.')
    file.active = active
    return meta(file)
  }, true),
}
export const companyStorageIsLocal = () => !isDatabaseConfigured() && process.env.NODE_ENV === 'development'
export async function companyStore() {
  if (companyStorageIsLocal()) return localStore
  if (!isDatabaseConfigured()) throw new Error('회사 데이터 서버 저장소가 연결되지 않았습니다.')
  return databaseStore()
}
