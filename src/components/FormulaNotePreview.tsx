import { parseBriefingText, type NoteFrequency } from '@/lib/formulaNotes'

export function FormulaNotePreview({ text }: { text: string }) {
  const parsed = parseBriefingText(text)
  if (!parsed) return <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted px-6 py-12 text-center">
    <p className="text-[14px] font-medium text-ink-2">복사한 배합비 브리핑을 한눈에 확인하세요</p>
    <p className="mt-2 text-[13px] text-ink-3">배합비 검색 → 텍스트 복사 → 위 입력란에 붙여넣기</p>
  </div>
  return <div className="space-y-5" aria-label="배합비 노트 미리보기">
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">검토 배합 조건</h3>
        <span className="text-[12px] text-ink-3">브리핑 작성일 {parsed.date || '미표기'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {parsed.conditions.length ? parsed.conditions.map((condition, i) => <span key={i}
          className={`max-w-full rounded-md border px-3 py-2 text-[13px] break-words ${condition.group === '주원료' ? 'border-accent-line bg-accent-soft text-accent-strong' : 'border-line bg-surface-muted text-ink-2'}`}>
          <span className="mr-2 opacity-70">{condition.group}</span><strong className="font-medium">{condition.label}</strong>
        </span>) : <p className="text-[13px] text-ink-3">조건 미지정 · 전체 시장 기준</p>}
      </div>
    </section>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {parsed.metrics.map((metric) => <div key={metric.label} className="rounded-lg border border-line bg-surface p-4">
        <p className="text-[12px] text-ink-3">{metric.label}</p>
        <p className="mt-2 text-[14px] leading-6 font-medium text-ink keep-all">{metric.value}</p>
      </div>)}
    </div>
    <p className="text-[12px] text-ink-3">아래 비율은 시장 레퍼런스의 원료 채택률입니다. 실제 원료 투입 비율은 복사 원문에 포함되어 있지 않습니다.</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FrequencyCard title="다빈도 주원료" items={parsed.mainIngredients} />
      <FrequencyCard title="다빈도 부원료" items={parsed.subIngredients} />
      <CombinationCard title="다빈도 주원료 조합" items={parsed.mainCombos} />
      <CombinationCard title="다빈도 부원료 조합" items={parsed.subCombos} />
    </div>
  </div>
}

function FrequencyCard({ title, items }: { title: string; items: NoteFrequency[] }) {
  return <section className="min-w-0 rounded-lg border border-line bg-surface p-5">
    <h3 className="text-[14px] font-semibold">{title}</h3>
    {items.length ? <ul className="mt-4 space-y-3">{items.map((item, i) => <li key={i}>
      <div className="mb-1 flex justify-between gap-3 text-[13px]"><span className="keep-all">{item.name}</span><span className="shrink-0 text-ink-2 tnum">{item.percent}%</span></div>
      <div className="h-1.5 overflow-hidden rounded bg-surface-sunken"><div className="h-full rounded bg-accent" style={{ width: `${item.percent}%` }} /></div>
    </li>)}</ul> : <p className="mt-3 text-[13px] text-ink-3">복사한 원문에 해당 집계가 없습니다.</p>}
  </section>
}

function CombinationCard({ title, items }: { title: string; items: { label: string; count: string }[] }) {
  return <section className="min-w-0 rounded-lg border border-line bg-surface p-5">
    <h3 className="text-[14px] font-semibold">{title}</h3>
    {items.length ? <ul className="mt-3 divide-y divide-line">{items.map((item, i) => <li key={i} className="flex justify-between gap-3 py-3 text-[13px]">
      <span className="keep-all">{item.label}</span><span className="shrink-0 text-ink-3 tnum">{item.count}건</span>
    </li>)}</ul> : <p className="mt-3 text-[13px] text-ink-3">복사한 원문에 반복 조합이 없습니다.</p>}
  </section>
}
