import type { Product } from '../types'
import { referenceSpecifications } from '../referenceSpecifications'
import { declaredNutrientIngredients } from '../ingredientSource'
import { currentProvenance, provenanceForIngredient, provenanceKey } from '../ingredientProvenance'
import { emptySheet, newMaterialRow } from './preset'
import type { FormulaSheet, MaterialRow } from './types'

/** Refresh the same reference without erasing quote inputs or restoring claims on renamed rows. */
export function refreshProductProvenance(sheet: FormulaSheet, product: Product): FormulaSheet {
  if (product.traceability?.status !== 'matched') return sheet
  const names = new Set([...product.mainIngredients, ...product.subIngredients].map(provenanceKey))
  let changed = false
  const materials = sheet.materials.map(row => {
    const previous = currentProvenance(row.name, row.provenance)
    if (!previous || previous.reportNo !== (product.reportNo || '') || provenanceKey(previous.productName) !== provenanceKey(product.name) || !names.has(provenanceKey(row.name))) return row
    const provenance = provenanceForIngredient(product, row.name)
    if (JSON.stringify(previous) === JSON.stringify(provenance)) return row
    changed = true
    return { ...row, provenance }
  })
  return changed ? { ...sheet, materials } : sheet
}

/** Transfer reference facts only. Ingredient purity and marker content are not formulation ratios. */
export function draftFromProduct(product: Product): { title: string; sheet: FormulaSheet } {
  const sheet = emptySheet()
  const specs = referenceSpecifications(product)
  const declared = declaredNutrientIngredients(product)
  const materials = new Map<string, MaterialRow>()
  const add = (name: string, functional: boolean) => {
    const trimmed = name.trim()
    const key = trimmed.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
    if (!key || materials.has(key)) return
    materials.set(key, newMaterialRow({ name: trimmed, functional, provenance: provenanceForIngredient(product, trimmed) }))
  }
  product.mainIngredients.forEach((name) => add(name, true))
  product.subIngredients.forEach((name) => add(name, declared.has(name)))
  sheet.materials = materials.size ? [...materials.values()] : [newMaterialRow()]
  sheet.spec.productName = product.name
  sheet.spec.form = product.form
  sheet.spec.unitWeightMg = specs.unitWeightMg === null ? '' : String(specs.unitWeightMg)
  sheet.spec.unitsPerSet = specs.unitsPerSet
  sheet.spec.packaging = specs.packaging
  sheet.spec.intakeGuide = product.intakeMethod ?? ''
  sheet.spec.shelfLife = specs.shelfLife
  sheet.processItems[0].label = '혼합 · 제조 · 포장 · 품질검사'
  sheet.processItems[0].unit = product.form === '정제' ? '정' : product.form.includes('캡슐') ? '캡슐' : '개'
  sheet.memo = [
    `참고 제품: ${product.name}`,
    `제조원: ${product.manufacturer}`,
    product.reportNo ? `품목 신고번호: ${product.reportNo}` : '',
    `원본 규격: ${product.weightLabel}`,
    ...specs.evidence,
    specs.missing.length ? `원본에서 확인되지 않아 직접 입력할 규격: ${specs.missing.join(' · ')}` : '',
    product.primaryFunction ? `원본 기능성: ${product.primaryFunction}` : '',
    product.mainDetail ? `지표성분 원문 (투입 비율 아님): ${product.mainDetail}` : '',
    '확인된 원료·중량·포장 규격·섭취방법·소비기한을 가져왔습니다. 참고 제품의 규격이므로 새 제품의 조건을 확인해 주세요. 배합비율·단가·발주 수량은 직접 입력합니다.',
  ].filter(Boolean).join('\n').slice(0, 5000)
  return { title: `${product.name} · 견적`.slice(0, 150), sheet }
}
