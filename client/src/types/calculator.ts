export type CalculatorCategory =
  | 'critical-care'
  | 'renal'
  | 'liver'
  | 'nutrition'
  | 'obstetric'
  | 'cardiovascular'
  | 'hematology'

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very-high' | 'critical'

export type Severity = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface CalculatorInput {
  id: string
  label: string
  type: 'number' | 'select' | 'radio' | 'date' | 'toggle' | 'composite'
  units?: string[]
  defaultUnit?: string
  required: boolean
  min?: number
  max?: number
  precision?: number
  helpText?: string
  options?: { value: string | number; label: string }[]
  clinicalRange?: { min: number; max: number; warning: string }
  dependsOn?: { field: string; value: string | number | boolean }
  placeholder?: string
  substance?: string
}

export interface CalculationResult {
  calculatorId: string
  score?: number
  value?: number | string
  unit?: string
  severity: Severity
  riskLevel?: RiskLevel
  label: string
  interpretation: string
  details?: ResultDetail[]
  formula?: string
  references?: string[]
  subResults?: SubResult[]
  timestamp?: string
  outputs?: OutputItem[]
  warnings?: string[]
  inputs?: Record<string, unknown>
  units?: Record<string, string>
  formulaUsed?: string
}

export interface OutputItem {
  id: string
  label: string
  value: number | string
  unit?: string
  interpretation: {
    text: string
    severity: Severity
    classification?: string
    clinicalNote?: string
  }
}

export interface ResultDetail {
  label: string
  value: string | number
  unit?: string
  severity?: Severity
}

export interface SubResult {
  label: string
  value: number | string
  unit?: string
  severity?: Severity
  interpretation?: string
}

export interface Calculator {
  id: string
  title: string
  shortTitle: string
  description: string
  category: CalculatorCategory
  icon: string
  emoji: string
  color: string
  bgColor: string
  tags: string[]
  inputs: CalculatorInput[]
  calculate: (inputs: Record<string, unknown>) => CalculationResult
}

export interface HistoryEntry {
  id: string
  calculatorId: string
  calculatorTitle: string
  inputs: Record<string, unknown>
  result: CalculationResult
  timestamp: string
}

export interface EGFRInputs {
  creatinine: number
  creatinineUnit: string
  age: number
  sex: 'male' | 'female'
  formula: 'ckd-epi-2021' | 'mdrd'
}

export interface ChildPughInputs {
  bilirubin: number
  bilirubinUnit: string
  albumin: number
  albuminUnit: string
  inr: number
  ascites: 'none' | 'mild' | 'moderate-severe'
  encephalopathy: 'none' | 'grade1-2' | 'grade3-4'
}

export interface MELDNaInputs {
  bilirubin: number
  bilirubinUnit: string
  inr: number
  creatinine: number
  creatinineUnit: string
  sodium: number
  onDialysis: boolean
}

export interface BMIInputs {
  heightCm: number
  weightKg: number
  sex?: 'male' | 'female'
}

export interface EDDInputs {
  method: 'lmp' | 'ultrasound'
  lmpDate?: string
  cycleLength?: number
  scanDate?: string
  gestationalWeeks?: number
  gestationalDays?: number
}

export interface SOFAInputs {
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

export interface VasopressorDrug {
  name: string
  dose: number
  unit: string
  enabled: boolean
}

export interface VasopressorInputs {
  weight: number
  weightUnit: string
  drugs: VasopressorDrug[]
}

export interface TSATInputs {
  serumIron: number
  serumIronUnit: string
  tibcMethod: 'tibc' | 'transferrin'
  tibcValue: number
  tibcUnit: string
  ferritin?: number
}
