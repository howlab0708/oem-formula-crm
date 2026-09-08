-- 배합 설계 · 견적 산출 테이블
--
-- 앱은 첫 요청에서 같은 내용을 `create table if not exists` 로 만든다
-- (src/lib/server/formulas.ts). 이 파일은 스키마 원본이자 Supabase 콘솔에서
-- 직접 적용할 때 쓰는 대본이다. 두 번 실행해도 안전하다.
--
-- 접근 정책 요약
--   이 앱은 사람별 계정이 없다. 공용 비밀번호로 앱 전체를 막고(src/lib/auth.ts),
--   DB 에는 서버 라우트만 Postgres 연결로 접근한다. 그래서 모든 표에 RLS 를 켜고
--   정책을 만들지 않는다 - 정책이 없으면 anon·authenticated 로는 어떤 행도 보이지
--   않는다(기본 거부). 표 소유자(postgres)로 접속하는 서버 라우트만 읽고 쓴다.
--   회사별 계정을 도입할 때 켤 정책은 파일 끝에 적어 두었다.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ── 1. 배합비 머리 ────────────────────────────────────────────────────────────
-- 회사 노트(oem_formula_notes)와 같은 company_key 규칙을 쓴다. 노트 화면의 회사
-- 선택과 배합비 목록의 회사 선택이 같은 값으로 묶이도록 하기 위함이다.
create table if not exists oem_formulas (
  id uuid primary key,
  company text not null,
  company_key text not null,
  title text not null,
  -- 특정 상담 노트 하위에 배합비를 매단다. 노트가 지워져도 배합비는 남긴다.
  note_id uuid references oem_formula_notes(id) on delete set null,
  -- 포장 단위·제품 정보(PackagingSpec)
  spec jsonb not null,
  -- 간접비·부가세·단가 절사·수량 구간(QuoteSettings)
  quote jsonb not null,
  -- 내부 메모. 고객용 PDF 에는 넣지 않는다.
  memo text not null default '',
  -- 목록 화면에서 시트 본문 없이 보여줄 요약값
  supply_per_set numeric,
  set_count integer,
  -- 낙관적 잠금 + 견적 버전 번호. 저장마다 1 씩 올라간다.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oem_formulas_company_updated_idx
  on oem_formulas (company_key, updated_at desc, id);
create index if not exists oem_formulas_updated_idx on oem_formulas (updated_at desc, id);
create index if not exists oem_formulas_note_idx on oem_formulas (note_id);

-- ── 2. 배합비 줄 ──────────────────────────────────────────────────────────────
-- 1. 원료비 / 2. 부자재비 / 3. 가공비 / 4. 분석비 네 블록의 모든 줄.
-- block, seq 순서가 화면의 줄 순서다. 저장할 때 해당 배합비의 줄을 통째로 다시 쓴다.
create table if not exists oem_formula_ingredients (
  formula_id uuid not null references oem_formulas(id) on delete cascade,
  block text not null,
  seq integer not null,
  -- MaterialRow 또는 LineRow. 공장마다 칸이 달라 열로 쪼개지 않고 그대로 담는다.
  payload jsonb not null,
  primary key (formula_id, block, seq),
  constraint oem_formula_ingredients_block_check
    check (block in ('material', 'packaging', 'process', 'analysis'))
);

-- 위 constraint 는 처음 만들 때만 붙는다. 이미 있는 표에도 확실히 붙이기 위해 한 번 더 시도한다.
do $$ begin
  alter table oem_formula_ingredients add constraint oem_formula_ingredients_block_check
    check (block in ('material', 'packaging', 'process', 'analysis'));
exception when duplicate_object then null; end $$;

-- ── 3. 견적 버전 스냅샷 ───────────────────────────────────────────────────────
-- 저장할 때마다 그 시점의 시트 전체와 계산 결과를 쌓는다. 되돌리기·이력 비교용.
create table if not exists oem_formula_quotes (
  id uuid primary key,
  formula_id uuid not null references oem_formulas(id) on delete cascade,
  version integer not null,
  sheet jsonb not null,
  totals jsonb not null,
  created_at timestamptz not null default now(),
  unique (formula_id, version)
);

create index if not exists oem_formula_quotes_formula_idx
  on oem_formula_quotes (formula_id, version desc);

-- ── 4. 원료단가 기억장 ────────────────────────────────────────────────────────
-- 기능성 원료 DB(공전·인정 자료)에는 단가 열이 없다. 그래서 배합비를 저장할 때
-- 시트에 적힌 단가를 원료명 기준으로 쌓아 두고, 다음 배합비의 자동완성에서 채운다.
create table if not exists oem_ingredient_prices (
  -- 표기 차이를 무시한 원료명 키(공백·중점·괄호 제거, 소문자)
  name_key text primary key,
  name text not null,
  unit_price numeric not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- 정책을 만들지 않는다 = 공개 Data API(anon·authenticated)로는 전부 거부.
alter table oem_formulas enable row level security;
alter table oem_formula_ingredients enable row level security;
alter table oem_formula_quotes enable row level security;
alter table oem_ingredient_prices enable row level security;

revoke all on oem_formulas from public;
revoke all on oem_formula_ingredients from public;
revoke all on oem_formula_quotes from public;
revoke all on oem_ingredient_prices from public;

do $$
declare
  target record;
begin
  for target in
    select t as table_name, r as role_name
    from unnest(array['oem_formulas', 'oem_formula_ingredients', 'oem_formula_quotes', 'oem_ingredient_prices']) as t
    cross join unnest(array['anon', 'authenticated']) as r
  loop
    if exists (select 1 from pg_roles where rolname = target.role_name) then
      execute format('revoke all on %I from %I', target.table_name, target.role_name);
    end if;
  end loop;
end $$;

-- ── 회사별 계정을 도입할 때 ───────────────────────────────────────────────────
-- 지금은 공용 비밀번호 한 개라서 아래 정책이 필요 없다. Supabase Auth 로 사람별
-- 로그인을 붙이고, 사용자의 소속 회사를 JWT 클레임(app_metadata.company_key)에
-- 넣게 되면 아래를 적용하고 authenticated 역할에 grant 를 주면 된다.
--
--   grant select, insert, update, delete on oem_formulas to authenticated;
--
--   create policy oem_formulas_company_read on oem_formulas for select to authenticated
--     using (company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key'));
--   create policy oem_formulas_company_write on oem_formulas for all to authenticated
--     using (company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key'))
--     with check (company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key'));
--
--   create policy oem_formula_ingredients_company on oem_formula_ingredients for all to authenticated
--     using (exists (select 1 from oem_formulas f where f.id = formula_id
--       and f.company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key')))
--     with check (exists (select 1 from oem_formulas f where f.id = formula_id
--       and f.company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key')));
--
--   create policy oem_formula_quotes_company on oem_formula_quotes for all to authenticated
--     using (exists (select 1 from oem_formulas f where f.id = formula_id
--       and f.company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key')))
--     with check (exists (select 1 from oem_formulas f where f.id = formula_id
--       and f.company_key = (auth.jwt() -> 'app_metadata' ->> 'company_key')));
--
-- 원료단가 기억장은 회사 구분이 없는 사내 공용 자료다. 회사별로 나눠야 하면
-- company_key 열을 추가하고 기본키를 (company_key, name_key) 로 바꿔야 한다.
