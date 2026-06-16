import type { CalculationResult } from '@/types/calculator'

export interface CDAIInput {
  tenderJointCount: number
  swollenJointCount: number
  patientGlobal: number
  providerGlobal: number
}

export const CDAI_FORMULA =
  'CDAI = Tender Joint Count + Swollen Joint Count + Patient Global Activity + Provider Global Activity'

export function calculateCDAI(input: CDAIInput): CalculationResult {
  const tenderJointCount = Number(input.tenderJointCount || 0)
  const swollenJointCount = Number(input.swollenJointCount || 0)
  const patientGlobal = Number(input.patientGlobal || 0)
  const providerGlobal = Number(input.providerGlobal || 0)
  const score = tenderJointCount + swollenJointCount + patientGlobal + providerGlobal

  let label = 'Remission'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 22) {
    label = 'High disease activity'
    severity = 'danger'
  } else if (score > 10) {
    label = 'Moderate disease activity'
    severity = 'warning'
  } else if (score > 2.8) {
    label = 'Low disease activity'
    severity = 'warning'
  }

  return {
    calculatorId: 'cdai',
    score: Number(score.toFixed(1)),
    unit: 'points',
    severity,
    label,
    interpretation: `${Number(score.toFixed(1))} points`,
    formula: CDAI_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
