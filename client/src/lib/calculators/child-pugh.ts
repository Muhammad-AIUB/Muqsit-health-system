import type { CalculationResult } from '@/types/calculator'
import { bilirubinConvert, albuminConvert } from '@/lib/conversion/converter'

interface ChildPughInput {
  bilirubin: number
  bilirubinUnit: string
  albumin: number
  albuminUnit: string
  inr: number
  ascites: 'none' | 'mild' | 'moderate-severe'
  encephalopathy: 'none' | 'grade1-2' | 'grade3-4'
}

function scoreBilirubin(mgDL: number): number {
  if (mgDL < 2) return 1
  if (mgDL <= 3) return 2
  return 3
}

function scoreAlbumin(gDL: number): number {
  if (gDL > 3.5) return 1
  if (gDL >= 2.8) return 2
  return 3
}

function scoreINR(inr: number): number {
  if (inr < 1.7) return 1
  if (inr <= 2.3) return 2
  return 3
}

function scoreAscites(ascites: string): number {
  if (ascites === 'none') return 1
  if (ascites === 'mild') return 2
  return 3
}

function scoreEncephalopathy(enceph: string): number {
  if (enceph === 'none') return 1
  if (enceph === 'grade1-2') return 2
  return 3
}

export function calculateChildPugh(input: ChildPughInput): CalculationResult {
  let bilirubinMgDL = input.bilirubin
  if (input.bilirubinUnit === 'µmol/L') {
    bilirubinMgDL = bilirubinConvert(input.bilirubin, 'µmol/L')
  }

  let albuminGdL = input.albumin
  if (input.albuminUnit === 'g/L') {
    albuminGdL = albuminConvert(input.albumin, 'g/L')
  }

  const bilScore = scoreBilirubin(bilirubinMgDL)
  const albScore = scoreAlbumin(albuminGdL)
  const inrScore = scoreINR(input.inr)
  const ascScore = scoreAscites(input.ascites)
  const encScore = scoreEncephalopathy(input.encephalopathy)

  const total = bilScore + albScore + inrScore + ascScore + encScore

  let childClass: 'A' | 'B' | 'C'
  let oneYearSurvival: string
  let twoYearSurvival: string
  let surgicalMortality: string
  let severity: 'success' | 'warning' | 'danger'

  if (total <= 6) {
    childClass = 'A'
    oneYearSurvival = '100%'
    twoYearSurvival = '85%'
    surgicalMortality = '10%'
    severity = 'success'
  } else if (total <= 9) {
    childClass = 'B'
    oneYearSurvival = '80%'
    twoYearSurvival = '60%'
    surgicalMortality = '30%'
    severity = 'warning'
  } else {
    childClass = 'C'
    oneYearSurvival = '45%'
    twoYearSurvival = '35%'
    surgicalMortality = '82%'
    severity = 'danger'
  }

  return {
    calculatorId: 'child-pugh',
    score: total,
    severity,
    label: `Child-Pugh Class ${childClass}`,
    interpretation: `Score ${total}/15 — Class ${childClass} liver disease`,
    details: [
      { label: 'Total Score', value: total, unit: '/15' },
      { label: 'Class', value: childClass },
      { label: 'Bilirubin Score', value: bilScore, unit: '/3' },
      { label: 'Albumin Score', value: albScore, unit: '/3' },
      { label: 'INR Score', value: inrScore, unit: '/3' },
      { label: 'Ascites Score', value: ascScore, unit: '/3' },
      { label: 'Encephalopathy Score', value: encScore, unit: '/3' },
    ],
    subResults: [
      { label: '1-Year Survival', value: oneYearSurvival, severity },
      { label: '2-Year Survival', value: twoYearSurvival, severity },
      { label: 'Surgical Mortality', value: surgicalMortality, severity },
    ],
    formula: 'Sum of 5 parameters (1-3 each): Bilirubin + Albumin + PT/INR + Ascites + Encephalopathy',
    references: ['Child CG, Turcotte JG. Surgery and portal hypertension. 1964', 'Pugh RN et al. Br J Surg. 1973'],
    timestamp: new Date().toISOString(),
  }
}
