/**
 * 회사(테넌트) 격리 검증.
 *
 *   node scripts/verify-tenant-isolation.mjs
 *
 * 회사 데이터가 다른 회사에 보이면 사업이 끝난다. 그래서 눈으로 확인하지 않고
 * 매번 기계가 확인한다. 두 단계로 본다.
 *
 *  1) 구조 검사 - 언제나 실행한다. DB 가 필요 없다.
 *     회사 표를 다루는 모듈이 `getSql` 을 직접 쓰지 못하게 막혀 있는지 본다.
 *     `withTenant` 만이 DB 로 가는 유일한 길이면, 회사 조건을 빼먹은 쿼리를
 *     쓰는 것 자체가 불가능해진다. 규칙을 사람이 지키는 것보다 이게 확실하다.
 *     `search_path` 에 `public` 이 섞여 있지 않은지도 본다 - 섞이면 회사 표가
 *     없을 때 조용히 public 표로 넘어가 다른 회사 데이터가 보인다.
 *
 *  2) 실제 DB 검사 - `POSTGRES_URL` 이 있을 때만.
 *     임시 스키마 두 개(`tenant_verify_a`, `tenant_verify_b`)를 만들고, 실제 서버
 *     모듈로 A 에 배합비를 저장한 뒤 B 에서 안 보이는지 확인하고 스키마를 지운다.
 *     `public` 과 실제 회사 데이터는 건드리지 않는다.
 *
 *     로컬에서 돌리려면 `.env.local` 에 `POSTGRES_URL=...` 을 넣는다(git 제외 대상).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const TENANT_MODULES = [
  'src/lib/server/formulas.ts',
  'src/lib/server/formulaNotes.ts',
  'src/lib/server/savedSearches.ts',
]
const A = 'tenant_verify_a'
const B = 'tenant_verify_b'

let failed = 0
const check = (ok, label, detail = '') => {
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

// ── 1) 구조 검사 ─────────────────────────────────────────────────────────────
console.log('[구조 검사]')

for (const file of TENANT_MODULES) {
  const source = readFileSync(file, 'utf8')
  // 주석은 빼고 실제 코드만 본다.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  check(!/\bgetSql\b/.test(code), `${file} 이 getSql 을 직접 쓰지 않음`)
  check(/withTenant/.test(code), `${file} 이 withTenant 를 거침`)
}

const db = readFileSync('src/lib/db.ts', 'utf8')
const searchPath = db.match(/set local search_path to [^`]*/)
check(Boolean(searchPath), 'withTenant 가 search_path 를 지정함', searchPath?.[0] ?? '')
check(
  Boolean(searchPath) && !/public/.test(searchPath[0]),
  'search_path 에 public 이 섞이지 않음(섞이면 다른 회사 표로 넘어간다)',
)
check(/create schema if not exists/.test(db), '회사 스키마를 자동 생성함')

