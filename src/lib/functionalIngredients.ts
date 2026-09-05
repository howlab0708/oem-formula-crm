import catalog from '../data/functionalIngredients.json'
import sourceRows from '../data/functionalIngredients.source.json'
import audit from '../data/functionalIngredients.audit.json'

export type IngredientCategory = 'notified' | 'recognized' | 'unresolved'
export type IngredientIntake = { purpose: string; amount: string; basis: string }
export type IngredientStandard = {
  name: string
  recognition: string
  holder: string
  functionality: string
  intakes: IngredientIntake[]
  sourceUrl: string
  sourcePageUrl?: string
  sourceLabel: string
  caution: string
  recordedIntake?: string
}
export type FunctionalIngredient = {
  id: string
  sourceIds: string[]
  name: string
  category: IngredientCategory
  standards: IngredientStandard[]
  note: string
  upcoming: { effectiveOn: string; text: string }[]
  reviewedOn: string
  codexSection?: string
  evidenceStatus?: 'official' | 'registry'
  historicalRecognition?: boolean
  productEvidence: { count: number; examples: string[] }
}

export type IngredientSourceRow = {
  id: string; sourceFile: string; row: number; category: string; name: string
  recognition: string; holder: string; functionality: string; dailyIntake: string
  raw: Record<string, string>
}

export const INGREDIENT_REVIEW_DATE = '2026-09-05'
export const INGREDIENT_PAGE_SIZE = 25
export const INGREDIENT_SOURCES = {
  codex: 'https://www.mfds.go.kr/brd/m_211/view.do?seq=14973',
  search: 'https://www.foodsafetykorea.go.kr/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660',
  amendment: 'https://impfood.mfds.go.kr/CFBDD02F02?active=00049&cntntsMngId1=00049&cntntsMngId2=00049&cntntsSn=659791',
}
export const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  notified: '고시형',
  recognized: '개별인정형',
  unresolved: '확인 필요',
}
export const functionalIngredients = catalog as FunctionalIngredient[]
export const ingredientSourceRows = sourceRows as IngredientSourceRow[]
export const ingredientAudit = audit

const originals = new Map(ingredientSourceRows.map((row) => [row.id, row]))
export function ingredientOriginals(ingredient: FunctionalIngredient) {
  return ingredient.sourceIds.flatMap((id) => {
    const row = originals.get(id)
    return row ? [row] : []
  })
}

// 원료 조회에만 적용한다. 제품 검색·성분 통합 규칙과 분리한다.
function searchKey(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s·･ㆍ+()®™Ⓡ_‐‑–—-]/g, '')
}
const searchIndex = new Map(functionalIngredients.map((ingredient) => [ingredient.id, searchKey([
  ingredient.name,
  ingredientCategoryLabels[ingredient.category],
  ...ingredientOriginals(ingredient).flatMap((row) => ingredient.category === 'unresolved'
    ? [row.name, row.recognition, row.holder, row.functionality] : [row.name, row.recognition, row.holder]),
  ...ingredient.standards.flatMap((standard) => [standard.name, standard.recognition, standard.holder,
    standard.functionality, ...standard.intakes.flatMap((intake) => [intake.purpose, intake.basis])]),
].join(' '))]))

export function findFunctionalIngredients(query: string, category: IngredientCategory | 'all') {
  const compact = searchKey(query)
  const words = query.trim().split(/\s+/).map(searchKey).filter(Boolean)
  return functionalIngredients.filter((ingredient) => {
    if (category !== 'all' && ingredient.category !== category) return false
    const text = searchIndex.get(ingredient.id) ?? ''
    return !compact || text.includes(compact) || words.every((word) => text.includes(word))
  })
}

// 인정번호·업체·기능성을 검색하면 그 기준을 먼저 보여준다.
export function ingredientStandardsForQuery(ingredient: FunctionalIngredient, query: string) {
  const compact = searchKey(query)
  if (!compact) return ingredient.standards
  const words = query.trim().split(/\s+/).map(searchKey).filter(Boolean)
  const matches = ingredient.standards.filter((standard) => {
    const text = searchKey([ingredient.name, standard.name, standard.recognition, standard.holder,
      standard.functionality, ...standard.intakes.flatMap((intake) => [intake.purpose, intake.basis])].join(' '))
    return text.includes(compact) || words.every((word) => text.includes(word))
  })
  return matches.length ? matches : ingredient.standards
}
