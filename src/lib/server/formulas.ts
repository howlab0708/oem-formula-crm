/**
 * 배합비·견적서 영속화.
 *
 * 테이블 구성(마이그레이션 원본: `supabase/migrations/0001_formula_design.sql`)
 *   oem_formulas             시트 머리(포장 단위·견적 설정·회사·노트 연결)
 *   oem_formula_ingredients  1~4 블록의 모든 줄. 블록·순서로 정렬해 시트를 되살린다.
 *   oem_formula_quotes       저장할 때마다 쌓는 버전 스냅샷(시트 전체 + 계산 결과)
 *   oem_ingredient_prices    원료단가 기억장. 기능성 원료 DB 에 단가 열이 없어서 앱이 쌓는다.
 *
 * 노트와 같은 방식으로 낙관적 잠금을 쓴다(`version` 이 맞을 때만 갱신).
 * 스키마 생성도 노트와 같이 첫 요청에서 한 번만 확인한다.
 */

import { randomUUID } from 'node:crypto'
import { ensureTenantSchema, withTenant, type TenantSql } from '../db'
import { companyKey } from '../formulaNotes'
import { createNotesTable } from './formulaNotes'
import { calculate } from '../formulaDesign/calc'
import type { FormulaRecord, FormulaSheet, FormulaSummary, IngredientPrice, LineRow, MaterialRow, QuoteVersion } from '../formulaDesign/types'
import type { FormulaInput } from '../formulaDesign/validate'
import { nameKey } from '../formulaDesign/suggest'

let ready: Promise<void> | null = null

async function ensureSchema() {
  await ensureTenantSchema()
  await withTenant(async (tx) => {
    // 배합비가 노트를 외래키로 참조하므로 노트 표를 먼저 만든다.
    await createNotesTable(tx)
    await tx`create table if not exists oem_formulas (
      id uuid primary key,
      company text not null,
      company_key text not null,
      title text not null,
      note_id uuid references oem_formula_notes(id) on delete set null,
      spec jsonb not null,
      quote jsonb not null,
      memo text not null default '',
      supply_per_set numeric,
      set_count integer,
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`
    await tx`create table if not exists oem_formula_ingredients (
      formula_id uuid not null references oem_formulas(id) on delete cascade,
      block text not null,
      seq integer not null,
      payload jsonb not null,
      primary key (formula_id, block, seq)
    )`
    await tx`create table if not exists oem_formula_quotes (
      id uuid primary key,
      formula_id uuid not null references oem_formulas(id) on delete cascade,
      version integer not null,
      sheet jsonb not null,
      totals jsonb not null,
      created_at timestamptz not null default now(),
      unique (formula_id, version)
    )`
    await tx`create table if not exists oem_ingredient_prices (
      name_key text primary key,
      name text not null,
      unit_price numeric not null,
      note text not null default '',
      updated_at timestamptz not null default now()
    )`
    // 공용 로그인 뒤의 서버만 읽고 쓴다. Supabase 공개 Data API 에는 노출하지 않는다.
    // 표 이름은 이 배열의 상수뿐이라 unsafe 로 넣어도 외부 입력이 섞이지 않는다.
    for (const table of ['oem_formulas', 'oem_formula_ingredients', 'oem_formula_quotes', 'oem_ingredient_prices']) {
      await tx.unsafe(`alter table ${table} enable row level security`)
      await tx.unsafe(`revoke all on ${table} from public`)
      await tx.unsafe(`do $$ begin
        if exists(select 1 from pg_roles where rolname = 'anon') then revoke all on ${table} from anon; end if;
        if exists(select 1 from pg_roles where rolname = 'authenticated') then revoke all on ${table} from authenticated; end if;
      end $$`)
    }
    await tx`create index if not exists oem_formulas_company_updated_idx on oem_formulas (company_key, updated_at desc, id)`
    await tx`create index if not exists oem_formulas_updated_idx on oem_formulas (updated_at desc, id)`
    await tx`create index if not exists oem_formulas_note_idx on oem_formulas (note_id)`
    await tx`create index if not exists oem_formula_quotes_formula_idx on oem_formula_quotes (formula_id, version desc)`
  })
}

async function prepared(): Promise<void> {
  if (!ready) ready = ensureSchema().catch((error) => { ready = null; throw error })
  await ready
}

/** 회사 표를 다루는 모든 함수는 이 경로로만 DB 에 닿는다. */
async function query<T>(run: (tx: TenantSql) => Promise<T>): Promise<T> {
  await prepared()
  return withTenant(run)
}

type FormulaHeadRow = {
  id: string
  company: string
  title: string
  noteId: string | null
  version: number
  spec: FormulaSheet['spec']
  quote: FormulaSheet['quote']
  memo: string
  supplyPerSet: string | number | null
  setCount: number | null
  createdAt: string
  updatedAt: string
}

const HEAD_COLUMNS = `id, company, title, note_id as "noteId", version, spec, quote, memo,
  supply_per_set as "supplyPerSet", set_count as "setCount",
  created_at::text as "createdAt", updated_at::text as "updatedAt"`

