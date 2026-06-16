import type { CalculationResult } from '@/types/calculator'

export interface SDAIInput {
  tenderJointCount: number
  swollenJointCount: number
  crpMgDl: number
  patientGlobal: number
  providerGlobal: number
}

export const SDAI_FORMULA =
  'SDAI = Tender Joint Count + Swollen Joint Count + CRP, mg/dL + Patient Global Activity + Provider Global Activity'

export function calculateSDAI(input: SDAIInput): CalculationResult {
  const tenderJointCount = Number(input.tenderJointCount || 0)
  const swollenJointCount = Number(input.swollenJointCount || 0)
  const crpMgDl = Number(input.crpMgDl || 0)
  const patientGlobal = Number(input.patientGlobal || 0)
  const providerGlobal = Number(input.providerGlobal || 0)
  const score = tenderJointCount + swollenJointCount + crpMgDl + patientGlobal + providerGlobal
  const roundedScore = Number(score.toFixed(1))

  let label = 'Remission'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score > 26) {
    label = 'High disease activity'
    severity = 'danger'
  } else if (score > 11) {
    label = 'Moderate disease activity'
    severity = 'warning'
  } else if (score > 3.3) {
    label = 'Low disease activity'
    severity = 'warning'
  }

  return {
    calculatorId: 'sdai',
    score: roundedScore,
    unit: 'points',
    severity,
    label,
    interpretation: `${roundedScore} points`,
    formula: SDAI_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
