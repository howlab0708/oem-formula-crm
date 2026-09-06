'use client'

type Props = {
  label: string
  unit: string
  min: number | null
  max: number | null
  onChange: (min: number | null, max: number | null) => void
  hint?: string
  disabled?: boolean
}

function parse(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function RangeFields({ label, unit, min, max, onChange, hint, disabled }: Props) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[13px] font-semibold text-ink">{label}</label>
        {min !== null || max !== null ? (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="text-[12px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          >
            해제
          </button>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-4 text-ink-3">{hint}</p> : null}

      <div className="mt-2 flex items-center gap-2">
        <NumberField
          value={min}
          placeholder="최소"
          unit={unit}
          disabled={disabled}
          onChange={(next) => onChange(next, max)}
        />
        <span aria-hidden className="text-[13px] text-ink-3">
          ~
        </span>
        <NumberField
          value={max}
          placeholder="최대"
          unit={unit}
          disabled={disabled}
          onChange={(next) => onChange(min, next)}
        />
      </div>
    </div>
  )
}

function NumberField({
  value,
  placeholder,
  unit,
  disabled,
  onChange,
}: {
  value: number | null
  placeholder: string
  unit: string
  disabled?: boolean
  onChange: (next: number | null) => void
}) {
  return (
    <span className="relative flex-1">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value === null ? '' : String(value)}
        placeholder={placeholder}
        onChange={(event) => onChange(parse(event.target.value))}
        className="w-full rounded-md border border-line bg-surface py-1.5 pr-9 pl-2.5 text-[13px] text-ink tnum placeholder:text-ink-3 disabled:bg-surface-sunken disabled:text-ink-3"
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-ink-3">
        {unit}
      </span>
    </span>
  )
}
