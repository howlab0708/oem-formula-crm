# 회사별 배포 절차

## 구조

**Supabase 프로젝트 하나에 회사별 스키마를 둔다. Vercel 배포는 회사마다 하나씩.**

```
Supabase 프로젝트 1개 (무료 요금제)
├── public            제품 레퍼런스 (공유)  products, import_status
├── oem_cache         전송용 데이터 묶음 (공유)
├── howlab            하우랩 배합비·노트·원료단가·즐겨찾기
└── company_b         B사  배합비·노트·원료단가·즐겨찾기

Vercel 프로젝트 (회사마다 하나, 같은 GitHub 저장소)
├── oem-formula-howlab  APP_TENANT=howlab      APP_PASSWORD=... APP_DATASET_ADMIN=1
└── oem-formula-b       APP_TENANT=company_b   APP_PASSWORD=...
```

### 왜 제품 레퍼런스만 공유하는가

용량이 결정했다. 실측값:

| 표 | 크기 |
|---|---|
| `products` | 159 MB |
| `oem_cache.dataset_snapshots` | 13 MB |
| 회사 데이터 전부(배합비·노트·단가·즐겨찾기) | 0.4 MB 미만 |

제품 레퍼런스를 회사마다 복사하면 172MB × 회사 수가 되어 무료 요금제 용량(500MB)에
세 곳부터 들어가지 않는다. 공유하면 172MB + 회사당 1MB 미만이라 수십 곳도 들어간다.

식약처 품목제조보고 공개 데이터라 회사별로 가릴 이유도 없다. 대신 한 배포에서 CSV 를
갈아 끼우면 다른 회사가 보는 데이터 기준일까지 바뀌므로, **업로드는 관리자 배포에서만**
허용한다(`APP_DATASET_ADMIN=1`).

### 격리가 무엇으로 보장되는가

회사 데이터를 다루는 모듈(`src/lib/server/formulas.ts`, `formulaNotes.ts`,
`savedSearches.ts`)은 DB 로 가는 길이 `withTenant` 하나뿐이다. `getSql` 을 직접 쓰지
않는다. `withTenant` 는 트랜잭션을 열고 `search_path` 를 그 회사 스키마 **하나로만**
지정한다.

`public` 을 뒤에 붙이지 않는 것이 핵심이다. 붙이면 회사 스키마에 표가 없을 때 조용히
`public` 의 표로 넘어가 다른 회사 데이터가 보인다. 지금 형태에서는 표가 없으면 오류로
멈춘다 - 실패 방향이 안전하다.

`scripts/verify-tenant-isolation.mjs` 가 이 규칙을 매번 확인한다.

```bash
node scripts/verify-tenant-isolation.mjs
```

- 회사 모듈이 `getSql` 을 직접 쓰지 않는지
- `search_path` 에 `public` 이 섞이지 않았는지
- `APP_TENANT` 값 검증(대문자·하이픈·`pg_` 접두사·SQL 주입 형태 거부)
- CSV 업로드 제한이 걸리는지
- `POSTGRES_URL` 이 있으면 **실제로** 임시 스키마 두 개를 만들어 A 에 저장한 배합비가
  B 에서 목록·직접 조회·원료단가 어디에도 안 나오는지 확인하고 스키마를 지운다

RLS 정책은 이 격리에 쓰지 않는다. 서버가 표 소유자 역할로 접속하므로 Postgres 에서
소유자는 기본적으로 RLS 를 적용받지 않는다. 표에 걸어 둔 RLS 는 Supabase 공개 Data
API(anon·authenticated)를 막는 용도다.

---

## 회사 하나를 새로 붙이는 절차

### 1. Vercel 프로젝트 만들기

1. https://vercel.com/new 에서 **같은 GitHub 저장소**(`howlab0708/oem-formula-crm`)를 가져온다.
   한 저장소를 여러 프로젝트에 연결할 수 있다.
2. 프로젝트 이름이 그대로 주소가 되므로 회사를 알 수 있게 둔다.

### 2. 환경변수 넣기

**Settings → Environment Variables** 에 넣는다.

| 이름 | 값 | 설명 |
|---|---|---|
| `POSTGRES_URL` | 기존 Supabase 연결 문자열 | **모든 배포가 같은 값**을 쓴다 |
| `APP_TENANT` | `company_b` | 회사 스키마 이름. 소문자·숫자·밑줄만, 첫 글자는 문자나 밑줄 |
| `APP_PASSWORD` | 회사마다 다른 값 | 같은 값을 쓰면 배포를 나눈 의미가 없다 |
| `APP_DATASET_ADMIN` | `1` | **관리자 배포에만** 넣는다. 없으면 CSV 업로드가 403 |

연결 문자열은 커넥션 풀러(Supavisor, transaction mode) 쪽을 쓴다. 서버리스에서 직결을
쓰면 접속 수가 금방 마른다. 앱은 이 모드에 맞춰 `prepare: false` 로 접속한다.

앱이 읽는 이름은 `POSTGRES_URL` → `POSTGRES_PRISMA_URL` → `POSTGRES_URL_NON_POOLING`
순서다. 하나만 있으면 된다.

환경변수를 넣은 뒤 **Redeploy** 해야 적용된다.

### 3. 스키마와 표 만들기

