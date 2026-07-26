import type { CalculationResult } from '@/types/calculator'

export interface FRAXInput {
  age: number
  fractureHistory: number
  motherHipFracture: number
  weight: number
  smoker: number
  chairRise: number
  bmd: number
}

export const FRAX_FORMULA =
  'FRACTURE Index = sum of points (Age + prior fracture + maternal hip fracture + low weight + smoking + arms-to-stand + BMD T-score). Further evaluation warranted at >=4 (without BMD) or >=6 (with BMD).'

export function calculateFRAX(input: FRAXInput, bmdMeasured?: boolean): CalculationResult {
  const score = Object.values(input).reduce((total, value) => total + Number(value || 0), 0)
  // 0 is a VALID entered T-score band (normal, ≥ -1), so "bmd > 0" cannot tell
  // "normal BMD measured" from "no BMD". Prefer the explicit measured flag; fall
  // back to the >0 heuristic only when the flag isn't supplied.
  const bmdEntered = bmdMeasured ?? (Number(input.bmd || 0) > 0)

  let label = 'Lower fracture risk'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  // Referral threshold (Black 2001): ≥6 WITH BMD, ≥4 WITHOUT BMD. So a score of
  // 4-5 with a documented (even normal) BMD is below the with-BMD threshold and
  // remains lower risk — it must not be flagged as the without-BMD ≥4 case.
  if (score >= 6) {
    label = 'Increased fracture risk (>=6 with BMD) — further evaluation/treatment warranted'
    severity = 'danger'
  } else if (!bmdEntered && score >= 4) {
    label = 'Increased fracture risk (>=4 without BMD) — further evaluation warranted'
    severity = 'warning'
  }

  return {
    calculatorId: 'frax',
    score,
    unit: 'points',
    severity,
    label,
    interpretation: `${score} points`,
    formula: FRAX_FORMULA,
    timestamp: new Date().toISOString(),
  }
}
