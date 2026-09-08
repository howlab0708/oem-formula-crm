'use client'

/**
 * 포장 단위 · 제품 정보 블록. 엑셀 견적서 맨 위의 회색 띠에 해당한다.
 *
 * 여기 넣은 1정 중량 · 1세트 개수 · 수량 · Loss율 네 값에서 배합 총량과 가공
 * 수량이 전부 나온다. 그래서 이 블록만 고쳐도 표 세 개가 같이 다시 계산된다.
 */

import { formatKg, packageLabel } from '@/lib/formulaDesign/calc'
import type { Totals } from '@/lib/formulaDesign/calc'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type { PackagingSpec } from '@/lib/formulaDesign/types'
import { FORM_TYPES } from '@/lib/types'

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3'

type Props = { spec: PackagingSpec; totals: Totals; dispatch: (action: SheetAction) => void }

export function SpecPanel({ spec, totals, dispatch }: Props) {
  const set = (key: keyof PackagingSpec) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    dispatch({ type: 'spec', key, value: event.target.value })

  const label = packageLabel(spec)

  return (
    <section aria-labelledby="spec-panel-title" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="spec-panel-title" className="text-[14px] font-semibold text-ink">
          포장 단위 · 제품 정보
        </h3>
        <p className="text-[12px] text-ink-3">
          {label ? (
            <>
              규격 <span className="font-medium text-ink">{label}</span> · 총 배합량{' '}
              <span className="tnum font-medium text-ink">{formatKg(totals.totalBatchKg, 2)}kg</span> · 총{' '}
              <span className="tnum font-medium text-ink">{totals.totalUnits.toLocaleString('ko-KR')}</span>개
            </>
          ) : (
            '1정 중량과 1세트 개수를 입력하면 규격과 배합 총량이 계산됩니다.'
          )}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="제품명">
          <input className={fieldClass} value={spec.productName} onChange={set('productName')} placeholder="예: 하우랩 항산화 정제" />
        </Field>
        <Field label="고객사">
          <input className={fieldClass} value={spec.customer} onChange={set('customer')} placeholder="예: 하우랩" />
        </Field>
        <Field label="식품유형">
          <input className={fieldClass} value={spec.foodType} onChange={set('foodType')} placeholder="예: 건강기능식품(비타민C)" />
        </Field>
        <Field label="제형">
          <select className={fieldClass} value={spec.form} onChange={set('form')}>
            {FORM_TYPES.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </select>
        </Field>

        <Field label="1회분 중량 (mg)" hint="1정·1캡슐·1포의 중량">
          <input className={`${fieldClass} text-right tnum`} value={spec.unitWeightMg} onChange={set('unitWeightMg')} inputMode="numeric" placeholder="800" />
        </Field>
        <Field label="1세트 개수" hint="한 통에 들어가는 정 수">
          <input className={`${fieldClass} text-right tnum`} value={spec.unitsPerSet} onChange={set('unitsPerSet')} inputMode="numeric" placeholder="60" />
        </Field>
        <Field label="수량 (set)" hint="발주 수량">
          <input className={`${fieldClass} text-right tnum`} value={spec.setCount} onChange={set('setCount')} inputMode="numeric" placeholder="1000" />
        </Field>
        <Field label="Loss율 (%)" hint="원료 투입량 할증. 공장마다 3~10%">
          <input className={`${fieldClass} text-right tnum`} value={spec.lossPercent} onChange={set('lossPercent')} inputMode="decimal" placeholder="10" />
        </Field>

        <Field label="포장 형태">
          <input className={fieldClass} value={spec.packaging} onChange={set('packaging')} placeholder="예: PE병 / PTP 포장" />
        </Field>
        <Field label="섭취방법">
          <input className={fieldClass} value={spec.intakeGuide} onChange={set('intakeGuide')} placeholder="예: 1일 1회, 1회 1정" />
        </Field>
        <Field label="유통기한">
          <input className={fieldClass} value={spec.shelfLife} onChange={set('shelfLife')} placeholder="예: 제조일로부터 24개월" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="견적일">
            <input className={fieldClass} value={spec.quotedOn} onChange={set('quotedOn')} placeholder="2026.09.08" />
          </Field>
          <Field label="유효기간">
            <input className={fieldClass} value={spec.validity} onChange={set('validity')} placeholder="30일" />
          </Field>
        </div>
      </div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span> : null}
    </label>
  )
}
