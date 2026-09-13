import { provenanceToText } from '../ingredientProvenance'
import { allowanceLabel, blank, unitNoun, type MaterialCalc, type Totals } from './calc'

import type { PackagingSpec } from './types'

/** Keep automatic usage blank when copying the full sheet for a later paste. */
function materialCells(item: MaterialCalc): string[] {
  return [item.row.name,
    blank(item.row.unitAmountMg) && blank(item.row.ratio) ? '' : item.mgPerUnit,
    blank(item.row.unitAmountMg) && blank(item.row.ratio) ? '' : item.ratio,
    item.batchKg, item.row.usage, item.row.unitPrice, item.amount, item.row.packKg, item.row.note,
  ].map(value => String(value).replace(/[\t\r\n]+/g, ' '))
}

/** 화면과 같은 열 순서의 TSV. 계산값은 전체 정밀도를 유지하고 출처는 아래에 함께 담는다. */
export function materialSheetToText(spec: PackagingSpec, totals: Totals): string {
  const noun = unitNoun(spec.form)
  const rows = totals.materials.map(item => materialCells(item).join('\t'))
  return [
    `${spec.productName || '배합표'} · 1${noun} ${spec.unitWeightMg || '-'}mg · ${totals.totalUnits.toLocaleString('ko-KR')}${noun} 제작 · ${allowanceLabel(spec)}`,
    ['원료명', `1${noun}당 배합량(mg)`, '배합비율(%)', '총 필요량(kg, 손실 반영)', '사용량(kg) 직접 입력', '원료단가(원/kg)', '금액(원)', '팩 단위(kg)', '비고'].join('\t'),
    ...rows,
    '',
    '사용량 직접 입력 칸이 비어 있으면 총 필요량을 사용합니다. 팩 단위 청구 여부는 별도 설정합니다.',
    provenanceToText(totals.materials.map((item) => ({ ...item.row, ratio: blank(item.row.ratio) && blank(item.row.unitAmountMg) ? '' : String(item.ratio) })), spec.productName),
  ].join('\n')
}
