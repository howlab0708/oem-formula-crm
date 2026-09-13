'use client'

/**
 * 1. 원료비 표.
 *
 * 낱개당 mg 또는 %로 배합을 설계하고 제작 수량에 따라 총 kg와 원가를 계산한다.
 * 총 필요량·금액은 계산 결과다. 붙여넣기와 복사도 화면의 열 순서를 따른다.
 *
 * 원료명 칸은 기능성 원료 DB 자동완성이다. 고르면 일일섭취기준·기능성내용·기준
 * 성분이 함께 붙고, 지난 견적에서 쓴 단가가 있으면 단가까지 채운다.
 */

import { useId, useRef, useState } from 'react'
import { IngredientCopyButton, ReferenceIngredientInfo } from '@/components/IngredientProvenance'
import { Modal } from '@/components/Modal'
import { allowanceLabel, blank, formatMaterialQuantity, formatRatio, formatWon, num, unitNoun, validYield } from '@/lib/formulaDesign/calc'
import { materialSheetToText } from '@/lib/formulaDesign/materialExport'
import type { MaterialCalc, Totals } from '@/lib/formulaDesign/calc'
import { MATERIAL_PASTE_KEYS, parseClipboardMatrix, type SheetAction } from '@/lib/formulaDesign/reducer'
import { exactSuggestion, suggestIngredients, type Suggestion, type SuggestionIndex } from '@/lib/formulaDesign/suggest'
import type { MaterialRow, PackagingSpec } from '@/lib/formulaDesign/types'
import { focusCellSoon, handleGridKeyDown } from './gridKeys'
import { cellClass, headClass, numberCellClass, rowNumberClass } from './cellStyles'
import styles from './MaterialGrid.module.css'

/** 화면 열 순서. 붙여넣기 키 순서(`MATERIAL_PASTE_KEYS`)와 같아야 한다. */
const COLUMNS = MATERIAL_PASTE_KEYS.length

/**
 * 원료단가는 천 원대에서 수십만 원대까지 자리수가 널뛰어서, 쉼표가 없으면 0 개수를
 * 눈으로 세게 된다. 옆 칸인 금액에는 쉼표가 있어 나란히 놓으면 더 눈에 걸린다.
 */
function groupThousands(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const parsed = Number(trimmed.replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return value
  return parsed.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
}

/**
 * 원료단가 칸. 포커스가 없을 때는 쉼표를 넣어 보여 주고, 타이핑하는 동안에는 적은
 * 그대로 둔다. 커서가 있는 칸에 쉼표를 끼워 넣으면 자리가 밀려 지우기가 어렵다.
 * 저장값은 손대지 않는다 - 계산도 검증도 `num()` 이 쉼표를 지우고 읽는다.
 */
function PriceCell({
  value,
  onChange,
  cellProps,
  ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  cellProps: Record<string, unknown>
  ariaLabel: string
}) {
  const [editing, setEditing] = useState(false)
  return (
    <input
      {...cellProps}
      value={editing ? value : groupThousands(value)}
      inputMode="numeric"
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => {
        setEditing(true)
        event.currentTarget.select()
      }}
      onBlur={() => setEditing(false)}
      className={`${cellClass} text-right tnum`}
    />
  )
}

type Props = {
  materials: MaterialRow[]
  spec: PackagingSpec
  totals: Totals
  index: SuggestionIndex
  dispatch: (action: SheetAction) => void
}

