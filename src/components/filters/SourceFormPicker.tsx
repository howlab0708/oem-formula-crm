'use client'

import { useId, useState } from 'react'
import { FoldButton } from '@/components/FoldButton'
import { formatInt } from '@/lib/format'
import {
  ORIGIN_LABELS,
  ORIGIN_ORDER,
  type SourceFormOption,
  type SourceOrigin,
} from '@/lib/ingredientSource'

export type SourceFilterValue = {
  nutrient: string | null
  forms: string[]
  exclude: string[]
  origins: SourceOrigin[]
}

type Props = {
  value: SourceFilterValue
  onChange: (next: SourceFilterValue) => void
  /** 데이터에 등장한 영양성분 (제품 수 내림차순) */
  nutrients: Array<{ value: string; count: number }>
  /** 선택한 영양성분의 형태별 제품 수 */
  forms: SourceFormOption[]
}

/** 효모·천연물 유래는 눈에 걸려야 한다. 나머지는 글자만 둔다. */
const HIGHLIGHTED: SourceOrigin[] = ['yeast', 'natural']

function OriginTag({ origin }: { origin: SourceOrigin }) {
  // 형태 이름이 이미 '(형태 미표기)' 라고 말하고 있으면 같은 말을 두 번 쓰지 않는다.
  if (origin === 'unspecified') return null
  const highlighted = HIGHLIGHTED.includes(origin)
  // 강조는 무채색 칩으로만 한다 - 파란 계열은 '선택됨' 을 뜻하므로, 고르지 않은 줄에
  // 파란 꼬리표가 붙으면 선택 상태로 읽힌다.
  return (
    <span
      className={`shrink-0 rounded-[4px] text-[11px] leading-4 ${
        highlighted ? 'bg-surface-sunken px-1.5 py-0.5 text-ink-2' : 'text-ink-3'
      }`}
    >
      {ORIGIN_LABELS[origin]}
    </span>
  )
}

/**
 * 영양성분 원료의 형태(기원)로 좁히는 조건.
 *
 * 공장 연구원이 실제로 묻는 건 "아연이 든 제품" 이 아니라 "아연을 건조효모로 넣은
 * 제품" 이다. 그래서 영양성분을 먼저 고르고, 그 성분을 무엇으로 공급했는지를
 * 건수와 함께 펼친다 - 시장에 그 형태가 몇 건이나 있는지 보고 고를 수 있어야 한다.
 *
 * '기원' 을 원산지로 읽을 수 있어서 아래에 한 줄 적어 둔다. 이 조건은 신고된
 * 원재료명 표기만 읽으며, 표기에 없는 정보는 만들지 않는다.
 */
