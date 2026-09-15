import { emptySheet, newLineRow, newMaterialRow, newOverheadRow } from './formulaDesign/preset'
import { calculate } from './formulaDesign/calc'
import type { Product } from './types'

const clean = (value: string) => value.replace(/\s/g, '').toLowerCase()
const number = (value = '') => {
  const normalized = value.replace(/[,\s₩원%]/g, '')
  return !/[\r\n]/.test(value) && /^\d+(?:\.\d+)?$/.test(normalized) && Number(normalized) <= 1e12 ? normalized : ''
}
export const isQuoteCsv = (rows: string[][]) => rows.some(row => /원료비/.test(clean(row.join(''))) && /배합비율/.test(row.join('')))

/** Reads block-based factory quotations exported from Excel. Never interprets formulas or totals as unit prices. */
export function quoteFromCsv(rows: string[][], fileName: string) {
  const sheet = emptySheet()
  const warnings: string[] = []
  sheet.materials = []; sheet.packagingItems = []; sheet.processItems = []; sheet.analysisItems = []
  sheet.quote.overheads = []; sheet.quote.conditions = ''
  sheet.spec.shelfLife = ''; sheet.spec.validity = ''; sheet.spec.quotedOn = ''; sheet.spec.lossPercent = ''
  sheet.spec.foodType = ''
  const firstBlock = rows.findIndex(row => /원료비/.test(clean(row.join(''))) && /배합비율/.test(row.join('')))
  const topRows = rows.slice(0, firstBlock)
  sheet.spec.productName = topRows.flat().find(cell => cell.trim() && !/포\s*장\s*단\s*위|수량|견적서|견적일|^\d/.test(cell.trim()))?.trim() || fileName.replace(/\.csv$/i, '')
  const text = rows.map(row => row.join(' ')).join('\n')
  const pack = text.match(/([\d,.]+)\s*(mg|g)\s*[x×*]\s*([\d,]+)\s*(정|캡슐|포|개)/i)
  if (pack) {
    sheet.spec.unitWeightMg = String(Number(pack[1].replace(/,/g, '')) * (pack[2].toLowerCase() === 'g' ? 1000 : 1))
    sheet.spec.unitsPerSet = pack[3].replace(/,/g, '')
    sheet.spec.form = pack[4] === '포' ? '분말' : pack[4] === '캡슐' ? '캡슐' : pack[4] === '정' ? '정제' : '기타'
  } else { sheet.spec.form = '기타'; warnings.push('포장 규격을 찾지 못했습니다. 1개 중량과 1세트 개수를 입력해 주세요.') }
  sheet.spec.setCount = text.match(/수\s*량\s*[:：]?\s*([\d,]+)\s*(?:set|세트)/i)?.[1].replace(/,/g, '') || ''
  sheet.spec.quotedOn = text.match(/20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}/)?.[0] || ''
  sheet.spec.lossPercent = text.match(/loss\s*([\d.]+)\s*%\s*(?:up|추가)/i)?.[1] || ''
  sheet.spec.intakeGuide = rows.flat().find(cell => /1일\s*\d+회/.test(cell))?.trim() || ''
  if (!sheet.spec.setCount) warnings.push('제작 수량을 찾지 못했습니다.')
  if (!sheet.spec.lossPercent) warnings.push('Loss 추가 비율을 확인해 주세요. 수율 방식은 배합 설계에서 별도로 설정합니다.')

  let section: 'material' | 'packaging' | 'process' | 'analysis' | null = null
  let cols: Record<string, number> = {}
  const originalTotals: string[] = []
  rows.forEach((row, rowIndex) => {
    const compact = clean(row.join(' '))
    const labelIndex = row.findIndex(cell => cell.trim())
    const label = row[labelIndex]?.trim() || ''
    if (!label) return
    const heading = /^(?:1[.)]?원료비)/.test(compact) ? 'material'
      : /^(?:2[.)]?부자재비)/.test(compact) ? 'packaging'
        : /^(?:3[.)]?가공비)/.test(compact) ? 'process'
          : /^(?:4[.)]?분석비)/.test(compact) ? 'analysis' : null
    if (heading) {
      section = heading; cols = { label: labelIndex }
      row.forEach((cell, index) => {
        const c = clean(cell)
        if (/배합비율/.test(c)) cols.ratio = index
        else if (/사용량/.test(c)) cols.usage = index
        else if (/원료단가|^단가/.test(c)) cols.price = index
        else if (/가공금액|^금액/.test(c)) cols.amount = index
        else if (/수량/.test(c)) cols.quantity = index
        else if (/기준단위/.test(c)) cols.unit = index
        else if (/비고/.test(c)) cols.note = index
      })
      if (cols.price === undefined || (heading === 'material' && cols.ratio === undefined)) {
        warnings.push(`${rowIndex + 1}행: ${label}의 배합비율·단가 열을 확인하지 못했습니다.`)
        section = null
      }
      return
    }
    if (/소계|공급가|제안가/.test(compact)) {
      originalTotals.push(row.filter(Boolean).join(' · '))
      section = null
      return
    }
    if (/일반관리비|기업이윤/.test(label)) {
      const value = row.slice(labelIndex + 1).map(number).find(Boolean)
      if (value) sheet.quote.overheads.push(newOverheadRow({ label, mode: 'amount', value, note: '원본 금액 · 산식은 확인 필요' }))
      return
    }
    if (/^[*＊]/.test(label)) { sheet.quote.conditions += `${row.filter(Boolean).join(' ')}\n`; section = null; return }
    if (/포장단위당|구성및포장|기능성원료|항목금액|부가세별도/.test(compact)) { section = null; return }
    if (!section || /loss|^부가세|기준단위/.test(compact)) return
    const value = (key: string) => cols[key] === undefined ? '' : (row[cols[key]] ?? '').trim()
    const price = number(value('price'))
    const note = value('note')
    if (/[\r\n]/.test(value('price')) || /[\r\n]/.test(value('quantity')) || /[\r\n]/.test(value('ratio'))) throw new Error(`${rowIndex + 1}행: 한 셀에 여러 숫자가 들어 있습니다. 원료·비용별로 한 행씩 정리해 주세요.`)
    if (/^=|^#(?:REF|VALUE|DIV|N\/A|NAME)/i.test(value('price'))) throw new Error(`${rowIndex + 1}행: 계산식이 아닌 계산된 단가가 필요합니다. 엑셀에서 계산 후 CSV로 저장해 주세요.`)
    if (section === 'material') {
      const ratio = number(value('ratio'))
      if (!ratio) { warnings.push(`${rowIndex + 1}행 ${label}: 배합비율을 읽지 못해 제외했습니다.`); return }
      const usage = number(value('usage'))
      sheet.materials.push(newMaterialRow({ name: label, ratio, usage, unitPrice: price, note }))
      if (!price && !/발주처|사급|제공/.test(note)) warnings.push(`${label}: 단가가 비어 있습니다.`)
    } else {
      const quantity = number(value('quantity'))
      // Merged process labels can span blank rows; retain their wording in the memo.
      if (!price && !quantity) return
      const line = newLineRow({ label, unit: value('unit') || '개', basis: 'fixed', quantity, unitPrice: price, note,
        included: !/별도\s*청구|발주처\s*제공|사급/.test(note) })
      if (section === 'packaging') sheet.packagingItems.push(line)
      if (section === 'process') sheet.processItems.push(line)
      if (section === 'analysis') sheet.analysisItems.push(line)
    }
  })
  if (!sheet.materials.length) throw new Error('원료 배합표를 읽지 못했습니다. 원료비 표의 열 제목과 배합비율을 확인해 주세요.')
  sheet.materials.forEach((row, i) => { row.id = `m${i + 1}` })
  for (const [key, prefix] of [['packagingItems', 'p'], ['processItems', 'c'], ['analysisItems', 'a']] as const) sheet[key].forEach((row, i) => { row.id = `${prefix}${i + 1}` })
  sheet.quote.overheads.forEach((row, i) => { row.id = `o${i + 1}` })
  const ratioTotal = sheet.materials.reduce((sum, row) => sum + Number(row.ratio), 0)
  if (Math.abs(ratioTotal - 100) > 0.01) warnings.push(`배합비율 합계가 ${ratioTotal.toFixed(4)}%입니다. 원본과 비교해 주세요.`)
  warnings.push('사용량과 부자재·가공·분석 수량은 원본의 고정값입니다. 제작 수량 변경 시 함께 검토해 주세요.', '기능성 표시량·별도 청구·합계·반올림 방식은 원본과 비교 후 확정해 주세요.')
  sheet.memo = ['회사 견적서 CSV에서 가져옴', '원본 합계 (대조용)', ...originalTotals, ...warnings].join('\n').slice(0, 5000)
  const totals = calculate(sheet)
  const product: Product = { id: 'csv-0', name: sheet.spec.productName, manufacturer: '미상',
    form: sheet.spec.form as Product['form'], formRaw: sheet.spec.form, weightLabel: pack?.[0] || '-',
    weightMg: null, unitWeightMg: Number(sheet.spec.unitWeightMg) || null,
    intakeMethod: sheet.spec.intakeGuide, referenceDetails: { declaredWeight: pack?.[0] || '', unitsPerSet: sheet.spec.unitsPerSet },
    mainIngredients: [], subIngredients: sheet.materials.map(row => row.name), mainDetail: '', markers: [], companyFormula: sheet }
  return { product, warnings, originalTotals, totals }
}
