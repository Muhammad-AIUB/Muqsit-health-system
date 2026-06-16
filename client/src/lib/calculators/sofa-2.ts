import type { CalculationResult } from '@/types/calculator'

export interface SOFA2Input {
  brain: number
  respiratory: number
  cardiovascular: number
  liver: number
  kidney: number
  hemostasis: number
}

export const SOFA2_FORMULA = 'To calculate the SOFA-2 Score, add the points for each variable.'

export function calculateSOFA2(input: SOFA2Input): CalculationResult {
  const score =
    input.brain +
    input.respiratory +
    input.cardiovascular +
    input.liver +
    input.kidney +
    input.hemostasis

  return {
    calculatorId: 'sofa-2',
    score,
    unit: 'points',
    severity: score >= 11 ? 'danger' : score >= 6 ? 'warning' : 'success',
    label: `${score} points`,
    interpretation: `${score} points`,
    formula: SOFA2_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