/** `oem_formula_ingredients.block` 값. 시트의 1~4 블록에 대응한다. */
type BlockName = 'material' | 'packaging' | 'process' | 'analysis'

export async function listFormulaCompanies() {
  return query((tx) => tx<{ key: string; name: string; count: number }[]>`
    select company_key as key, min(company) as name, count(*)::integer as count
    from oem_formulas group by company_key order by min(company)`)
}

export async function listFormulas(company: string, keyword: string, page: number) {
  return query(async (tx) => {
    // 검색어의 %와 _도 와일드카드가 아닌 글자 그대로 찾는다.
    const search = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
    const rows = await tx<FormulaSummary[]>`
      select id, company, title, note_id as "noteId", version,
        supply_per_set::float8 as "supplyPerSet", set_count as "setCount",
        created_at::text as "createdAt", updated_at::text as "updatedAt"
      from oem_formulas
      where (${company} = '' or company_key = ${company})
        and (${keyword} = '' or company ilike ${search} or title ilike ${search}
          or spec->>'productName' ilike ${search} or memo ilike ${search})
      order by updated_at desc, id limit 25 offset ${(page - 1) * 24}`
    return { formulas: rows.slice(0, 24), hasMore: rows.length > 24 }
  })
}

async function assemble(tx: TenantSql, head: FormulaHeadRow): Promise<FormulaRecord> {
  const rows = await tx<{ block: BlockName; payload: MaterialRow | LineRow }[]>`
    select block, payload from oem_formula_ingredients
    where formula_id = ${head.id}::uuid order by block, seq`
  const sheet: FormulaSheet = {
    spec: head.spec,
    materials: [],
    packagingItems: [],
    processItems: [],
    analysisItems: [],
    quote: head.quote,
    memo: head.memo,
  }
  for (const row of rows) {
    if (row.block === 'material') sheet.materials.push(row.payload as MaterialRow)
    else if (row.block === 'packaging') sheet.packagingItems.push(row.payload as LineRow)
    else if (row.block === 'process') sheet.processItems.push(row.payload as LineRow)
    else if (row.block === 'analysis') sheet.analysisItems.push(row.payload as LineRow)
  }
  return {
    id: head.id,
    company: head.company,
    title: head.title,
    noteId: head.noteId,
    version: head.version,
    sheet,
    createdAt: head.createdAt,
    updatedAt: head.updatedAt,
  }
}

export async function getFormula(id: string): Promise<FormulaRecord | null> {
  return query(async (tx) => {
    const [head] = await tx<FormulaHeadRow[]>`select ${tx.unsafe(HEAD_COLUMNS)} from oem_formulas where id = ${id}::uuid`
    return head ? assemble(tx, head) : null
  })
}

/** 블록별 줄을 통째로 다시 쓴다. 줄 순서가 시트의 표시 순서다. */
async function writeRows(tx: TenantSql, formulaId: string, sheet: FormulaSheet) {
  await tx`delete from oem_formula_ingredients where formula_id = ${formulaId}::uuid`
  type Row = { formula_id: string; block: string; seq: number; payload: ReturnType<typeof tx.json> }
  const rows: Row[] = []
  const push = (block: BlockName, items: (MaterialRow | LineRow)[]) => {
    items.forEach((item, index) => {
      rows.push({ formula_id: formulaId, block, seq: index, payload: tx.json({ ...item }) })
    })
  }
  push('material', sheet.materials)
  push('packaging', sheet.packagingItems)
  push('process', sheet.processItems)
  push('analysis', sheet.analysisItems)
  if (rows.length) {
    await tx`insert into oem_formula_ingredients ${tx(rows, 'formula_id', 'block', 'seq', 'payload')}`
  }
}

/** 저장 시점의 시트와 계산 결과를 버전으로 남긴다. 되돌리기와 이력 비교에 쓴다. */
async function writeQuote(tx: TenantSql, formulaId: string, version: number, sheet: FormulaSheet) {
  const totals = calculate(sheet)
  const snapshot = {
    materialCost: totals.materialCost,
    packagingCost: totals.packagingCost,
    processCost: totals.processCost,
    analysisCost: totals.analysisCost,
    excludedCost: totals.excludedCost,
    overheadCost: totals.overheadCost,
    // 간접비는 공장마다 항목이 달라 이름과 함께 남긴다(견적 이력 비교용).
    overheads: totals.overheads.map((item) => ({ label: item.row.label, amount: item.amount })),
    supplyTotal: totals.supplyTotal,
    supplyPerSet: totals.supplyPerSet,
    unitPrice: totals.unitPrice,
    quoteTotal: totals.quoteTotal,
    proposalPerSet: totals.proposalPerSet,
    totalBatchKg: totals.totalBatchKg,
    totalUnits: totals.totalUnits,
    setCount: totals.setCount,
    ratioSum: totals.ratioSum,
  }
  await tx`insert into oem_formula_quotes (id, formula_id, version, sheet, totals)
    values (${randomUUID()}::uuid, ${formulaId}::uuid, ${version}, ${tx.json({ ...sheet })}, ${tx.json(snapshot)})
    on conflict (formula_id, version) do nothing`
  return totals
}

