import type { CalculationResult } from '@/types/calculator'
import { bilirubinConvert, creatinineConvert } from '@/lib/conversion/converter'

interface SOFAInput {
  pao2?: number
  fio2?: number
  spo2?: number
  ventilated: boolean
  platelets: number
  bilirubin: number
  bilirubinUnit: string
  map: number
  vasopressor?: string
  vasopressorDose?: number
  gcs: number
  creatinine: number
  creatinineUnit: string
  urineOutput?: number
}

function scorePulmonary(pao2?: number, fio2?: number, spo2?: number, ventilated?: boolean): number {
  // PaO2/FiO2 preferred; use SpO2/FiO2 if PaO2 unavailable
  let ratio: number | undefined

  if (pao2 && fio2 && fio2 > 0) {
    ratio = pao2 / fio2
  } else if (spo2 && fio2 && fio2 > 0) {
    // SpO2/FiO2 to PaO2/FiO2 approximation (SCCM 2015)
    const spo2Fio2 = spo2 / fio2
    // Approximate: PF = SF × 0.64 (rough)
    ratio = spo2Fio2 * 0.64
  }

  if (ratio === undefined) return 0

  // Official SOFA: scores 3 and 4 require respiratory support (ventilation)
  if (ratio >= 400) return 0
  if (ratio >= 300) return 1           // 300–399 → 1
  if (ratio >= 200) return 2           // 200–299 → 2 (regardless of ventilation)
  if (ratio >= 100) return ventilated ? 3 : 2   // 100–199: 3 only if ventilated
  return ventilated ? 4 : 2            // <100: 4 only if ventilated
}

function scorePlatelets(platelets: number): number {
  // platelets in x10³/µL
  if (platelets >= 150) return 0
  if (platelets >= 100) return 1
  if (platelets >= 50) return 2
  if (platelets >= 20) return 3
  return 4
}

function scoreLiver(bilMgDL: number): number {
  if (bilMgDL < 1.2) return 0
  if (bilMgDL < 2.0) return 1
  if (bilMgDL < 6.0) return 2
  if (bilMgDL < 12.0) return 3
  return 4
}

function scoreCardiovascular(map: number, vasopressor?: string, dose?: number): number {
  if (map >= 70) return 0
  if (map < 70 && !vasopressor) return 1

  if (!vasopressor || !dose) return 1

  const drug = vasopressor.toLowerCase()
  if (drug === 'dopamine' && dose <= 5) return 2
  if (drug === 'dopamine' && dose > 5 && dose <= 15) return 3
  if (drug === 'dopamine' && dose > 15) return 4
  if (drug === 'dobutamine') return 2
  if (drug === 'epinephrine' && dose <= 0.1) return 3
  if (drug === 'epinephrine' && dose > 0.1) return 4
  if (drug === 'norepinephrine' && dose <= 0.1) return 3
  if (drug === 'norepinephrine' && dose > 0.1) return 4
  return 2
}

function scoreNeurological(gcs: number): number {
  if (gcs === 15) return 0
  if (gcs >= 13) return 1
  if (gcs >= 10) return 2
  if (gcs >= 6) return 3
  return 4
}

function scoreRenal(creatMgDL: number, urineOutput?: number): number {
  // Creatinine-based
  let creatScore = 0
  if (creatMgDL >= 5.0) creatScore = 4
  else if (creatMgDL >= 3.5) creatScore = 3
  else if (creatMgDL >= 2.0) creatScore = 2
  else if (creatMgDL >= 1.2) creatScore = 1

  // Urine output (if measured, 24h in mL)
  let uoScore = 0
  if (urineOutput !== undefined) {
    if (urineOutput < 200) uoScore = 4
    else if (urineOutput < 500) uoScore = 3
  }

  return Math.max(creatScore, uoScore)
}

function getMortality(score: number): { range: string; risk: string } {
  if (score < 7) return { range: '< 10%', risk: 'low' }
  if (score < 10) return { range: '15–20%', risk: 'moderate' }
  if (score < 13) return { range: '40–50%', risk: 'high' }
  return { range: '> 80%', risk: 'very-high' }
}

export function calculateSOFA(input: SOFAInput): CalculationResult {
  let bilMgDL = input.bilirubin
  if (input.bilirubinUnit === 'µmol/L') {
    bilMgDL = bilirubinConvert(input.bilirubin, 'µmol/L')
  }

  let creatMgDL = input.creatinine
  if (input.creatinineUnit === 'µmol/L') {
    creatMgDL = creatinineConvert(input.creatinine, 'µmol/L')
  }

  const pulmonaryScore = scorePulmonary(input.pao2, input.fio2, input.spo2, input.ventilated)
  const plateletsScore = scorePlatelets(input.platelets)
  const liverScore = scoreLiver(bilMgDL)
  const cvScore = scoreCardiovascular(input.map, input.vasopressor, input.vasopressorDose)
  const neuroScore = scoreNeurological(input.gcs)
  const renalScore = scoreRenal(creatMgDL, input.urineOutput)

  const total = pulmonaryScore + plateletsScore + liverScore + cvScore + neuroScore + renalScore

  const mortality = getMortality(total)

  let severity: 'success' | 'warning' | 'danger'
  if (total < 7) severity = 'success'
  else if (total < 12) severity = 'warning'
  else severity = 'danger'

  return {
    calculatorId: 'sofa',
    score: total,
    severity,
    label: `SOFA Score: ${total}`,
    interpretation: `ICU mortality risk: ${mortality.range}`,
    details: [
      { label: 'Total SOFA', value: total, unit: '/24' },
      { label: 'Pulmonary (PaO₂/FiO₂)', value: pulmonaryScore, unit: '/4' },
      { label: 'Coagulation (Platelets)', value: plateletsScore, unit: '/4' },
      { label: 'Liver (Bilirubin)', value: liverScore, unit: '/4' },
      { label: 'Cardiovascular (MAP)', value: cvScore, unit: '/4' },
      { label: 'Neurological (GCS)', value: neuroScore, unit: '/4' },
      { label: 'Renal (Creatinine/UO)', value: renalScore, unit: '/4' },
    ],
    subResults: [
      { label: 'ICU Mortality', value: mortality.range, severity },
      { label: 'Organ Failures', value: [pulmonaryScore, plateletsScore, liverScore, cvScore, neuroScore, renalScore].filter(s => s >= 2).length, interpretation: 'Number of organ systems with score ≥ 2' },
    ],
    formula: 'Sum of 6 organ system scores (0–4 each): Respiratory + Coagulation + Liver + Cardiovascular + CNS + Renal',
    references: ['Vincent JL et al. Intensive Care Med. 1996', 'Ferreira FL et al. JAMA. 2001'],
    timestamp: new Date().toISOString(),
  }
}
