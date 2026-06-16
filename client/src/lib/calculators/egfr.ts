import type { CalculationResult } from '@/types/calculator'
import { creatinineConvert } from '@/lib/conversion/converter'
import { MedicalUnitConverter } from '@/lib/conversion/converter'

export type EGFRFormula = 'ckd-epi-2021' | 'mdrd'

interface EGFRInput {
  creatinine: number
  creatinineUnit: string
  age: number
  sex: 'male' | 'female'
  formula: EGFRFormula
  black?: boolean
}

function getCKDStage(egfr: number): {
  stage: string
  label: string
  severity: 'success' | 'warning' | 'danger'
  description: string
} {
  if (egfr >= 90) return { stage: 'G1', label: 'CKD Stage G1', severity: 'success', description: 'Normal or high kidney function' }
  if (egfr >= 60) return { stage: 'G2', label: 'CKD Stage G2', severity: 'success', description: 'Mildly decreased kidney function' }
  if (egfr >= 45) return { stage: 'G3a', label: 'CKD Stage G3a', severity: 'warning', description: 'Mild to moderately decreased' }
  if (egfr >= 30) return { stage: 'G3b', label: 'CKD Stage G3b', severity: 'warning', description: 'Moderately to severely decreased' }
  if (egfr >= 15) return { stage: 'G4', label: 'CKD Stage G4', severity: 'danger', description: 'Severely decreased kidney function' }
  return { stage: 'G5', label: 'CKD Stage G5', severity: 'danger', description: 'Kidney failure — consider dialysis/transplant' }
}

function calcCKDEPI2021(creatMgDL: number, age: number, sex: 'male' | 'female'): number {
  // CKD-EPI 2021 (race-free)
  const kappa = sex === 'female' ? 0.7 : 0.9
  const alpha = sex === 'female' ? -0.241 : -0.302
  const sexFactor = sex === 'female' ? 1.012 : 1.0

  const scr_kappa = creatMgDL / kappa
  const min_val = Math.min(scr_kappa, 1)
  const max_val = Math.max(scr_kappa, 1)

  const egfr = 142 * Math.pow(min_val, alpha) * Math.pow(max_val, -1.200) *
    Math.pow(0.9938, age) * sexFactor

  return MedicalUnitConverter.round(egfr, 1)
}

function calcMDRD(creatMgDL: number, age: number, sex: 'male' | 'female', black?: boolean): number {
  // 4-variable MDRD equation
  const sexFactor   = sex === 'female' ? 0.742 : 1.0
  const raceFactor  = black ? 1.212 : 1.0
  const egfr = 175 * Math.pow(creatMgDL, -1.154) * Math.pow(age, -0.203) * sexFactor * raceFactor
  return MedicalUnitConverter.round(egfr, 1)
}

export function calculateEGFR(input: EGFRInput): CalculationResult {
  let creatMgDL = input.creatinine
  if (input.creatinineUnit === 'µmol/L') {
    creatMgDL = creatinineConvert(input.creatinine, 'µmol/L')
  }

  // Clamp to prevent extreme values
  creatMgDL = Math.max(0.1, creatMgDL)

  let egfr: number
  let formulaLabel: string

  if (input.formula === 'ckd-epi-2021') {
    egfr = calcCKDEPI2021(creatMgDL, input.age, input.sex)
    formulaLabel = 'CKD-EPI 2021'
  } else {
    egfr = calcMDRD(creatMgDL, input.age, input.sex, input.black)
    formulaLabel = 'MDRD 4-variable'
  }

  const ckdStage = getCKDStage(egfr)

  return {
    calculatorId: 'egfr',
    score: egfr,
    unit: 'mL/min/1.73m²',
    severity: ckdStage.severity,
    label: ckdStage.label,
    interpretation: ckdStage.description,
    details: [
      { label: 'eGFR', value: egfr, unit: 'mL/min/1.73m²' },
      { label: 'CKD Stage', value: ckdStage.stage },
      { label: 'Creatinine (mg/dL)', value: MedicalUnitConverter.round(creatMgDL, 2), unit: 'mg/dL' },
      { label: 'Creatinine (µmol/L)', value: creatinineConvert(creatMgDL, 'mg/dL'), unit: 'µmol/L' },
    ],
    formula: input.formula === 'ckd-epi-2021'
      ? 'eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200 × 0.9938^Age × (1.012 if female)'
      : 'eGFR = 175 × Scr^−1.154 × Age^−0.203 × (0.742 if female)',
    references: [
      formulaLabel,
      'KDIGO 2022 CKD Guidelines',
    ],
    subResults: [
      {
        label: 'Formula Used',
        value: formulaLabel,
      },
      {
        label: 'Dialysis Risk',
        value: egfr < 15 ? 'High — prepare for renal replacement therapy' :
               egfr < 30 ? 'Moderate — nephrology referral recommended' :
               'Low',
        severity: egfr < 15 ? 'danger' : egfr < 30 ? 'warning' : 'success',
      },
    ],
    timestamp: new Date().toISOString(),
  }
}
