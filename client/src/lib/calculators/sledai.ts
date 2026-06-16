import type { CalculationResult } from '@/types/calculator'

export type SLEDAIInput = Record<string, number>

export const SLEDAI_FORMULA = 'SLEDAI Score = sum of all selected item points.'

export function calculateSLEDAI(input: SLEDAIInput): CalculationResult {
  const score = Object.values(input).reduce((total, value) => total + Number(value || 0), 0)

  let label = 'No activity'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 12) {
    label = 'Very high activity'
    severity = 'danger'
  } else if (score > 6) {
    label = 'High activity'
    severity = 'danger'
  } else if (score > 2) {
    label = 'Mild to moderate activity'
    severity = 'warning'
  }

  return {
    calculatorId: 'sledai',
    score,
    unit: 'points',
    severity,
    label,
    interpretation: `${score} points`,
    formula: SLEDAI_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
