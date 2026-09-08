'use client'

/**
 * 구성 및 포장지 표. 엑셀 견적서 맨 아래 블록이자 고객용 PDF 의 본문이다.
 *
 * 여기서 표시량을 정하고 **배합비율을 역산**한다. 연구원의 실제 작업 순서가 그 방향이다 -
 * "비타민B1을 1.2mg 표시하려면 몇 % 넣어야 하나"가 질문이고, 배합비율은 그 답이다.
 *
 *   표시량 → 단위 환산(DFE 등) → ÷ 역가 → × (1 + 오버차지) → 투입량 → 배합비율
 *
 * 역가는 원료 규격서(CoA)의 값이라 미리 채우지 않는다. 대신 이름으로 알아낼 수 있는
 * 이론 역가를 힌트로 보여주고, 넣을지는 연구원이 정한다. 잘못된 역가는 고객 문서의
 * 함량 오류로 바로 이어진다.
 */

import { formatKg, num } from '@/lib/formulaDesign/calc'
import type { MaterialCalc } from '@/lib/formulaDesign/calc'
import {
  dailyValuePercent,
  deriveFromLabel,
  labelFromInput,
  parseLabelAmount,
  potencyHint,
  trimPercent,
} from '@/lib/formulaDesign/labeling'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type { MaterialRow } from '@/lib/formulaDesign/types'
import { cellClass, headClass } from './cellStyles'

type Props = {
  materials: MaterialCalc[]
  intakeGuide: string
  /** 1회분 중량(mg). 역산의 분모다. */
  unitWeightMg: string
  dispatch: (action: SheetAction) => void
}

