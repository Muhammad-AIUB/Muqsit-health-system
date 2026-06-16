import type { CalculationResult } from '@/types/calculator'
import { MedicalUnitConverter } from '@/lib/conversion/converter'

interface TSATInput {
  serumIron: number
  serumIronUnit: string
  tibcMethod: 'tibc' | 'transferrin'
  tibcValue: number
  tibcUnit: string
  ferritin?: number
}

// Iron in µg/dL; TIBC in µg/dL; Transferrin in mg/dL
function toIronUgDL(value: number, unit: string): number {
  if (unit === 'µg/dL') return value
  if (unit === 'µmol/L') return value * 5.585 // 1 µmol/L Fe = 5.585 µg/dL
  if (unit === 'mmol/L') return value * 5585
  return value
}

function toTIBCUgDL(value: number, unit: string, method: 'tibc' | 'transferrin'): number {
  if (method === 'tibc') {
    if (unit === 'µg/dL') return value
    if (unit === 'µmol/L') return value * 5.585
    return value
  } else {
    // Transferrin → TIBC: TIBC (µg/dL) ≈ Transferrin (mg/dL) × 1.389
    if (unit === 'mg/dL') return value * 1.389
    if (unit === 'g/L') return (value * 100) * 1.389
    if (unit === 'g/dL') return (value * 1000) * 1.389
    return value * 1.389
  }
}

function getIronStatus(tsat: number, ferritin?: number): {
  label: string
  severity: 'success' | 'warning' | 'danger'
  interpretation: string
} {
  // Iron deficiency: TSAT < 20% (or < 16% strict)
  // Functional iron deficiency in CKD: TSAT < 20% with ferritin < 200
  // Iron overload: TSAT > 45-50%

  if (tsat < 16) {
    return {
      label: 'Iron Deficiency',
      severity: 'danger',
      interpretation: 'TSAT < 16% — absolute iron deficiency. Iron supplementation recommended.',
    }
  }
  if (tsat < 20) {
    if (ferritin !== undefined && ferritin < 100) {
      return {
        label: 'Iron Deficiency',
        severity: 'danger',
        interpretation: 'TSAT < 20% with low ferritin — iron deficiency. Supplement iron.',
      }
    }
    return {
      label: 'Low-Normal (Possible Functional Deficiency)',
      severity: 'warning',
      interpretation: 'TSAT 16–20% — may indicate functional iron deficiency, especially in CKD/CHF.',
    }
  }
  if (tsat <= 45) {
    return {
      label: 'Normal',
      severity: 'success',
      interpretation: 'TSAT 20–45% — normal iron stores.',
    }
  }
  if (tsat <= 60) {
    return {
      label: 'Elevated — Iron Overload Risk',
      severity: 'warning',
      interpretation: 'TSAT > 45% — possible iron overload. Consider genetic hemochromatosis screen.',
    }
  }
  return {
    label: 'Iron Overload',
    severity: 'danger',
    interpretation: 'TSAT > 60% — significant iron overload. Evaluate for hemochromatosis.',
  }
}

export function calculateTSAT(input: TSATInput): CalculationResult {
  const ironUgDL = toIronUgDL(input.serumIron, input.serumIronUnit)
  const tibcUgDL = toTIBCUgDL(input.tibcValue, input.tibcUnit, input.tibcMethod)

  if (tibcUgDL <= 0) {
    return {
      calculatorId: 'tsat',
      severity: 'neutral',
      label: 'Invalid',
      interpretation: 'TIBC/Transferrin must be greater than zero',
      timestamp: new Date().toISOString(),
    }
  }

  const tsat = MedicalUnitConverter.round((ironUgDL / tibcUgDL) * 100, 1)
  const status = getIronStatus(tsat, input.ferritin)

  let ferritinContext = ''
  if (input.ferritin !== undefined) {
    if (input.ferritin < 30) ferritinContext = 'Low ferritin confirms iron depletion'
    else if (input.ferritin < 100) ferritinContext = 'Reduced ferritin suggests iron deficiency'
    else if (input.ferritin <= 300) ferritinContext = 'Normal ferritin range'
    else ferritinContext = 'Elevated ferritin — may indicate inflammation/iron overload'
  }

  return {
    calculatorId: 'tsat',
    score: tsat,
    unit: '%',
    severity: status.severity,
    label: status.label,
    interpretation: status.interpretation,
    details: [
      { label: 'TSAT', value: tsat, unit: '%' },
      { label: 'Serum Iron', value: MedicalUnitConverter.round(ironUgDL, 1), unit: 'µg/dL' },
      { label: 'TIBC', value: MedicalUnitConverter.round(tibcUgDL, 1), unit: 'µg/dL' },
      ...(input.ferritin !== undefined ? [{ label: 'Ferritin', value: input.ferritin, unit: 'ng/mL' }] : []),
    ],
    subResults: [
      { label: 'Iron Status', value: status.label, severity: status.severity },
      ...(ferritinContext ? [{ label: 'Ferritin Context', value: ferritinContext }] : []),
    ],
    formula: 'TSAT (%) = (Serum Iron / TIBC) × 100',
    references: ['KDIGO Anemia Guideline. 2012', 'Camaschella C. NEJM. 2015'],
    timestamp: new Date().toISOString(),
  }
}
