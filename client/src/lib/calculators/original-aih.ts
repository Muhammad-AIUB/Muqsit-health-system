import type { CalculationResult } from '@/types/calculator'

export interface OriginalAIHInput {
  sex: number
  alpAstAltRatio: number
  serumGlobulinsIgg: number
  antibodies: number
  optionalAutoantibodies: number
  ama: number
  hepatitisViralMarkers: number
  hepatotoxicDrugs: number
  alcoholIntake: number
  interfaceHepatitis: number
  lymphoplasmacytic: number
  rosetting: number
  biliaryChanges: number
  otherChanges: number
  autoimmuneDisease: number
  responseTherapy: number
}

export const ORIGINAL_AIH_FORMULA = 'Addition of assigned points.'

export function calculateOriginalAIH(input: OriginalAIHInput): CalculationResult {
  let score = Object.values(input).reduce((total, value) => total + Number(value || 0), 0)

  // Revised Original AIH rule: if NO interface hepatitis, NOT predominantly
  // lymphoplasmacytic, and NO rosetting of liver cells, subtract 5 points.
  if (
    Number(input.interfaceHepatitis || 0) === 0 &&
    Number(input.lymphoplasmacytic || 0) === 0 &&
    Number(input.rosetting || 0) === 0
  ) {
    score -= 5
  }

  let label = 'AIH unlikely'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  // Revised IAIHG (Alvarez 1999) has two interpretation tables. Once
  // response-to-therapy points are included, the +2-shifted post-treatment
  // cutoffs apply (definite >17, probable 12-17); a pure pre-treatment
  // aggregate uses definite >15, probable ≥10.
  const posttreatment = Number(input.responseTherapy || 0) > 0
  const definiteCut = posttreatment ? 17 : 15
  const probableCut = posttreatment ? 12 : 10

  if (score > definiteCut) {
    label = 'Definite AIH'
    severity = 'danger'
  } else if (score >= probableCut) {
    label = 'Probable AIH'
    severity = 'warning'
  }

  return {
    calculatorId: 'original-aih',
    score,
    unit: 'points',
    severity,
    label,
    interpretation: `${score} points`,
    formula: ORIGINAL_AIH_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
