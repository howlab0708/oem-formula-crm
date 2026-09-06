import { isPillForm, parseUnitWeightMg } from './unitWeight'
import type { Product } from './types'

const N = String.raw`([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)`
const M = String.raw`(mg|g)(?![a-z])`
const C = String.raw`(?<![0-9.,])([0-9]+(?:,[0-9]{3})*)(?![0-9.,])`
const count = (value: string) => Number(value.replace(/,/g, ''))
const I = String.raw`(캡슐|정제|정|알|환|포|병|팩|스틱|개)`
const mg = (n: string, u: string) => Number(n.replace(/,/g, '')) * (u.toLowerCase() === 'g' ? 1000 : 1)

/** Minimum physical unit only. Days and daily frequency are never divisors. */
export function standardUnitWeightMg(product: Product): number | null {
  const pill = isPillForm(product.form)
  // A bottle containing tablets/capsules and a liquid is a set, not one pill.
  if (pill && /액상/.test(product.intakeMethod ?? '')) return null
  const usableItem = (item: string) => !pill || /^(캡슐|정제|정|알|환)$/.test(item)
  const values: number[] = []
  if (isPillForm(product.form)) {
    const unit = parseUnitWeightMg({ form: product.form, intakeMethod: product.intakeMethod ?? '' })
      ?? product.unitWeightMg
    if (typeof unit === 'number' && Number.isFinite(unit) && unit > 0) values.push(unit)
  }
  for (const raw of [product.intakeMethod ?? '', product.weightLabel]) {
    const text = raw.normalize('NFKC').replace(/캅셀|캅슐/g, '캡슐')
    if (/(?:~|∼|–|또는|혹은|내지|\d\s*-\s*\d|\d\.[0-9]{3}\s*mg)/i.test(text)) continue
    const found: number[] = []
    for (const m of text.matchAll(new RegExp(`${N}\\s*${M}\\s*/\\s*${C}\\s*${I}`, 'gi'))) {
      if (usableItem(m[4])) found.push(mg(m[1], m[2]) / count(m[3]))
    }
    for (const m of text.matchAll(new RegExp(`${C}\\s*${I}\\s*(?:당\\s*|[([]\\s*)${N}\\s*${M}\\s*[)\\]]?`, 'gi'))) {
      const tail = text.slice((m.index ?? 0) + m[0].length)
      if (/^\s*[/x×*+]|^\s*[,，]\s*\d/.test(tail)) continue
      if (usableItem(m[2])) found.push(mg(m[3], m[4]) / count(m[1]))
    }
    for (const m of text.matchAll(new RegExp(`${N}\\s*${M}\\s*[x×*]\\s*${C}\\s*${I}`, 'gi'))) {
      if (usableItem(m[4]) && count(m[3]) > 0) found.push(mg(m[1], m[2]))
    }
    // Mass followed by an explicit physical count: 60g(120정), 3g(1포).
    for (const m of text.matchAll(new RegExp(`${N}\\s*${M}\\s*[(]\\s*${C}\\s*${I}\\s*[)]`, 'gi'))) {
      if (usableItem(m[4])) found.push(mg(m[1], m[2]) / count(m[3]))
    }
    // Explicit package total and physical count, e.g. 총 내용량 60g (120정).
    for (const m of text.matchAll(new RegExp(`총\\s*(?:내용량|중량)\\s*[:：]?\\s*${N}\\s*${M}\\s*[,(/]\\s*(?:총\\s*)?${C}\\s*${I}`, 'gi'))) {
      if (usableItem(m[4])) found.push(mg(m[1], m[2]) / count(m[3]))
    }
    values.push(...found)
  }
  return values.length && values.every(v => Number.isFinite(v) && v > 0 && Math.abs(v - values[0]) < .001) ? values[0] : null
}
