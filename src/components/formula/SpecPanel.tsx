'use client'

/**
 * 포장 단위 · 제품 정보 블록. 엑셀 견적서 맨 위의 회색 띠에 해당한다.
 *
 * 여기 넣은 1정 중량 · 1세트 개수 · 수량 · Loss율 네 값에서 배합 총량과 가공
 * 수량이 전부 나온다. 그래서 이 블록만 고쳐도 표 세 개가 같이 다시 계산된다.
 */

import { allowanceLabel, formatKg, num, packageLabel, unitNoun, validYield } from '@/lib/formulaDesign/calc'
import type { Totals } from '@/lib/formulaDesign/calc'
import type { SheetAction } from '@/lib/formulaDesign/reducer'
import type { PackagingSpec } from '@/lib/formulaDesign/types'
import type { ReferenceSpec } from '@/lib/formulaDesign/fromProduct'
import { FORM_TYPES } from '@/lib/types'

const fieldClass =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3'

/**
 * 목적격 조사. 앞말에 받침이 있으면 `을`, 없으면 `를`.
 *
 * 빠진 칸 이름을 이어 붙여 문장을 만들므로 조사가 그때마다 달라진다
 * (`1회분 중량을` / `1세트 개수를` / `수량을`).
 */
function objectParticle(word: string): string {
  const last = word.trim().at(-1)
  if (!last) return '를'
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return '를'
  return (code - 0xac00) % 28 === 0 ? '를' : '을'
}

type Props = { spec: PackagingSpec; referenceSpec?: ReferenceSpec; totals: Totals; dispatch: (action: SheetAction) => void }

export function SpecPanel({ spec, referenceSpec, totals, dispatch }: Props) {
  const set = (key: keyof PackagingSpec) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    dispatch({ type: 'spec', key, value: event.target.value })

  const label = packageLabel(spec)
  const noun = unitNoun(spec.form)
  const sourceStatus = (key: keyof ReferenceSpec) => {
    if (!referenceSpec) return undefined
    const source = referenceSpec[key]
    const current = spec[key].trim()
    if (!source) return current ? '직접 입력' : '원본 미제공'
    return current === source ? '제품 규격' : current ? '수정됨' : '직접 입력 필요'
  }

  /*
   * 아래 표가 전부 0 으로 나오는 원인은 거의 늘 이 세 칸이다. 무엇이 비었는지 이름으로
   * 말해 준다 - 안내문(placeholder)을 이미 채워진 값으로 착각하고, 원가가 0 인 이유를
   * 화면 위쪽 세 칸에서 찾지 못하는 일이 처음 쓸 때 실제로 생긴다.
   */
  const missing = (
    [
      [`1${noun} 중량`, spec.unitWeightMg],
      ['1세트 개수', spec.unitsPerSet],
      ['제작 수량', spec.setCount],
    ] as const
  )
    .filter(([, value]) => num(value) <= 0)
    .map(([name]) => name)

  return (
    <section aria-labelledby="spec-panel-title" className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="spec-panel-title" className="text-[14px] font-semibold text-ink">
          포장 단위 · 제품 정보
        </h3>
        <p className="text-[12px] text-ink-3">
          {label ? (
            <>
              규격 <span className="font-medium text-ink">{label}</span>
              {missing.length === 0 ? (
                <>
                  {' '}· 총 배합량{' '}
                  <span className="tnum font-medium text-ink">{formatKg(totals.totalBatchKg, 2)}kg</span> · 총{' '}
                  <span className="tnum font-medium text-ink">{totals.totalUnits.toLocaleString('ko-KR')}</span>{noun}
                </>
              ) : (
                ' · '
              )}
            </>
          ) : null}
          {missing.length > 0 ? (
            <span className="font-medium text-accent-strong">
              {missing.join(' · ')}
              {objectParticle(missing[missing.length - 1])} 입력하면 원가가 계산됩니다
            </span>
          ) : null}
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

        <Field label={`1${noun} 중량 (mg)`} status={sourceStatus('unitWeightMg')} hint="원료별 mg 합계가 맞춰질 목표 중량">
          <input className={`${fieldClass} text-right tnum`} value={spec.unitWeightMg} onChange={set('unitWeightMg')} inputMode="decimal" placeholder="예: 800" />
        </Field>
        <Field label="1세트 개수" status={sourceStatus('unitsPerSet')} hint={`한 세트에 들어가는 ${noun} 수`}>
          <input className={`${fieldClass} text-right tnum`} value={spec.unitsPerSet} onChange={set('unitsPerSet')} inputMode="numeric" placeholder="예: 60" />
        </Field>
        <Field label="제작 수량 (set)" hint={`총 ${totals.totalUnits.toLocaleString('ko-KR')}${noun} 제작 · 낱개로 주문 시 1세트 개수를 1로 입력`}>
          <input className={`${fieldClass} text-right tnum`} value={spec.setCount} onChange={set('setCount')} inputMode="numeric" placeholder="예: 1,000" />
        </Field>
        <div className="space-y-2">
          <Field label="생산 손실 계산 방식">
            <select className={fieldClass} value={spec.lossMode ?? 'additive'} onChange={set('lossMode')}>
              <option value="additive">Loss 추가 · 순량에 가산</option>
              <option value="yield">수율 적용 · 순량을 수율로 나눔</option>
            </select>
          </Field>
          {spec.lossMode === 'yield' ? (
            <Field label="수율 (%)" hint="예: 수율 90% → 순량 ÷ 0.9">
              <input className={`${fieldClass} text-right tnum`} value={spec.yieldPercent ?? ''} onChange={set('yieldPercent')} inputMode="decimal" placeholder="예: 90" aria-invalid={!validYield(spec)} />
            </Field>
          ) : (
            <Field label="Loss율 (%)" hint="예: Loss 10% → 순량 × 1.1">
              <input className={`${fieldClass} text-right tnum`} value={spec.lossPercent} onChange={set('lossPercent')} inputMode="decimal" placeholder="10" />
            </Field>
          )}
          {!validYield(spec) ? <p role="alert" className="text-[12px] text-danger">수율을 0 초과 100 이하로 입력해야 필요량을 계산할 수 있습니다.</p> : null}
        </div>

        <Field label="포장 형태" status={sourceStatus('packaging')}>
          <input className={fieldClass} value={spec.packaging} onChange={set('packaging')} placeholder="예: PE병 / PTP 포장" />
        </Field>
        <Field label="섭취방법" status={sourceStatus('intakeGuide')}>
          <input className={fieldClass} value={spec.intakeGuide} onChange={set('intakeGuide')} placeholder="예: 1일 1회, 1회 1정" />
        </Field>
        <Field label="유통기한" status={sourceStatus('shelfLife')}>
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
      <p className="mt-3 text-[12px] text-ink-3">{allowanceLabel(spec)} · Loss 10% 추가와 수율 90%는 서로 다른 계산입니다. 공장 견적서의 방식을 선택하세요.</p>
    </section>
  )
}

function Field({ label, hint, status, children }: { label: string; hint?: string; status?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-center justify-between gap-1 text-[12px] font-medium text-ink-2">{label}
        {status ? <span className={`rounded px-1.5 py-0.5 text-[10px] ${status === '제품 규격' ? 'bg-accent-soft text-accent-strong' : 'bg-surface-sunken text-ink-3'}`}>{status}</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-0.5 block text-[11px] text-ink-3">{hint}</span> : null}
    </label>
  )
}
