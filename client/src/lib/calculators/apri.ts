import type { CalculationResult } from '@/types/calculator'

export interface APRIInput {
  ast: number
  astUpperLimit: number
  platelets: number
  plateletUnit: '10^9/L' | '10^3/uL'
}

export const APRI_FORMULA =
  'APRI = [ (AST / AST Upper Limit of Normal) x 100 ] / Platelets (10^9/L)'

export function calculateAPRI(input: APRIInput): CalculationResult {
  const ast = Number(input.ast || 0)
  const astUpperLimit = Math.max(1, Number(input.astUpperLimit || 1))
  const platelets = Math.max(1, Number(input.platelets || 1))
  // 10^3/µL is numerically identical to 10^9/L
  const platelets109L = platelets
  const score = ((ast / astUpperLimit) * 100) / platelets109L
  const roundedScore = Number(score.toFixed(4))

  let label = 'Significant fibrosis unlikely'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 2.0) {
    label = 'Suggests cirrhosis'
    severity = 'danger'
  } else if (score > 1.5) {
    label = 'Suggests significant fibrosis'
    severity = 'danger'
  } else if (score >= 0.5) {
    label = 'Indeterminate / possible fibrosis'
    severity = 'warning'
  }

  return {
    calculatorId: 'apri',
    score: roundedScore,
    unit: '',
    severity,
    label,
    interpretation: `${roundedScore}`,
    formula: APRI_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
