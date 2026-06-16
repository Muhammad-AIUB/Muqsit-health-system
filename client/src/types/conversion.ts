export type UnitCategory =
  | 'concentration-mass'
  | 'concentration-molar'
  | 'weight'
  | 'length'
  | 'pressure'
  | 'temperature'
  | 'rate'
  | 'volume'
  | 'time'
  | 'dimensionless'

export interface UnitDefinition {
  symbol: string
  name: string
  category: UnitCategory
  toCanonical: number | ((value: number) => number)
  fromCanonical?: (value: number) => number
  precision: number
  aliases?: string[]
  substance?: string
}

export interface ConversionResult {
  value: number
  unit: string
  precision: number
  formatted: string
}

export interface AllConversions {
  [unit: string]: number
}

export interface ConversionRequest {
  value: number
  fromUnit: string
  toUnit: string
  substance?: string
}

export type SubstanceKey =
  | 'creatinine'
  | 'bilirubin'
  | 'glucose'
  | 'urea'
  | 'uric-acid'
  | 'cholesterol'
  | 'triglycerides'
  | 'calcium'
  | 'phosphate'
  | 'magnesium'
  | 'iron'
  | 'albumin'