// APP_TENANT 값 검증. SQL 식별자로 들어가는 값이라 형태를 좁게 막아야 한다.
// 컴파일 결과는 프로젝트 안에 둔다. 밖에 두면 node 가 node_modules 의 postgres 를 못 찾는다.
const out = 'node_modules/.cache/oem-tenant-verify'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
try {
  execFileSync(
    process.execPath,
    ['node_modules/typescript/bin/tsc', 'src/lib/db.ts', '--outDir', out,
     '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node',
     '--skipLibCheck', '--esModuleInterop'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  )
} catch {
  console.error('tsc 컴파일 실패. `npx tsc --noEmit` 을 먼저 확인하세요.')
  process.exit(1)
}
const { createRequire } = await import('node:module')
const requireOut = createRequire(import.meta.url)
const dbModule = requireOut(resolve(out, 'db.js'))

console.log('\n[APP_TENANT 값 검증]')
const tenantCases = [
  ['', 'public', '값이 없으면 public(기존 단일 배포 유지)'],
  ['tenant_a', 'tenant_a', '정상 이름'],
  ['Tenant_A', null, '대문자 거부'],
  ['a-b', null, '하이픈 거부'],
  ['public; drop table x', null, 'SQL 주입 형태 거부'],
  ['pg_temp', null, 'pg_ 접두사 거부'],
  ['1abc', null, '숫자 시작 거부'],
]
for (const [value, expected, label] of tenantCases) {
  process.env.APP_TENANT = value
  let got
  try {
    got = dbModule.tenantSchema()
  } catch {
    got = null
  }
  check(got === expected, label, `APP_TENANT=${JSON.stringify(value)} → ${got}`)
}
delete process.env.APP_TENANT

console.log('\n[CSV 업로드 제한]')
const datasetCases = [
  [undefined, undefined, true, '단일 배포(APP_TENANT 없음)는 업로드 허용'],
  ['tenant_a', undefined, false, '회사 배포는 기본 차단'],
  ['tenant_a', '1', true, '관리자 배포(APP_DATASET_ADMIN=1)만 허용'],
]
for (const [tenant, admin, expected, label] of datasetCases) {
  if (tenant) process.env.APP_TENANT = tenant
  else delete process.env.APP_TENANT
  if (admin) process.env.APP_DATASET_ADMIN = admin
  else delete process.env.APP_DATASET_ADMIN
  check(dbModule.canReplaceDataset() === expected, label)
}
delete process.env.APP_TENANT
delete process.env.APP_DATASET_ADMIN

// ── 2) 실제 DB 검사 ──────────────────────────────────────────────────────────
function loadEnvLocal() {
  if (process.env.POSTGRES_URL) return
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const value = match[2].replace(/^["']|["']$/g, '')
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}
loadEnvLocal()

console.log('\n[실제 DB 격리 검사]')
if (!process.env.POSTGRES_URL) {
  console.log('  건너뜀 - POSTGRES_URL 이 없습니다.')
  console.log('  로컬에서 확인하려면 .env.local 에 POSTGRES_URL=... 을 넣으세요(git 제외 대상).')
} else {
  try {
    execFileSync(
      process.execPath,
      ['node_modules/typescript/bin/tsc',
       'src/lib/server/formulas.ts', 'src/lib/server/formulaNotes.ts',
       '--outDir', out, '--target', 'es2022', '--module', 'commonjs',
       '--moduleResolution', 'node', '--skipLibCheck', '--esModuleInterop', '--resolveJsonModule'],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
  } catch {
    console.error('  서버 모듈 컴파일 실패.')
    process.exit(1)
  }

  /** 실제 서버 모듈을 자식 프로세스에서 돌린다. 모듈이 스키마 준비를 캐시하므로 회사별로 프로세스를 나눈다. */
  const runAs = (tenant, body) =>
    execFileSync(process.execPath, ['-e', body], {
      env: { ...process.env, APP_TENANT: tenant },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }).trim()

  const sheet = JSON.stringify({
    spec: { productName: '격리검증', customer: '', foodType: '', form: '정제', packaging: '',
      unitWeightMg: '800', unitsPerSet: '60', setCount: '1000', lossPercent: '10',
      intakeGuide: '', shelfLife: '', quotedOn: '', validity: '' },
    materials: [], packagingItems: [], processItems: [], analysisItems: [],
    quote: { overheads: [], vatRate: '10', roundUnit: '1', roundMode: 'round', tiers: [], conditions: '' },
    memo: '',
  })
  const modulePath = JSON.stringify(resolve(out, 'lib/server/formulas.js'))

  try {
    // A 회사에 배합비 하나 저장
    const savedId = runAs(A, `
      const m = require(${modulePath});
      const { randomUUID } = require('node:crypto');
      const id = randomUUID();
      m.createFormula(id, { company: '격리검증A', title: '격리검증 배합비', noteId: null, sheet: ${sheet} })
        .then(() => m.saveIngredientPrices([{ name: '격리검증원료', unitPrice: 1234, note: '' }]))
        .then(() => { console.log(id); process.exit(0) })
        .catch((e) => { console.error(e.message); process.exit(1) });
    `)
    check(Boolean(savedId), `A(${A}) 에 배합비 저장`, savedId.slice(0, 8))

    // A 에서 보이는지
    const seenByA = runAs(A, `
      const m = require(${modulePath});
      Promise.all([m.listFormulas('', '', 1), m.listIngredientPrices()])
        .then(([f, p]) => { console.log(JSON.stringify({ formulas: f.formulas.length, prices: p.length })); process.exit(0) })
        .catch((e) => { console.error(e.message); process.exit(1) });
    `)
    const a = JSON.parse(seenByA)
    check(a.formulas === 1 && a.prices === 1, `A 에서는 자기 데이터가 보임`, seenByA)

    // B 에서는 안 보여야 한다 - 이게 이 스크립트의 존재 이유다
    const seenByB = runAs(B, `
      const m = require(${modulePath});
      Promise.all([m.listFormulas('', '', 1), m.listIngredientPrices(), m.listFormulaCompanies()])
        .then(([f, p, c]) => { console.log(JSON.stringify({ formulas: f.formulas.length, prices: p.length, companies: c.length })); process.exit(0) })
        .catch((e) => { console.error(e.message); process.exit(1) });
    `)
    const b = JSON.parse(seenByB)
    check(b.formulas === 0, `B(${B}) 에서 A 의 배합비가 보이지 않음`, seenByB)
    check(b.prices === 0, 'B 에서 A 의 원료단가가 보이지 않음')
    check(b.companies === 0, 'B 에서 A 의 회사 목록이 보이지 않음')

    // B 에서 id 를 알고 직접 열어도 안 보여야 한다
    const direct = runAs(B, `
      const m = require(${modulePath});
      m.getFormula(${JSON.stringify(savedId)})
        .then((r) => { console.log(r ? 'LEAK' : 'null'); process.exit(0) })
        .catch((e) => { console.error(e.message); process.exit(1) });
    `)
    check(direct === 'null', 'B 에서 A 의 배합비 id 로 직접 조회해도 안 보임', direct)
  } catch (error) {
    check(false, '실제 DB 검사 실행', error instanceof Error ? error.message.split('\n')[0] : '')
  } finally {
    // 임시 스키마 정리. public 과 실제 회사 스키마는 건드리지 않는다.
    try {
      const cleanup = `
        const postgres = require('postgres');
        const sql = postgres(process.env.POSTGRES_URL, { ssl: 'require', prepare: false, max: 1 });
        (async () => {
          await sql.unsafe('drop schema if exists ${A} cascade');
          await sql.unsafe('drop schema if exists ${B} cascade');
          await sql.end();
          console.log('cleaned');
        })().catch((e) => { console.error(e.message); process.exit(1) });
      `
      const cleaned = execFileSync(process.execPath, ['-e', cleanup], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
      check(cleaned === 'cleaned', '임시 스키마 정리')
    } catch (error) {
      check(false, '임시 스키마 정리', `수동으로 지워야 합니다: drop schema ${A} cascade; drop schema ${B} cascade;`)
      console.error(error instanceof Error ? error.message.split('\n')[0] : '')
    }
  }
}

rmSync(out, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '전부 통과' : `${failed}건 실패`}`)
process.exit(failed ? 1 : 0)
