'use client'

/**
 * 구성 및 포장지 표. 엑셀 견적서 맨 아래 블록이자 고객용 PDF 의 본문이다.
 *
 * 기능성 원료로 표시한 줄만 모아 `기능성원료 · 일일섭취기준 · 표시량 · 기능성내용`
 * 을 보여준다. 일일섭취기준과 기능성내용은 원료명 자동완성이 식약처 자료에서
 * 채워 넣은 값이고(수정 가능), 표시량은 연구원이 직접 넣는다 - 염·혼합제제는
 * 투입량과 표시량이 달라서 자동으로 계산할 수 없다. 대신 1정당 투입량을 옆에
 * 참고값으로 보여 준다.
 */

import { formatKg } from '@/lib/formulaDesign/calc'
import type { MaterialCalc } from '@/lib/formulaDesign/calc'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type { MaterialRow } from '@/lib/formulaDesign/types'
import { cellClass, headClass } from './cellStyles'

type Props = {
  materials: MaterialCalc[]
  intakeGuide: string
  dispatch: (action: SheetAction) => void
}

export function LabelTable({ materials, intakeGuide, dispatch }: Props) {
  const functional = materials.filter((item) => item.row.functional)
  const patch = (id: string, next: Partial<MaterialRow>) => dispatch({ type: 'material', id, patch: next })

  return (
    <section aria-labelledby="label-table-title" className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-3 py-2">
        <h3 id="label-table-title" className="text-[14px] font-semibold text-ink">
          구성 및 포장지
        </h3>
        <p className="text-[12px] text-ink-3">
          {intakeGuide ? `${intakeGuide} · ` : ''}
          원료비 표에서 ‘기능성 표시’ 를 켠 줄만 나옵니다. 이 표가 고객용 PDF 로 나갑니다.
        </p>
      </header>

      {functional.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-ink-3">
          기능성 주원료로 표시한 줄이 없습니다. 원료비 표의 ‘기능성 표시’ 를 켜 주세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-[13px]">
            <caption className="sr-only">기능성 원료의 일일섭취기준, 표시량, 기능성내용</caption>
            <thead>
              <tr>
                <th scope="col" className={`${headClass} min-w-[11rem] text-left`}>기능성원료</th>
                <th scope="col" className={`${headClass} w-40 text-left`}>일일섭취기준</th>
                <th scope="col" className={`${headClass} w-32 text-left`}>표시량</th>
                <th scope="col" className={`${headClass} w-24 text-left`}>기준치 대비</th>
                <th scope="col" className={`${headClass} text-left`}>기능성내용</th>
              </tr>
            </thead>
            <tbody>
              {functional.map((item) => (
                <tr key={item.row.id} className="border-t border-line align-top">
                  <th scope="row" className="px-2 py-2 text-left font-normal">
                    <span className="block text-ink">{item.row.basis || item.row.name || '이름 없음'}</span>
                    <span className="block text-[11px] text-ink-3">
                      {item.row.basis && item.row.basis !== item.row.name ? `${item.row.name} · ` : ''}
                      1정당 투입 {formatKg(item.mgPerUnit, 3)}mg
                    </span>
                  </th>
                  <td className="p-0">
                    <input
                      value={item.row.dailyIntake ?? ''}
                      aria-label={`${item.row.name} 일일섭취기준`}
                      placeholder="예: 0.36~100 mg"
                      onChange={(event) => patch(item.row.id, { dailyIntake: event.target.value })}
                      className={cellClass}
                    />
                  </td>
                  <td className="p-0">
                    <input
                      value={item.row.labelAmount}
                      aria-label={`${item.row.name} 표시량`}
                      placeholder="예: 1.2mg"
                      onChange={(event) => patch(item.row.id, { labelAmount: event.target.value })}
                      className={`${cellClass} font-medium`}
                    />
                  </td>
                  <td className="p-0">
                    <input
                      value={item.row.labelPercent}
                      aria-label={`${item.row.name} 일일영양성분 기준치 대비 비율`}
                      placeholder="예: 100%"
                      title="식품등의 표시기준상 일일영양성분 기준치 대비 비율. 표시 기준을 확인해 직접 입력하세요."
                      onChange={(event) => patch(item.row.id, { labelPercent: event.target.value })}
                      className={`${cellClass} text-right tnum`}
                    />
                  </td>
                  <td className="p-0">
                    <textarea
                      value={item.row.functionality ?? ''}
                      rows={2}
                      aria-label={`${item.row.name} 기능성내용`}
                      placeholder="식약처 인정 기능성 문구"
                      onChange={(event) => patch(item.row.id, { functionality: event.target.value })}
                      className="w-full resize-y bg-transparent px-2 py-1.5 text-[13px] leading-5 text-ink outline-none placeholder:text-ink-3 focus:bg-accent-soft"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-3 py-2 text-[12px] text-ink-3">
        일일섭취기준·기능성내용은 기능성 원료 조회(건강기능식품 공전·인정 자료)에서 불러온 값입니다. 최종 표시 문구는 공전
        원문과 품목제조보고 기준을 확인해 확정하세요.
      </p>
    </section>
  )
}
