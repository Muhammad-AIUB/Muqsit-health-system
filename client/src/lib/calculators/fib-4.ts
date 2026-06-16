import type { CalculationResult } from '@/types/calculator'

export interface FIB4Input {
  age: number
  ast: number
  alt: number
  platelets: number
  plateletUnit: '10^9/L' | '10^3/uL'
}

export const FIB4_FORMULA =
  'FIB-4 Score = (Age x AST) / (Platelets x sqrt(ALT))'

export function calculateFIB4(input: FIB4Input): CalculationResult {
  const age = Number(input.age || 0)
  const ast = Number(input.ast || 0)
  const alt = Math.max(1, Number(input.alt || 1))
  const platelets = Math.max(1, Number(input.platelets || 1))
  const platelets109L = input.plateletUnit === '10^3/uL' ? platelets : platelets
  const score = (age * ast) / (platelets109L * Math.sqrt(alt))
  const roundedScore = Number(score.toFixed(2))

  let label = 'Low risk of advanced fibrosis'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 3.25) {
    label = 'High risk of advanced fibrosis'
    severity = 'danger'
  } else if (score >= 1.45) {
    label = 'Indeterminate'
    severity = 'warning'
  }

  return {
    calculatorId: 'fib-4',
    score: roundedScore,
    unit: '',
    severity,
    label,
    interpretation: `${roundedScore}`,
    formula: FIB4_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
