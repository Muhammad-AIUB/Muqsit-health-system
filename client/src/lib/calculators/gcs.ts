import type { CalculationResult } from '@/types/calculator'

export type GcsComponentValue = number | 'NT'

interface GcsInput {
  eye: GcsComponentValue
  verbal: GcsComponentValue
  motor: GcsComponentValue
}

export function calculateGCS(input: GcsInput): CalculationResult {
  const testableScores = [input.eye, input.verbal, input.motor].filter(
    (value): value is number => typeof value === 'number'
  )
  const hasNotTestable = testableScores.length < 3
  const score = testableScores.reduce((sum, value) => sum + value, 0)
  const componentText = `E(${input.eye}) V(${input.verbal}) M(${input.motor})`

  return {
    calculatorId: 'gcs',
    score: hasNotTestable ? undefined : score,
    value: hasNotTestable ? componentText : score,
    unit: hasNotTestable ? undefined : 'points',
    severity: hasNotTestable ? 'neutral' : score <= 8 ? 'danger' : score <= 12 ? 'warning' : 'success',
    label: hasNotTestable ? componentText : `${score} points`,
    interpretation: componentText,
    formula:
      'The Glasgow Coma Score is calculated by addition of the total points selected under each component (eye, verbal, motor) below, e.g. "15 points".\nThe Glasgow Coma Scale is comprised of the individual components, e.g. "E(4) V(5) M(6)".',
    timestamp: new Date().toISOString(),
  }
}
