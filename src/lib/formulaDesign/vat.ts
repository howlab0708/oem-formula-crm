/** 이 견적 도구에서 사용하는 고정 부가세율. */
export const VAT_RATE = 10

export type VatDisplay = 'included' | 'excluded'

export const vatDisplayLabel = (mode: VatDisplay): string =>
  mode === 'included' ? '부가세(VAT) 포함' : '부가세(VAT) 미포함'

/** 원가에 포함되지 않은 별도 청구 금액은 원 단위로 표시한다. */
export const extraAmountWithVat = (amount: number, mode: VatDisplay): number =>
  mode === 'included' ? Math.round(amount * (1 + VAT_RATE / 100)) : amount

/** 과거 기본 조건의 단독 VAT 안내를 출력 선택값으로 대체한다. 다른 조건은 보존한다. */
export function exportConditions(conditions: string, mode: VatDisplay, showAmounts: boolean): string[] {
  const vatDeclaration = /^(?:부가(?:가치)?세(?:\s*\(\s*VAT\s*\))?|VAT)\s*(?:는\s*)?(?:10\s*%\s*)?(?:미포함|별도|포함)(?:\s*(?:입니다|합니다|적용|계산|청구))?(?:\s*\(\s*10\s*%\s*\))?[.!。]?$/i
  const lines = conditions.split('\n').map((line) => line.trim()).filter(Boolean)
    .filter((line) => !vatDeclaration.test(line))
  if (showAmounts) {
    lines.unshift(mode === 'included'
      ? '표시된 견적 금액과 별도 청구 금액은 부가세(VAT) 10% 포함 금액입니다.'
      : '표시된 견적 금액과 별도 청구 금액은 부가세(VAT) 미포함이며, 부가세 10%가 별도로 추가됩니다.')
  }
  return lines
}
