import type { CalculationResult } from '@/types/calculator'

export interface BASDAIInput {
  q1: number
  q2: number
  q3: number
  q4: number
  q5: number
  q6: number
}

export const BASDAI_FORMULA = 'BASDAI = ((Q1 + Q2 + Q3 + Q4) + ((Q5 + Q6) / 2)) / 5'

export function calculateBASDAI(input: BASDAIInput): CalculationResult {
  const q1 = Number(input.q1 || 0)
  const q2 = Number(input.q2 || 0)
  const q3 = Number(input.q3 || 0)
  const q4 = Number(input.q4 || 0)
  const q5 = Number(input.q5 || 0)
  const q6 = Number(input.q6 || 0)
  const score = ((q1 + q2 + q3 + q4) + ((q5 + q6) / 2)) / 5
  const roundedScore = Number(score.toFixed(1))

  let label = 'Low disease activity'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 6) {
    label = 'Very high disease activity'
    severity = 'danger'
  } else if (score >= 4) {
    label = 'Active disease; biologic therapy may be considered'
    severity = 'danger'
  }

  return {
    calculatorId: 'basdai',
    score: roundedScore,
    unit: 'points',
    severity,
    label,
    interpretation: `${roundedScore} points`,
    formula: BASDAI_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
