import type { CalculationResult } from '@/types/calculator'

export interface AIHInput {
  anaSma: number
  lkm1: number
  sla: number
  igg: number
  histology: number
  viralHepatitis: number
}

export const AIH_FORMULA = 'Addition of assigned points.'

export function calculateAIH(input: AIHInput): CalculationResult {
  const autoantibodyScore = Math.min(input.anaSma + input.lkm1 + input.sla, 2)
  const score = autoantibodyScore + input.igg + input.histology + input.viralHepatitis

  let label = 'AIH unlikely'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score >= 7) {
    label = 'Definite Autoimmune Hepatitis'
    severity = 'danger'
  } else if (score >= 6) {
    label = 'Probable Autoimmune Hepatitis'
    severity = 'warning'
  }

  return {
    calculatorId: 'aih',
    score,
    unit: 'points',
    severity,
    label,
    interpretation: `${score} points`,
    formula: AIH_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