export async function createFormula(id: string, input: FormulaInput): Promise<FormulaRecord> {
  const totals = calculate(input.sheet)
  await query(async (tx) => {
    // 같은 저장 요청의 재시도가 배합비를 두 개 만들지 않게 한다.
    const inserted = await tx`insert into oem_formulas
      (id, company, company_key, title, note_id, spec, quote, memo, supply_per_set, set_count)
      values (${id}::uuid, ${input.company}, ${companyKey(input.company)}, ${input.title},
        ${input.noteId}, ${tx.json({ ...input.sheet.spec })}, ${tx.json({ ...input.sheet.quote })},
        ${input.sheet.memo}, ${totals.supplyPerSet}, ${Number(input.sheet.spec.setCount) || null})
      on conflict (id) do nothing returning id`
    if (!inserted.length) return
    await writeRows(tx, id, input.sheet)
    await writeQuote(tx, id, 1, input.sheet)
  })
  const saved = await getFormula(id)
  if (!saved || saved.title !== input.title || saved.company !== input.company) throw new Error('FORMULA_CONFLICT')
  return saved
}

export async function updateFormula(id: string, version: number, input: FormulaInput): Promise<FormulaRecord> {
  const totals = calculate(input.sheet)
  let nextVersion = 0
  await query(async (tx) => {
    const rows = await tx<{ version: number }[]>`update oem_formulas set
      company = ${input.company}, company_key = ${companyKey(input.company)}, title = ${input.title},
      note_id = ${input.noteId}, spec = ${tx.json(input.sheet.spec as never)},
      quote = ${tx.json({ ...input.sheet.quote })}, memo = ${input.sheet.memo},
      supply_per_set = ${totals.supplyPerSet}, set_count = ${Number(input.sheet.spec.setCount) || null},
      version = version + 1, updated_at = now()
      where id = ${id}::uuid and version = ${version} returning version`
    if (!rows[0]) throw new Error('FORMULA_CONFLICT')
    nextVersion = rows[0].version
    await writeRows(tx, id, input.sheet)
    await writeQuote(tx, id, nextVersion, input.sheet)
  })
  const saved = await getFormula(id)
  if (!saved) throw new Error('FORMULA_CONFLICT')
  return saved
}

export async function deleteFormula(id: string, version: number) {
  const rows = await query((tx) => tx`delete from oem_formulas where id = ${id}::uuid and version = ${version} returning id`)
  if (!rows.length) throw new Error('FORMULA_CONFLICT')
}

export async function listQuoteVersions(formulaId: string): Promise<QuoteVersion[]> {
  return query((tx) => tx<QuoteVersion[]>`select version, created_at::text as "createdAt", totals
    from oem_formula_quotes where formula_id = ${formulaId}::uuid
    order by version desc limit 30`)
}

export async function getQuoteVersion(formulaId: string, version: number): Promise<FormulaSheet | null> {
  return query(async (tx) => {
    const [row] = await tx<{ sheet: FormulaSheet }[]>`select sheet from oem_formula_quotes
      where formula_id = ${formulaId}::uuid and version = ${version}`
    return row?.sheet ?? null
  })
}

export async function listIngredientPrices(): Promise<IngredientPrice[]> {
  return query((tx) => tx<IngredientPrice[]>`select name, unit_price::float8 as "unitPrice", note,
    updated_at::text as "updatedAt" from oem_ingredient_prices order by updated_at desc limit 2000`)
}

/**
 * 원료단가 한 건을 지운다. 표기 차이를 무시한 이름으로 찾으므로
 * 화면에 보이는 이름을 그대로 넘기면 된다.
 */
export async function deleteIngredientPrice(name: string): Promise<number> {
  const rows = await query((tx) => tx`delete from oem_ingredient_prices where name_key = ${nameKey(name)} returning name_key`)
  return rows.length
}

/** 원료단가 기억장을 비운다. 배합비·견적은 건드리지 않는다(별도 표). */
export async function clearIngredientPrices(): Promise<number> {
  const rows = await query((tx) => tx`delete from oem_ingredient_prices returning name_key`)
  return rows.length
}

/** 저장할 때 시트에 적힌 단가를 기억장에 올린다. 같은 원료는 최근 값으로 덮는다. */
export async function saveIngredientPrices(rows: { name: string; unitPrice: number; note: string }[]) {
  if (!rows.length) return
  const byKey = new Map(rows.map((row) => [nameKey(row.name), row]))
  await query(async (tx) => {
    const values = [...byKey].map(([key, row]) => ({
      name_key: key,
      name: row.name,
      unit_price: row.unitPrice,
      note: row.note,
    }))
    await tx`insert into oem_ingredient_prices ${tx(values, 'name_key', 'name', 'unit_price', 'note')}
      on conflict (name_key) do update set name = excluded.name, unit_price = excluded.unit_price,
        note = excluded.note, updated_at = now()`
  })
}
