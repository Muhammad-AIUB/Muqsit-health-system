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

// Returns the 0-4 sub-score plus whether it could actually be derived. A
// missing respiratory component scores 0 by SOFA convention, but 0 also means
// "no respiratory dysfunction" — the two must not be indistinguishable to the
// reader, so the caller surfaces the difference as a warning.
function scorePulmonary(
  pao2?: number,
  fio2?: number,
  spo2?: number,
  ventilated?: boolean,
): { score: number; estimable: boolean } {
  // PaO2/FiO2 preferred; use SpO2/FiO2 if PaO2 unavailable
  let ratio: number | undefined

  if (pao2 && fio2 && fio2 > 0) {
    ratio = pao2 / fio2
  } else if (spo2 && fio2 && fio2 > 0 && spo2 <= 97) {
    // Estimate PaO2/FiO2 from SpO2/FiO2 using the validated Rice et al. (2007)
    // linear relationship S/F = 64 + 0.84 × (P/F) ⇒ P/F = (S/F − 64) / 0.84.
    // Only valid for SpO2 ≤ 97% (the SpO2-PaO2 curve plateaus above that).
    const sf = spo2 / fio2
    ratio = sf > 64 ? (sf - 64) / 0.84 : 0
  }

  // Above SpO2 97% the saturation curve is flat, so S/F cannot stand in for
  // P/F — a patient on FiO2 1.0 reading 98% may still have a P/F near 100.
  // Score 0, but tell the caller it is unknown rather than normal.
  if (ratio === undefined) return { score: 0, estimable: false }

  // Official SOFA: scores 3 and 4 require respiratory support (ventilation)
  let score: number
  if (ratio >= 400) score = 0
  else if (ratio >= 300) score = 1             // 300–399 → 1
  else if (ratio >= 200) score = 2             // 200–299 → 2 (regardless of ventilation)
  else if (ratio >= 100) score = ventilated ? 3 : 2   // 100–199: 3 only if ventilated
  else score = ventilated ? 4 : 2              // <100: 4 only if ventilated
  return { score, estimable: true }
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
  const drug = (vasopressor ?? '').trim().toLowerCase()
  const hasVaso = drug !== ''

  // On a vasopressor the score is driven by the agent/dose regardless of the
  // resulting MAP — pressors are titrated to keep MAP ≥ 65-70, so gating on
  // MAP first (the old bug) scored shocked-but-supported patients as 0.
  if (hasVaso) {
    if (drug === 'dobutamine') return 2 // any dose
    if (drug === 'dopamine') {
      if (dose === undefined) return 2
      if (dose <= 5) return 2
      if (dose <= 15) return 3
      return 4
    }
    if (drug === 'epinephrine' || drug === 'norepinephrine') {
      // Any epinephrine/norepinephrine is at least score 3; > 0.1 µg/kg/min → 4.
      if (dose === undefined) return 3
      return dose <= 0.1 ? 3 : 4
    }
    return 2 // unknown agent on board — at least low-dose support
  }

  // No vasopressor → scored on MAP alone.
  if (map >= 70) return 0
  return 1
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

  const pulmonary = scorePulmonary(input.pao2, input.fio2, input.spo2, input.ventilated)
  const pulmonaryScore = pulmonary.score
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
    warnings: pulmonary.estimable
      ? undefined
      : [
          'Respiratory component could not be derived and is counted as 0 — enter PaO₂ with FiO₂, or an SpO₂ of 97% or less (above that the SpO₂ curve is flat and S/F cannot estimate P/F). The total below understates true severity if the patient is hypoxaemic.',
        ],
    details: [
      { label: 'Total SOFA', value: total, unit: '/24' },
      { label: 'Pulmonary (PaO₂/FiO₂)', value: pulmonaryScore, unit: pulmonary.estimable ? '/4' : '/4 (not estimable — counted as 0)' },
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
