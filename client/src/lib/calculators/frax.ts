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

export function calculateFRAX(input: FRAXInput): CalculationResult {
  const score = Object.values(input).reduce((total, value) => total + Number(value || 0), 0)
  const bmdEntered = Number(input.bmd || 0) > 0

  let label = 'Lower fracture risk'
  let severity: 'success' | 'warning' | 'danger' = 'success'

  if (score >= 6) {
    label = 'Increased fracture risk — further evaluation/treatment warranted'
    severity = 'danger'
  } else if (score >= 4) {
    label = bmdEntered
      ? 'Borderline — repeat assessment / consider BMD threshold (>=6 with BMD)'
      : 'Increased fracture risk (>=4 without BMD) — further evaluation warranted'
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