export function SourceFormPicker({ value, onChange, nutrients, forms }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const bodyId = useId()
  const selectId = useId()

  const selectedForms = new Set(value.forms)
  const excludedForms = new Set(value.exclude)
  const activeCount = value.forms.length + value.exclude.length + value.origins.length

  const toggleForm = (form: string) => {
    onChange({
      ...value,
      forms: selectedForms.has(form) ? value.forms.filter((v) => v !== form) : [...value.forms, form],
      // 같은 형태를 포함과 제외에 동시에 둘 수는 없다.
      exclude: value.exclude.filter((v) => v !== form),
    })
  }

  const toggleExclude = (form: string) => {
    onChange({
      ...value,
      exclude: excludedForms.has(form) ? value.exclude.filter((v) => v !== form) : [...value.exclude, form],
      forms: value.forms.filter((v) => v !== form),
    })
  }

  const toggleOrigin = (origin: SourceOrigin) => {
    onChange({
      ...value,
      origins: value.origins.includes(origin)
        ? value.origins.filter((v) => v !== origin)
        : [...value.origins, origin],
    })
  }

  const availableOrigins = ORIGIN_ORDER.filter(
    (origin) => forms.some((option) => option.origin === origin) || value.origins.includes(origin),
  )

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
        >
          <span
            aria-hidden
            className={`grid h-5 w-5 shrink-0 place-items-center text-[13px] text-ink-3 transition-transform ${
              collapsed ? '' : 'rotate-90'
            }`}
          >
            ▶
          </span>
          <span className="truncate">영양성분 원료 형태</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, forms: [], exclude: [], origins: [] })}
              className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
            >
              {activeCount}개 해제
            </button>
          ) : null}
          <FoldButton
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            label="영양성분 원료 형태 조건"
            controls={bodyId}
          />
        </div>
      </div>

      <div id={bodyId} hidden={collapsed}>
        <p className="mt-1 text-[12px] leading-4 text-ink-3 keep-all">
          같은 영양성분도 산화아연 · 건조효모 · 혼합제제로 갈립니다. 성분을 고르면 그 성분을
          무엇으로 공급했는지가 건수와 함께 펼쳐집니다.
        </p>

        <label htmlFor={selectId} className="sr-only">
          원료 형태를 볼 영양성분
        </label>
        <select
          id={selectId}
          value={value.nutrient ?? ''}
          onChange={(event) => {
            const nutrient = event.target.value || null
            // 성분이 바뀌면 이전 성분의 형태 조건은 의미가 없다.
            onChange({ nutrient, forms: [], exclude: [], origins: value.origins })
          }}
          className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink"
        >
          <option value="">영양성분 선택 안 함</option>
          {nutrients.map((nutrient) => (
            <option key={nutrient.value} value={nutrient.value}>
              {nutrient.value} · {formatInt(nutrient.count)}건
            </option>
          ))}
        </select>

        {availableOrigins.length > 1 ? (
          <div className="mt-3">
            <span className="text-[12px] text-ink-3">기원</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {availableOrigins.map((origin) => {
                const active = value.origins.includes(origin)
                return (
                  <button
                    key={origin}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleOrigin(origin)}
                    className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
                      active
                        ? 'border-accent-line bg-accent-soft text-accent-strong'
                        : 'border-line text-ink-2 hover:bg-surface-sunken'
                    }`}
                  >
                    {ORIGIN_LABELS[origin]}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {value.nutrient ? (
          forms.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-0.5">
              {forms.map((option) => {
                const included = selectedForms.has(option.form)
                const excluded = excludedForms.has(option.form)
                return (
                  // 원료 이름이 길다('비타민D3(콜레칼시페롤) · 혼합제제'). 300px 남짓한
                  // 레일에서 한 줄에 몰아넣으면 이름이 잘려 무엇인지 못 읽으므로,
                  // 이름은 접히게 두고 기원·건수를 아랫줄로 내린다.
                  <li key={option.form} className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => toggleForm(option.form)}
                      aria-pressed={included}
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                        included
                          ? 'bg-accent-soft text-accent-strong'
                          : excluded
                            ? 'bg-danger-soft text-danger'
                            : 'text-ink-2 hover:bg-surface-sunken'
                      }`}
                    >
                      <span className="flex min-w-0 items-start gap-1.5">
                        <span
                          aria-hidden
                          className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-[3px] border ${
                            included
                              ? 'border-accent bg-accent'
                              : excluded
                                ? 'border-danger bg-danger'
                                : 'border-line-strong bg-surface'
                          }`}
                        />
                        <span className="min-w-0 keep-all">{option.form}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 pl-[18px] text-[12px] text-ink-3">
                        <OriginTag origin={option.origin} />
                        <span className="tnum">{formatInt(option.count)}건</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExclude(option.form)}
                      aria-pressed={excluded}
                      title={`${option.form} 쓴 제품 제외`}
                      className={`mt-1.5 shrink-0 rounded-md border px-1.5 py-1 text-[11px] transition-colors ${
                        excluded ? 'border-danger bg-danger-soft text-danger' : 'border-line text-ink-3 hover:bg-surface-sunken'
                      }`}
                    >
                      제외
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-3 px-2 text-[12px] text-ink-3">
              지금 조건에서는 이 성분을 쓴 제품이 없습니다.
            </p>
          )
        ) : null}

        <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-4 text-ink-3 keep-all">
          형태와 기원은 신고된 원재료명 표기를 그대로 읽은 값입니다. 기원은 그 원료를 무엇에서
          얻었는지(효모 배양 · 천연물 · 화학합성)를 말하며, 원산지 국가와는 다릅니다.
        </p>
      </div>
    </div>
  )
}