따로 할 일이 없다. 로그인 후 화면을 한 번 열면 앱이 `create schema if not exists` 와
`create table if not exists` 로 그 회사 스키마와 표를 만든다.

회사 스키마에 만들어지는 표:

```
oem_formula_notes         회사 노트
oem_formulas              배합비
oem_formula_ingredients   배합비 줄
oem_formula_quotes        견적 버전 이력
oem_ingredient_prices     원료단가 기억장
saved_searches            즐겨찾기
```

제품 레퍼런스(`public.products`, `public.import_status`)는 이미 있으므로 새로 올리지
않아도 그 회사 화면에 그대로 보인다.

### 4. 격리 확인

새 배포에 실제 배합비를 넣기 **전에** 확인한다.

```bash
node scripts/verify-tenant-isolation.mjs
```

`.env.local` 에 `POSTGRES_URL` 을 넣어 두면 실제 DB 로 격리까지 확인한다. 그다음 화면에서:

- [ ] 회사 A 비밀번호로 회사 B 주소에 로그인되지 않는다.
- [ ] A 에서 배합비를 저장한 뒤 B 의 **저장된 배합비** 목록에 나오지 않는다.
- [ ] A 에서 배합비를 저장한 뒤 B 의 **원료단가** 목록이 비어 있다.
- [ ] A 의 회사 노트가 B 의 노트 목록에 나오지 않는다.
- [ ] 두 배포의 `APP_TENANT` 값이 서로 다르다.
- [ ] 관리자 배포가 아닌 곳에서 CSV 업로드가 막힌다.

`APP_TENANT` 를 서로 같게 두면 두 회사가 같은 스키마를 쓰게 되어 나머지 격리가 전부
무의미하다. 여기가 유일한 단일 실패 지점이므로 반드시 눈으로 확인한다.

---

## 기존 배포에 `APP_TENANT` 를 붙일 때

지금 운영 중인 배포는 `APP_TENANT` 가 없어 회사 데이터가 `public` 에 있다. 값을 넣으면
그 스키마를 새로 보게 되므로 `public` 에 있던 회사 데이터는 화면에서 사라진다(지워지는
것은 아니다).

데이터가 있다면 Supabase SQL Editor 에서 옮긴다. 없으면 이 단계를 건너뛴다.

```sql
-- 먼저 옮길 게 있는지 센다
select
  (select count(*) from public.oem_formulas)          as 배합비,
  (select count(*) from public.oem_formula_notes)     as 노트,
  (select count(*) from public.oem_ingredient_prices) as 원료단가,
  (select count(*) from public.saved_searches)        as 즐겨찾기;
```

옮길 게 있으면 스키마를 만들고 표를 그대로 이동한다. 표를 옮기므로 인덱스와 제약도
함께 따라간다.

```sql
create schema if not exists howlab;

alter table public.oem_formula_notes       set schema howlab;
alter table public.oem_formulas            set schema howlab;
alter table public.oem_formula_ingredients set schema howlab;
alter table public.oem_formula_quotes      set schema howlab;
alter table public.oem_ingredient_prices   set schema howlab;
alter table public.saved_searches          set schema howlab;
```

`products` 와 `import_status` 는 **옮기지 않는다.** 공유 대상이다.

---

## 운영할 때 주의할 점

**푸시 한 번에 전부 배포된다.** 같은 저장소를 보고 있으므로 `main` 에 푸시하면 연결된
모든 회사 배포가 새 코드로 올라간다. 특정 회사에서만 먼저 검증하려면 그 프로젝트의
Production Branch 를 다르게 두거나 자동 배포를 끈다.

**비밀번호는 회사별로 기록해 둔다.** 어느 회사에 어떤 값을 줬는지 모르면 유출 시 어느
배포를 잠가야 할지 알 수 없다. `APP_PASSWORD` 를 바꾸면 그 배포의 로그인 쿠키가 전부
무효가 되어 즉시 전원 로그아웃된다.

**로그인 쿠키는 도메인 속성 없이 발급**하므로 발급한 호스트에만 전송된다
(`src/app/api/login/route.ts`). `oem-a.vercel.app` 의 쿠키가 `oem-b.vercel.app` 로
넘어가지 않는다. 회사별 서브도메인을 붙여도 같다.

**배포를 헷갈리지 않게 한다.** 화면이 똑같아서 탭 두 개를 열면 어느 회사 것인지
구분되지 않는다. 주소에 회사 이름이 들어가게 짓고, 브라우저 창을 회사별로 나눈다.
화면 상단에 배포 이름을 띄우는 기능이 필요하면 추가할 수 있다.

**무료 요금제의 두 가지 제약.** 데이터베이스 용량 상한(현재 172MB 사용)과, 일정 기간
접속이 없으면 프로젝트가 일시정지되는 동작이다. 프로젝트를 하나만 쓰므로 회사 중 한
곳이라도 쓰고 있으면 정지되지 않는다. 용량은 회사가 늘어도 회사당 1MB 미만이라 여유가
크지만, 제품 레퍼런스를 여러 세대로 쌓아 두면 늘 수 있다(앱은 완료된 최신 세대만
남기고 이전 세대를 지운다).

**격리를 코드가 보장하므로 코드를 고칠 때마다 확인한다.** 회사 데이터 모듈에 쿼리를
추가할 때는 반드시 `withTenant` 안에서 쓰고, 검증 스크립트를 돌린다.
