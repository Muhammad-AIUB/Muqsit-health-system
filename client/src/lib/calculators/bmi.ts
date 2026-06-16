import type { CalculationResult } from '@/types/calculator'
import { MedicalUnitConverter } from '@/lib/conversion/converter'

interface BMIInput {
  heightCm: number
  weightKg: number
}

function getBMICategory(bmi: number): {
  label: string
  severity: 'success' | 'warning' | 'danger'
  description: string
} {
  if (bmi < 18.5) return { label: 'Underweight', severity: 'warning', description: 'Below normal weight range (BMI < 18.5)' }
  if (bmi < 25) return { label: 'Normal weight', severity: 'success', description: 'Healthy BMI range (WHO 18.5–24.9)' }
  if (bmi < 30) return { label: 'Overweight', severity: 'warning', description: 'Above normal weight range (BMI 25.0–29.9)' }
  if (bmi < 35) return { label: 'Obese (Class I)', severity: 'danger', description: 'Obesity Class I (BMI 30.0–34.9)' }
  if (bmi < 40) return { label: 'Obese (Class II)', severity: 'danger', description: 'Obesity Class II (BMI 35.0–39.9)' }
  return { label: 'Obese (Class III / Morbid)', severity: 'danger', description: 'Obesity Class III / Morbid obesity (BMI ≥ 40.0)' }
}

export function calculateBMI(input: BMIInput): CalculationResult {
  const heightM = input.heightCm / 100
  if (heightM <= 0 || input.weightKg <= 0) {
    return {
      calculatorId: 'bmi',
      score: 0,
      severity: 'neutral',
      label: 'Incomplete',
      interpretation: 'Please enter valid height and weight',
      timestamp: new Date().toISOString(),
    }
  }

  const bmi = MedicalUnitConverter.round(input.weightKg / (heightM * heightM), 1)
  const bsa = MedicalUnitConverter.round(Math.sqrt((input.heightCm * input.weightKg) / 3600), 2)
  const category = getBMICategory(bmi)

  const weightLb = MedicalUnitConverter.round(input.weightKg * 2.20462, 1)
  const heightIn = MedicalUnitConverter.round(input.heightCm / 2.54, 1)
  const heightFt = Math.floor(heightIn / 12)
  const heightInRemainder = MedicalUnitConverter.round(heightIn % 12, 1)

  return {
    calculatorId: 'bmi',
    score: bmi,
    unit: 'kg/m2',
    severity: category.severity,
    label: category.label,
    interpretation: category.description,
    details: [
      { label: 'BMI', value: bmi, unit: 'kg/m2' },
      { label: 'Body Surface Area', value: bsa, unit: 'm2' },
      { label: 'Height', value: `${heightFt}'${heightInRemainder}"` },
      { label: 'Height (cm)', value: input.heightCm, unit: 'cm' },
      { label: 'Weight (kg)', value: input.weightKg, unit: 'kg' },
      { label: 'Weight (lb)', value: weightLb, unit: 'lb' },
    ],
    subResults: [
      { label: 'WHO Category', value: category.label, severity: category.severity },
      {
        label: 'Body Surface Area',
        value: bsa,
        unit: 'm2',
        severity: 'neutral',
        interpretation: 'Mosteller formula',
      },
    ],
    formula: 'Body mass index, kg/m2 = weight, kg / (height, m)2\nBody surface area (Mosteller), m2 = [(height, cm x weight, kg) / 3600]1/2',
    references: ['WHO Expert Committee. Physical status. 1995', 'Mosteller RD. N Engl J Med. 1987'],
    timestamp: new Date().toISOString(),
  }
}
