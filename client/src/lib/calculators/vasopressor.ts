import type { CalculationResult } from '@/types/calculator'
import { MedicalUnitConverter } from '@/lib/conversion/converter'

interface VasopressorDrug {
  name: string
  dose: number
  unit: string
  enabled: boolean
}

interface VasopressorInput {
  weight: number
  weightUnit: string
  drugs: VasopressorDrug[]
}

// VIS multipliers (Gaies et al. 2010)
// VIS = dopamine + dobutamine + 100×epinephrine + 100×norepinephrine
//       + 10×milrinone + 100×phenylephrine + 10000×vasopressin (units/kg/min)
const VIS_MULTIPLIERS: Record<string, number> = {
  dopamine: 1,
  dobutamine: 1,
  epinephrine: 100,
  norepinephrine: 100,
  vasopressin: 10000, // dose expressed in units/kg/min
  milrinone: 10,
  phenylephrine: 100,
}

// Convert drug dose to mcg/kg/min
function toMcgKgMin(dose: number, unit: string, weightKg: number): number {
  if (unit === 'mcg/kg/min') return dose

  if (unit === 'mcg/min') return dose / weightKg

  if (unit === 'mg/hr') {
    // mg/hr → mcg/min → mcg/kg/min
    return (dose * 1000 / 60) / weightKg
  }

  if (unit === 'mg/min') {
    return (dose * 1000) / weightKg
  }

  if (unit === 'units/min') {
    // vasopressin → units/kg/min (multiplied by 10000 in VIS)
    return dose / weightKg
  }

  if (unit === 'units/hr') {
    // units/hr → units/min → units/kg/min
    return (dose / 60) / weightKg
  }

  return dose
}

function getVIS(drugs: VasopressorDrug[], weightKg: number): number {
  let vis = 0

  for (const drug of drugs) {
    if (!drug.enabled || drug.dose <= 0) continue

    const name = drug.name.toLowerCase()
    const mcgKgMin = toMcgKgMin(drug.dose, drug.unit, weightKg)

    const multiplier = VIS_MULTIPLIERS[name] ?? 1
    vis += mcgKgMin * multiplier
  }

  return MedicalUnitConverter.round(vis, 1)
}

export function calculateVasopressor(input: VasopressorInput): CalculationResult {
  let weightKg = input.weight
  if (input.weightUnit === 'lb') {
    weightKg = input.weight * 0.453592
  }

  const vis = getVIS(input.drugs, weightKg)

  let severity: 'success' | 'warning' | 'danger'
  let interpretation: string
  let cardiovascularSOFA: number

  if (vis <= 5) {
    severity = 'success'
    interpretation = 'Low vasopressor support — hemodynamically stable'
    cardiovascularSOFA = 1
  } else if (vis <= 15) {
    severity = 'warning'
    interpretation = 'Moderate vasopressor support — monitor closely'
    cardiovascularSOFA = 2
  } else if (vis <= 30) {
    severity = 'danger'
    interpretation = 'High vasopressor support — consider additional vasopressors'
    cardiovascularSOFA = 3
  } else {
    severity = 'danger'
    interpretation = 'Refractory shock — multiple high-dose vasopressors, very high mortality'
    cardiovascularSOFA = 4
  }

  const activeDrugs = input.drugs.filter((d) => d.enabled && d.dose > 0)

  return {
    calculatorId: 'vasopressor',
    score: vis,
    severity,
    label: `VIS: ${vis}`,
    interpretation,
    details: [
      { label: 'VIS Score', value: vis },
      { label: 'Cardiovascular SOFA', value: cardiovascularSOFA, unit: '/4' },
      { label: 'Patient Weight', value: MedicalUnitConverter.round(weightKg, 1), unit: 'kg' },
      { label: 'Active Vasopressors', value: activeDrugs.length },
      ...activeDrugs.map((d) => ({
        label: d.name,
        value: `${d.dose} ${d.unit}`,
      })),
    ],
    subResults: [
      { label: 'Cardiovascular SOFA', value: cardiovascularSOFA, severity },
      { label: 'Shock Severity', value: vis <= 5 ? 'Stable' : vis <= 15 ? 'Moderate' : 'Severe', severity },
    ],
    formula: 'VIS = Dopamine + Dobutamine + 100×Epinephrine + 100×Norepinephrine + 10×Milrinone + 100×Phenylephrine + 10000×Vasopressin (units/kg/min), all other doses in mcg/kg/min',
    references: ['Wernovsky G et al. Circulation. 1995', 'Gaies MG et al. Pediatr Crit Care Med. 2010', 'McIntosh AM et al. Pediatr Crit Care Med. 2017'],
    timestamp: new Date().toISOString(),
  }
}