export function LabelTable({ materials, intakeGuide, unitWeightMg, dispatch }: Props) {
  const functional = materials.filter((item) => item.row.functional)
  const patch = (id: string, next: Partial<MaterialRow>) => dispatch({ type: 'material', id, patch: next })
  const unitWeight = num(unitWeightMg)

  return (
    <section aria-labelledby="label-table-title" className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-3 py-2">
        <h3 id="label-table-title" className="text-[14px] font-semibold text-ink">
          구성 및 포장지
        </h3>
        <p className="text-[12px] text-ink-3">
          {intakeGuide ? `${intakeGuide} · ` : ''}
          표시량과 역가를 넣고 ‘배합비율 역산’을 누르면 원료비 표의 배합비율이 채워집니다. 이 표가 고객용 PDF 로 나갑니다.
        </p>
      </header>

      {functional.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-ink-3">
          기능성 주원료로 표시한 줄이 없습니다. 원료비 표의 ‘기능성 표시’ 를 켜 주세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] border-collapse text-[13px]">
            <caption className="sr-only">
              기능성 원료의 일일섭취기준, 표시량, 역가, 오버차지, 기준치 대비 비율, 기능성내용
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`${headClass} min-w-[11rem] text-left`}>기능성원료</th>
                <th scope="col" className={`${headClass} w-32 text-left`}>일일섭취기준</th>
                <th scope="col" className={`${headClass} w-28 text-left`}>표시량</th>
                <th scope="col" className={`${headClass} w-24`}>역가(%)</th>
                <th scope="col" className={`${headClass} w-24`}>오버차지(%)</th>
                <th scope="col" className={`${headClass} w-40`}>배합비율 역산</th>
                <th scope="col" className={`${headClass} w-28 text-left`}>기준치 대비</th>
                <th scope="col" className={`${headClass} text-left`}>기능성내용</th>
              </tr>
            </thead>
            <tbody>
              {functional.map((item) => (
                <LabelRow
                  key={item.row.id}
                  item={item}
                  unitWeight={unitWeight}
                  onPatch={patch}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-3 py-2 text-[12px] text-ink-3">
        일일섭취기준·기능성내용은 기능성 원료 조회(건강기능식품 공전·인정 자료)에서 불러온 값입니다. 역가는 원료 규격서의
        값을 넣어 주세요 - 화면에 뜨는 이론 역가는 분자량 비로 계산한 참고값이고, 혼합제제·희석품은 크게 다릅니다.
        최종 표시 문구와 함량은 공전 원문과 품목제조보고 기준으로 확인해 확정하세요.
      </p>
    </section>
  )
}

function LabelRow({
  item,
  unitWeight,
  onPatch,
}: {
  item: MaterialCalc
  unitWeight: number
  onPatch: (id: string, patch: Partial<MaterialRow>) => void
}) {
  const { row } = item
  const hint = potencyHint(row.name)
  const derived = deriveFromLabel({
    labelAmount: row.labelAmount,
    potency: row.potency,
    overage: row.overage,
    unitWeightMg: unitWeight,
  })
  // 지금 배합비율이 목표 표시량과 맞는지 거꾸로도 보여준다.
  const parsed = parseLabelAmount(row.labelAmount)
  const current = labelFromInput(item.mgPerUnit, row.potency, row.overage, parsed?.unit ?? 'mg')
  const nrv = dailyValuePercent(row.basis, row.labelAmount)
  const matches = derived !== null && Math.abs(derived.ratio - num(row.ratio)) < 0.0001

  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="px-2 py-2 text-left font-normal">
        <span className="block text-ink">{row.basis || row.name || '이름 없음'}</span>
        <span className="block text-[11px] text-ink-3">
          {row.basis && row.basis !== row.name ? `${row.name} · ` : ''}
          1정당 투입 {formatKg(item.mgPerUnit, 3)}mg
        </span>
      </th>
      <td className="p-0">
        <input
          value={row.dailyIntake ?? ''}
          aria-label={`${row.name} 일일섭취기준`}
          placeholder="예: 0.36~100 mg"
          onChange={(event) => onPatch(row.id, { dailyIntake: event.target.value })}
          className={cellClass}
        />
      </td>
      <td className="p-0">
        <input
          value={row.labelAmount}
          aria-label={`${row.name} 표시량`}
          placeholder="예: 1.2mg"
          onChange={(event) => onPatch(row.id, { labelAmount: event.target.value })}
          className={`${cellClass} font-medium`}
        />
        {derived?.equivalent.note ? (
          <span className="block px-2 pb-1 text-[11px] text-ink-3">{derived.equivalent.note}</span>
        ) : null}
      </td>
      <td className="p-0">
        <input
          value={row.potency}
          inputMode="decimal"
          aria-label={`${row.name} 역가(%)`}
          title="원료 1mg 에 기준 성분이 몇 % 들어있는지. 원료 규격서(CoA)의 값을 넣습니다."
          onChange={(event) => onPatch(row.id, { potency: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
        {hint && !row.potency ? (
          <button
            type="button"
            onClick={() => onPatch(row.id, { potency: String(hint.percent) })}
            title={`이론값 ${hint.note}. 실제 역가는 원료 규격서를 확인하세요.`}
            className="mx-2 mb-1 block text-left text-[11px] text-accent-strong underline underline-offset-2"
          >
            이론 {hint.percent}%
          </button>
        ) : null}
      </td>
      <td className="p-0">
        <input
          value={row.overage}
          inputMode="decimal"
          aria-label={`${row.name} 오버차지(%)`}
          title="유통 중 감소를 감안한 과량 투입 비율. 보통 10~30%."
          onChange={(event) => onPatch(row.id, { overage: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
      </td>
      <td className="px-2 py-1.5">
        {derived === null ? (
          <span className="text-[11px] text-ink-3">표시량·역가·1회분 중량이 필요합니다</span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch(row.id, { ratio: trimPercent(derived.ratio) })}
              disabled={matches}
              className="shrink-0 rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 transition-colors hover:bg-surface-sunken disabled:opacity-50"
            >
              {matches ? '반영됨' : '배합비율 역산'}
            </button>
            <span className="text-[11px] text-ink-3 tnum">
              {trimPercent(derived.ratio)}% · 투입 {formatKg(derived.inputMg, 3)}mg
            </span>
          </div>
        )}
        {derived !== null && !matches && current !== null ? (
          <span className="mt-1 block text-[11px] text-danger">
            현재 배합비율 {num(row.ratio) || 0}% 는 표시량 {formatKg(current, 3)}
            {parsed?.unit ? ` ${parsed.unit}` : 'mg'} 에 해당합니다
          </span>
        ) : null}
      </td>
      <td className="p-0">
        <input
          value={row.labelPercent}
          aria-label={`${row.name} 일일영양성분 기준치 대비 비율`}
          placeholder="예: 100%"
          onChange={(event) => onPatch(row.id, { labelPercent: event.target.value })}
          className={`${cellClass} text-right tnum`}
        />
        {nrv.state === 'ok' ? (
          <button
            type="button"
            onClick={() => onPatch(row.id, { labelPercent: `${Math.round(nrv.percent)}%` })}
            title={`1일 영양성분 기준치 ${nrv.entry.amount}${nrv.entry.unit} 기준 (식품등의 표시기준 고시값). 누르면 채웁니다.`}
            className="mx-2 mb-1 block w-full text-right text-[11px] text-accent-strong underline underline-offset-2"
          >
            {Math.round(nrv.percent).toLocaleString('ko-KR')}%
          </button>
        ) : nrv.state === 'needs-check' ? (
          <span className="mx-2 mb-1 block text-right text-[11px] text-ink-3">기준치 확인 필요</span>
        ) : null}
      </td>
      <td className="p-0">
        <textarea
          value={row.functionality ?? ''}
          rows={2}
          aria-label={`${row.name} 기능성내용`}
          placeholder="식약처 인정 기능성 문구"
          onChange={(event) => onPatch(row.id, { functionality: event.target.value })}
          className="w-full resize-y bg-transparent px-2 py-1.5 text-[13px] leading-5 text-ink outline-none placeholder:text-ink-3 focus:bg-accent-soft"
        />
      </td>
    </tr>
  )
}