export function MaterialGrid({ materials, spec, totals, index, dispatch }: Props) {
  const gridRef = useRef<HTMLTableElement>(null)
  const noun = unitNoun(spec.form)
  const weightWarningId = useId()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const hasAmounts = materials.some(row => !blank(row.unitAmountMg) || !blank(row.ratio) || !blank(row.usage))
  const removing = totals.materials.find(item => item.row.id === removingId)
  const unitWeightMg = num(spec.unitWeightMg)
  const ratioOnly = materials.every(row => blank(row.unitAmountMg))
  const negativeAmount = totals.materials.some(item => item.mgPerUnit < 0 || item.ratio < 0)
  // Use the same tolerance as the composition summary so decimal rounding does not raise a warning.
  const overweight = unitWeightMg > 0 && totals.unitAmountGapMg < -Math.max(1, unitWeightMg) * 1e-12

  const patch = (id: string, next: Partial<MaterialRow>) => dispatch({ type: 'material', id, patch: next })

  /**
   * 후보에서 기준 정보만 뽑는다. 원료명은 여기 넣지 않는다 -
   * 원료명은 발주·투입에 쓰는 이름이라 공전 이름으로 바꾸면 배합표가 틀어진다
   * (산화아연을 투입하고 원료명을 아연으로 적을 수는 없다). 공전 이름은 기준 성분으로 간다.
   */
  const standardsOf = (found: Suggestion): Partial<MaterialRow> => ({
    ingredientId: found.ingredientId,
    basis: found.basis,
    dailyIntake: found.dailyIntake,
    functionality: found.functionality,
    functional: found.source === 'ingredient',
    unitPrice: found.unitPrice ? String(found.unitPrice) : '',
    note: found.note ?? '',
  })

  /** 목록에서 고른 후보를 줄에 얹는다. 단가·비고는 비어 있을 때만 채운다. */
  const applySuggestion = (row: MaterialRow, suggestion: Suggestion) => {
    const standards = standardsOf(suggestion)
    patch(row.id, {
      ...standards,
      // 고른 후보의 이름을 쓴다. 원료 형태로 연결된 후보는 연구원이 친 이름을 그대로 담고 있다.
      name: suggestion.name,
      functional: suggestion.source === 'ingredient' ? true : row.functional,
      unitPrice: row.unitPrice || standards.unitPrice || '',
      note: row.note || standards.note || '',
    })
  }

  /** 직접 입력·붙여넣은 이름에 기준 정보만 얹는다(이름은 건드리지 않는다). */
  const standardsFor = (name: string): Partial<MaterialRow> | null => {
    const found = exactSuggestion(index, name)
    return found ? standardsOf(found) : null
  }

  /** 목록에서 고르지 않고 적어 넣은 이름을 공전 원료에 연결한다. 연결되지 않으면 그대로 둔다. */
  const attachStandards = (row: MaterialRow, name: string) => {
    const standards = standardsFor(name)
    if (!standards) return
    patch(row.id, {
      ...standards,
      // 이미 켜 둔 기능성 표시는 끄지 않는다.
      functional: standards.functional || row.functional,
      unitPrice: row.unitPrice || standards.unitPrice || '',
      note: row.note || standards.note || '',
    })
  }

  const onPaste = (event: React.ClipboardEvent, rowIndex: number, column: number) => {
    const matrix = parseClipboardMatrix(event.clipboardData.getData('text/plain'))
    if (!matrix) return
    event.preventDefault()
    dispatch({ type: 'paste-materials', row: rowIndex, column, matrix, enrich: standardsFor })
  }

  const keyOptions = (rowIndex: number, column: number, id: string) => ({
    row: rowIndex,
    column,
    rowCount: materials.length,
    columnCount: COLUMNS,
    onAddRow: () => dispatch({ type: 'add-material', after: id }),
    onMoveRow: (delta: number) => dispatch({ type: 'move', block: 'materials', id, delta }),
  })

  return (
    <section aria-labelledby="material-grid-title" className="rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h3 id="material-grid-title" className="text-[14px] font-semibold text-ink">
            1. 원료 배합 · 원료비
          </h3>
          <p className="text-[12px] text-ink-3">
            1{noun}당 mg 또는 배합비율을 입력하세요. 마지막으로 입력한 값을 기준으로 서로 계산됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IngredientCopyButton label="배합표 복사" getText={() => materialSheetToText(spec, totals)} />
          <button type="button" onClick={() => setResetOpen(true)} disabled={!hasAmounts} aria-haspopup="dialog"
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-2 hover:bg-surface-sunken disabled:opacity-40 disabled:cursor-not-allowed">
            배합량 초기화
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'add-material' })
              focusCellSoon(gridRef.current, materials.length, 0)
            }}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken"
          >
            원료 추가
          </button>
        </div>
      </header>

      <div className="grid gap-3 border-b border-line bg-surface-sunken p-3 sm:grid-cols-3">
        <CompositionBadge totals={totals} unitWeightMg={unitWeightMg} noun={noun} />
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <p className="text-[12px] text-ink-3">총 제작 수량</p>
          <p className="mt-1 text-[18px] font-semibold text-ink tnum">{totals.totalUnits.toLocaleString('ko-KR')}{noun}</p>
          <p className="text-[12px] text-ink-3">{num(spec.unitsPerSet).toLocaleString('ko-KR')}{noun}/set × {totals.setCount.toLocaleString('ko-KR')}set</p>
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <p className="text-[12px] text-ink-3">입력한 원료의 총 필요량 · {allowanceLabel(spec)}</p>
          <p className="mt-1 text-[18px] font-semibold text-ink tnum">{validYield(spec) ? `${formatMaterialQuantity(totals.batchSumKg)}kg` : '수율 입력 필요'}</p>
          <p className="text-[12px] text-ink-3">손실 반영 전 {formatMaterialQuantity(totals.materials.reduce((sum, item) => sum + item.netKg, 0))}kg · {spec.lossMode === 'yield' ? '순량 ÷ (수율 ÷ 100)' : '순량 × (1 + Loss ÷ 100)'}</p>
        </div>
      </div>

      <p className="px-3 pt-2 text-[12px] leading-5 text-ink-2">
        mg는 원료 자체의 배합량입니다. 영양성분 표시량은 아래 표시량 검토에서 확인하세요.
        {' '}제작 수량을 바꿔도 1{noun}당 배합은 유지됩니다. 사용량(kg)을 직접 적은 칸은 고정되며, 비우면 자동 계산됩니다.
      </p>
      <p className="px-3 pt-1 text-[12px] leading-5 text-ink-2">‘남은 중량 채우기’는 다른 원료의 배합량을 유지하고, 선택한 원료를 조정해 목표 중량에 맞춥니다. 버튼 아래에 변경될 양이 표시됩니다.</p>

      <p className="border-b border-line px-3 py-2 text-[12px] leading-5 text-ink-3">원료사·원산지는 참고 제품의 공개 자료입니다. 실제 사용할 원료는 별도 확인이 필요하며, 원료명을 바꾸면 기존 출처 정보가 해제됩니다.</p>
      <p className="border-b border-line px-3 py-2 text-[12px] leading-5 text-ink-2">‘주원료 표시’를 체크한 원료는 주원료로 구분하고 아래 표시량 검토표와 견적서에 반영합니다. 참고 제품의 주원료와 영양성분 함량이 명시된 원료를 기본 선택하며 직접 변경할 수 있습니다. 체크 여부와 관계없이 모든 원료가 배합량·원가 계산에 포함됩니다.</p>

      <div className="overflow-x-auto">
        <table data-grid ref={gridRef}
          className={`${styles.grid} w-full min-w-[80rem] border-collapse text-[13px]`}>
          <caption className="sr-only">
            원료명, 낱개당 배합량(mg), 배합비율, 총 필요량(kg), 사용량, 원료단가, 금액, 팩 단위, 비고 순서의 배합비 입력 표
          </caption>
          <thead>
            {/* 낱개 설계와 생산 총량을 한 묶음에서 비교한다. */}
            <tr className="text-[11px] text-ink-3">
              <th scope="col" colSpan={2} className="px-2 pb-1" />
              <th scope="colgroup" colSpan={4} className="border-b border-line px-2 pb-1 text-center font-medium">
                배합 · 투입량
              </th>
              <th scope="colgroup" colSpan={2} className="border-b border-line px-2 pb-1 text-center font-medium">
                단가 · 금액
              </th>
              <th scope="colgroup" colSpan={3} className="border-b border-line px-2 pb-1 text-center font-medium">
                참고
              </th>
              <th scope="col" className="px-2 pb-1" />
            </tr>
            <tr>
              <th scope="col" className={`${headClass} w-9`} aria-label="줄 번호" />
              <th scope="col" className={`${headClass} min-w-[13rem] text-left`}>원료명</th>
              <th scope="col" className={`${headClass} min-w-48 w-48 bg-accent-soft text-accent-strong`}>1{noun}당 배합량<br />(mg)</th>
              <th scope="col" className={`${headClass} w-24`}>배합비율(%)</th>
              <th scope="col" className={`${headClass} w-28`}>총 필요량(kg)<br /><span className="font-normal text-ink-3">손실 반영 · 자동</span></th>
              <th scope="col" className={`${headClass} w-28`}>사용량(kg)<br /><span className="font-normal text-ink-3">필요 시 직접 입력</span></th>
              <th scope="col" className={`${headClass} w-28`}>원료단가<br />(원/kg)</th>
              <th scope="col" className={`${headClass} w-28`}>금액(원)</th>
              <th
                scope="col"
                className={`${headClass} w-24`}
                title="원료 팩킹 단위(kg). 적어 두면 옆에 체크칸이 생기고, 켜면 사용량을 팩 배수로 올려 청구액을 봅니다."
              >
                팩 단위(kg)
              </th>
              <th scope="col" className={`${headClass} min-w-[9rem] text-left`}>비고</th>
              <th scope="col" className={`${headClass} w-24`}>주원료 표시</th>
              <th scope="col" className={`${headClass} w-16`} aria-label="줄 삭제" />
            </tr>
          </thead>
          <tbody>
            {totals.materials.map((calc, rowIndex) => (
              <MaterialRowView
                key={calc.row.id}
                calc={calc}
                rowIndex={rowIndex}
                noun={noun}
                unitWeightMg={unitWeightMg}
                weightWarningId={overweight ? weightWarningId : undefined}
                otherAmountMg={totals.unitAmountSumMg - calc.mgPerUnit}
                otherRatio={totals.ratioSum - calc.ratio}
                ratioOnly={ratioOnly}
                negativeAmount={negativeAmount}
                index={index}
                gridRef={gridRef}
                keyOptions={keyOptions}
                onPaste={onPaste}
                onPatch={patch}
                onApply={applySuggestion}
                onAttachStandards={attachStandards}
                onRemove={() => setRemovingId(calc.row.id)}
                onFillRemainder={() => dispatch({ type: 'fill-remainder', id: calc.row.id })}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-sunken font-medium">
              <td className="px-2 py-2" />
              <th scope="row" className="px-2 py-2 text-left">소계</th>
              <td className={`${numberCellClass} ${overweight ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-strong'}`}>{formatMaterialQuantity(totals.unitAmountSumMg)}</td>
              <td className={numberCellClass}>{formatRatio(totals.ratioSum)}</td>
              <td className={numberCellClass}>{formatMaterialQuantity(totals.batchSumKg)}</td>
              <td className={numberCellClass}>
                {formatMaterialQuantity(totals.usageSumKg)}
              </td>
              <td className={numberCellClass} />
              <td className={numberCellClass}>{formatWon(totals.materialCost)}</td>
              <td className={numberCellClass} />
              <td className="px-2 py-2 text-[12px] text-ink-3" colSpan={3}>
                {allowanceLabel(spec)} · 부가세 별도
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {removing ? <Modal title="원료 삭제 확인" onClose={() => setRemovingId(null)} footer={<div className="flex justify-end gap-3">
        <button type="button" onClick={() => setRemovingId(null)} className="rounded-md border border-line-strong px-4 py-2 text-[14px] text-ink-2 hover:bg-surface-sunken">취소</button>
        <button type="button" onClick={() => { dispatch({ type: 'remove', block: 'materials', id: removing.row.id }); setRemovingId(null) }}
          className="rounded-md border border-danger bg-danger px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90">원료 삭제</button>
      </div>}>
        <p className="text-[14px] leading-6 text-ink">이 원료를 배합표에서 삭제하시겠습니까?</p>
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-4">
          <p className="font-semibold text-ink keep-all">{removing.row.name || `${totals.materials.indexOf(removing) + 1}번째 원료 (이름 미입력)`}</p>
          <p className="mt-1 text-[13px] text-ink-2">1{noun}당 {formatMaterialQuantity(removing.mgPerUnit)}mg · 배합비율 {formatRatio(removing.ratio)}%</p>
        </div>
        <p className="mt-3 text-[13px] leading-5 text-ink-2">이 행의 입력 내용이 삭제되고 배합 합계와 원가가 다시 계산됩니다.</p>
      </Modal> : null}
      {/* Keep the warning outside horizontal scrolling and visible while editing long ingredient lists. */}
      {resetOpen ? <Modal title="배합량 초기화" onClose={() => setResetOpen(false)} footer={<div className="flex justify-end gap-3">
        <button type="button" onClick={() => setResetOpen(false)} className="rounded-md border border-line-strong px-4 py-2 text-[14px] text-ink-2 hover:bg-surface-sunken">취소</button>
        <button type="button" onClick={() => { dispatch({ type: 'reset-material-amounts' }); setResetOpen(false); focusCellSoon(gridRef.current, 0, 1) }}
          className="rounded-md border border-danger bg-danger px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90">배합량 초기화하기</button>
      </div>}>
        <p className="text-[14px] leading-6 text-ink">현재 시트의 원료 {materials.length}개 배합량을 비우고 다시 설계할까요?</p>
        <dl className="mt-4 space-y-3 rounded-lg border border-line bg-surface-sunken p-4 text-[13px] leading-6">
          <div><dt className="font-semibold text-danger">초기화할 항목</dt><dd>1{noun}당 배합량(mg) · 배합비율(%) · 직접 입력한 사용량(kg)</dd></div>
          <div><dt className="font-semibold text-ink">유지할 항목</dt><dd>원료 목록·출처·단가, 제품 규격·제작 수량, 표시량 검토 정보와 나머지 견적 설정</dd></div>
        </dl>
        <p className="mt-3 text-[13px] leading-5 text-ink-2">총 필요량과 원료 금액은 초기화된 배합량으로 다시 계산됩니다. 현재 시트에만 적용됩니다.</p>
      </Modal> : null}
      <div id={weightWarningId} role="alert" aria-atomic="true" className="sticky bottom-3 z-10 mx-3">
        {overweight ? (
          <div className="my-3 flex items-start gap-3 rounded-lg border-2 border-danger bg-danger-soft px-4 py-3 text-danger shadow-lg">
            <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current font-bold">!</span>
            <div>
              <p className="text-[15px] font-semibold">목표 중량을 초과했습니다</p>
              <p className="mt-1 text-[14px] leading-6 tnum">
                1{noun} 목표 {formatMaterialQuantity(unitWeightMg)}mg · 현재 합계 {formatMaterialQuantity(totals.unitAmountSumMg)}mg · <strong>{formatMaterialQuantity(-totals.unitAmountGapMg)}mg 초과</strong>
              </p>
              <p className="text-[12px] leading-5">원료별 배합량을 줄이거나 포장 단위의 목표 중량을 조정해 주세요.</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function CompositionBadge({ totals, unitWeightMg, noun }: { totals: Totals; unitWeightMg: number; noun: string }) {
  const gap = totals.unitAmountGapMg
  const valid = unitWeightMg > 0
  const settled = valid && Math.abs(gap) <= Math.max(1, unitWeightMg) * 1e-12 &&
    totals.materials.every((item) => item.mgPerUnit >= 0)
  return (
    <div
      role="status"
      className={`rounded-md border border-line px-3 py-2 tnum ${
        settled ? 'bg-accent-soft text-accent-strong' : 'bg-danger-soft text-danger'
      }`}
    >
      <p className="text-[12px]">1{noun}당 배합 합계 / 목표 중량</p>
      <p className="mt-1 text-[18px] font-semibold">{formatMaterialQuantity(totals.unitAmountSumMg)} / {valid ? formatMaterialQuantity(unitWeightMg) : '-'}mg</p>
      <p className="text-[12px]">{!valid ? '포장 단위에서 낱개 중량을 입력하세요' : settled ? '중량 일치 · 배합비율 100%' : `중량 ${formatMaterialQuantity(Math.abs(gap))}mg ${gap < 0 ? '초과' : '부족'} · 배합비율 ${formatMaterialQuantity(totals.ratioSum)}%`}</p>
      {totals.materials.some((item) => item.mgPerUnit < 0) ? <p className="text-[12px]">음수 배합량을 확인하세요</p> : null}
    </div>
  )
}

type RowProps = {
  calc: MaterialCalc
  rowIndex: number
  noun: string
  unitWeightMg: number
  weightWarningId?: string
  otherAmountMg: number
  otherRatio: number
  ratioOnly: boolean
  negativeAmount: boolean
  index: SuggestionIndex
  gridRef: React.RefObject<HTMLTableElement | null>
  keyOptions: (rowIndex: number, column: number, id: string) => Parameters<typeof handleGridKeyDown>[1]
  onPaste: (event: React.ClipboardEvent, rowIndex: number, column: number) => void
  onPatch: (id: string, patch: Partial<MaterialRow>) => void
  onApply: (row: MaterialRow, suggestion: Suggestion) => void
  onAttachStandards: (row: MaterialRow, name: string) => void
  onRemove: () => void
  onFillRemainder: () => void
}

function MaterialRowView({
  calc,
  rowIndex,
  noun,
  unitWeightMg,
  weightWarningId,
  otherAmountMg,
  otherRatio,
  ratioOnly,
  negativeAmount,
  index,
  keyOptions,
  onPaste,
  onPatch,
  onApply,
  onAttachStandards,
  onRemove,
  onFillRemainder,
}: RowProps) {
  const { row } = calc
  const hasWeight = unitWeightMg > 0
  const remainder = hasWeight ? unitWeightMg - otherAmountMg : 100 - otherRatio
  const currentAmount = hasWeight ? calc.mgPerUnit : calc.ratio
  const remainderUnit = hasWeight ? 'mg' : '%'
  const tolerance = Math.max(1, hasWeight ? unitWeightMg : 100) * 1e-12
  const remainderReason = !hasWeight && !ratioOnly ? '목표 중량을 먼저 입력하세요' : negativeAmount ? '음수 배합량을 먼저 확인하세요'
    : remainder < -tolerance ? '다른 원료의 합계가 목표를 초과합니다'
    : Math.abs(remainder - currentAmount) <= tolerance ? '목표에 맞게 채워져 있습니다' : ''
  const nextAmount = Math.max(0, remainder)
  const remainderLabel = hasWeight || !ratioOnly ? '남은 중량 채우기' : '남은 비율 채우기'
  const cell = (column: number) => ({
    'data-cell': `${rowIndex}:${column}`,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => handleGridKeyDown(event, keyOptions(rowIndex, column, row.id)),
    onPaste: (event: React.ClipboardEvent) => onPaste(event, rowIndex, column),
  })

  return (
    <tr className="border-t border-line">
      <td className={rowNumberClass}>{rowIndex + 1}</td>
      <td className="p-0">
        <IngredientNameCell
          row={row}
          index={index}
          cellProps={cell(0)}
          onChange={(name) => onPatch(row.id, { name })}
          onApply={(suggestion) => onApply(row, suggestion)}
          onAttach={(name) => onAttachStandards(row, name)}
        />
        <ReferenceIngredientInfo name={row.name} source={row.provenance} />
      </td>
      <td className={styles.unitAmountCell}>
        <div className={styles.unitAmountField}>
          <input
            {...cell(1)}
            value={!blank(row.unitAmountMg) ? row.unitAmountMg : blank(row.ratio) ? '' : formatMaterialQuantity(calc.mgPerUnit)}
            inputMode="decimal"
            placeholder="중량 입력"
            aria-label={`${rowIndex + 1}번째 원료 1${noun}당 배합량(mg)`}
            aria-describedby={weightWarningId}
            title={`1${noun}에 들어가는 원료 자체의 중량. 직접 입력하면 배합비율과 총 kg가 계산됩니다.`}
            onChange={(event) => onPatch(row.id, { unitAmountMg: event.target.value })}
            className={`${styles.unitAmountInput} tnum`}
          />
          <span aria-hidden="true" className={styles.unitAmountUnit}>mg</span>
        </div>
        <div className="mt-2 text-center">
          <button type="button" onClick={onFillRemainder} disabled={Boolean(remainderReason)}
            aria-label={`${rowIndex + 1}번째 원료 ${remainderLabel}${remainderReason ? '' : `, ${formatMaterialQuantity(nextAmount)}${remainderUnit}으로 변경`}`}
            title={remainderReason || `다른 원료의 배합량은 유지하고 이 원료를 ${formatMaterialQuantity(currentAmount)}${remainderUnit}에서 ${formatMaterialQuantity(nextAmount)}${remainderUnit}으로 조정합니다.`}
            className="w-full whitespace-nowrap rounded-md border border-accent-line bg-surface px-1.5 py-1.5 text-[12px] font-medium text-accent-strong hover:bg-accent-soft disabled:cursor-not-allowed disabled:border-line disabled:text-ink-3 disabled:opacity-65">
            {remainderLabel}
          </button>
          <p className="mt-1 text-[11px] leading-4 text-ink-2 tnum">{remainderReason || `${formatMaterialQuantity(currentAmount)} → ${formatMaterialQuantity(nextAmount)}${remainderUnit}`}</p>
        </div>
      </td>
      <td className="p-0">
        <input
          {...cell(2)}
          value={blank(row.unitAmountMg) ? row.ratio : unitWeightMg > 0 ? formatMaterialQuantity(calc.ratio) : ''}
          inputMode="decimal"
          aria-label={`${rowIndex + 1}번째 원료 배합비율(%)`}
          aria-describedby={weightWarningId}
          title="직접 입력하면 이 비율을 기준으로 낱개당 mg와 총 kg가 계산됩니다."
          onChange={(event) => onPatch(row.id, { ratio: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
      </td>
      <td className={`${numberCellClass} text-ink-2`} title={`손실 반영 전 ${formatMaterialQuantity(calc.netKg)}kg · 낱개당 mg × 총 제작 수량 ÷ 1,000,000에 선택한 손실 계산 방식을 적용`}>
        {formatMaterialQuantity(calc.batchKg)}
      </td>
      <td className="p-0">
        <input
          {...cell(4)}
          value={row.usage}
          inputMode="decimal"
          placeholder={formatMaterialQuantity(calc.usageKg)}
          aria-label={`${rowIndex + 1}번째 원료 사용량(kg) 직접 입력`}
          title="비우면 배합량(또는 팩 단위로 올린 양)을 그대로 씁니다."
          onChange={(event) => onPatch(row.id, { usage: event.target.value })}
          className={`${cellClass} text-right tnum ${
            calc.overridden || calc.packedUp ? 'bg-accent-soft' : ''
          }`}
        />
        {calc.overridden ? (
          <button type="button" onClick={() => onPatch(row.id, { usage: '' })}
            aria-label={`${rowIndex + 1}번째 원료 사용량 자동 계산으로 복원`}
            className="block w-full pb-1 text-center text-[11px] text-accent-strong underline underline-offset-2">
            고정값 · 자동으로 복원
          </button>
        ) : null}
      </td>
      <td className="p-0">
        <PriceCell
          value={row.unitPrice}
          cellProps={cell(5)}
          ariaLabel={`${rowIndex + 1}번째 원료 단가(원/kg)`}
          onChange={(next) => onPatch(row.id, { unitPrice: next })}
        />
      </td>
      <td className={numberCellClass}>{formatWon(calc.amount)}</td>
      {/* 팩 단위는 견적서 비고에 ‘25키로팩킹’ 으로 적혀 오므로 비고 옆에 둔다. */}
      <td className="px-1 py-1">
        <span className="flex items-center justify-end gap-1">
          <input
            {...cell(7)}
            value={row.packKg}
            inputMode="decimal"
            placeholder="-"
            aria-label={`${rowIndex + 1}번째 원료 팩 단위(kg)`}
            title="원료 팩킹 단위(kg). 견적서 비고의 ‘25키로팩킹’ 같은 값입니다."
            onChange={(event) => onPatch(row.id, { packKg: event.target.value })}
            className={`${cellClass} w-12 text-right tnum`}
          />
          {/* 팩 단위를 적은 줄에만 보인다. 빈 칸에 비활성 체크박스를 세워 두면 무슨
              뜻인지 알 수 없는 표시가 모든 줄에 붙는다. */}
          {row.packKg.trim() ? (
            <input
              type="checkbox"
              checked={row.packBilled}
              aria-label={`${rowIndex + 1}번째 원료를 팩 단위로 청구`}
              title="팩 단위로 청구받기: 사용량을 팩 배수로 올립니다. 수량 구간에도 적용됩니다."
              onChange={(event) => onPatch(row.id, { packBilled: event.target.checked })}
            />
          ) : null}
        </span>
      </td>
      <td className="p-0">
        <input
          {...cell(8)}
          value={row.note}
          aria-label={`${rowIndex + 1}번째 원료 비고`}
          onChange={(event) => onPatch(row.id, { note: event.target.value })}
          className={cellClass}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <label className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={row.functional}
            onChange={(event) => onPatch(row.id, { functional: event.target.checked })}
            aria-label={`${rowIndex + 1}번째 원료를 주원료로 표시`}
          />
        </label>
      </td>
      <td className="whitespace-nowrap px-1 py-1 text-center">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${rowIndex + 1}번째 원료 줄 삭제`}
          aria-haspopup="dialog"
          className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:border-danger hover:bg-danger-soft hover:text-danger"
        >
          삭제
        </button>
      </td>
    </tr>
  )
}

/** 원료명 입력 + 자동완성 목록. 목록은 입력 중에만 뜨고 방향키·Enter 로 고른다. */
function IngredientNameCell({
  row,
  index,
  cellProps,
  onChange,
  onApply,
  onAttach,
}: {
  row: MaterialRow
  index: SuggestionIndex
  cellProps: Record<string, unknown>
  onChange: (name: string) => void
  onApply: (suggestion: Suggestion) => void
  onAttach: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = open ? suggestIngredients(index, row.name) : []
  const linked = row.ingredientId || row.dailyIntake

  const choose = (suggestion: Suggestion) => {
    onApply(suggestion)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        {...cellProps}
        value={row.name}
        aria-label="원료명"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls={`suggest-${row.id}`}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setActive(0)}
        onBlur={() => {
          // 클릭으로 고르는 경우가 있어 한 틱 뒤에 닫는다.
          setTimeout(() => setOpen(false), 120)
          // 목록에서 고르지 않고 직접 적은 이름도 공전 원료로 연결되면 기준 정보를 얹는다.
          // 이름은 그대로 둔다 - 적어 넣은 원료명이 발주에 쓰는 이름이다.
          if (!row.ingredientId && row.name) onAttach(row.name)
        }}
        onKeyDown={(event) => {
          if (open && matches.length) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              event.stopPropagation()
              setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
              return
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              choose(matches[active])
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              return
            }
          }
          ;(cellProps.onKeyDown as (event: React.KeyboardEvent<HTMLInputElement>) => void)(event)
        }}
        className={`${cellClass} ${linked ? 'font-medium text-ink' : ''}`}
      />
      {open && matches.length ? (
        <ul
          id={`suggest-${row.id}`}
          role="listbox"
          className="absolute left-0 top-full z-40 max-h-64 w-[26rem] overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          {matches.map((suggestion, position) => (
            <li key={suggestion.key} role="option" aria-selected={position === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
                onMouseEnter={() => setActive(position)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-[13px] ${
                  position === active ? 'bg-accent-soft text-accent-strong' : 'text-ink'
                }`}
              >
                <span className="keep-all">{suggestion.name}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{suggestion.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
