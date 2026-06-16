import type { UnitDefinition, UnitCategory } from '@/types/conversion'

export const MOLAR_MASSES: Record<string, number> = {
  creatinine: 113.12,
  bilirubin: 584.66,
  glucose: 180.16,
  urea: 60.06,
  'uric-acid': 168.11,
  cholesterol: 386.65,
  triglycerides: 885.43,
  calcium: 40.08,
  phosphate: 94.97,
  magnesium: 24.31,
  iron: 55.85,
  albumin: 66500,
  sodium: 22.99,
  potassium: 39.10,
  chloride: 35.45,
}

export const UNIT_REGISTRY: Record<string, UnitDefinition> = {
  'mg/dL': { symbol: 'mg/dL', name: 'milligrams per deciliter', category: 'concentration-mass', toCanonical: 1, precision: 2, aliases: ['mg/dl', 'mgdl', 'mg%'] },
  'g/dL': { symbol: 'g/dL', name: 'grams per deciliter', category: 'concentration-mass', toCanonical: 1000, precision: 2, aliases: ['g/dl', 'gdl'] },
  'g/L': { symbol: 'g/L', name: 'grams per liter', category: 'concentration-mass', toCanonical: 100, precision: 1, aliases: ['g/l', 'gl'] },
  'mg/L': { symbol: 'mg/L', name: 'milligrams per liter', category: 'concentration-mass', toCanonical: 0.1, precision: 2, aliases: ['mg/l'] },
  'µg/dL': { symbol: 'µg/dL', name: 'micrograms per deciliter', category: 'concentration-mass', toCanonical: 0.001, precision: 1, aliases: ['ug/dL', 'mcg/dL', 'ug/dl'] },
  'µg/L': { symbol: 'µg/L', name: 'micrograms per liter', category: 'concentration-mass', toCanonical: 0.0001, precision: 1, aliases: ['ug/L', 'mcg/L'] },
  'ng/mL': { symbol: 'ng/mL', name: 'nanograms per milliliter', category: 'concentration-mass', toCanonical: 0.0001, precision: 1, aliases: ['ng/ml'] },
  'µmol/L': { symbol: 'µmol/L', name: 'micromoles per liter', category: 'concentration-molar', toCanonical: 1, precision: 1, aliases: ['umol/L', 'umol/l', 'µmol/l'] },
  'mmol/L': { symbol: 'mmol/L', name: 'millimoles per liter', category: 'concentration-molar', toCanonical: 1000, precision: 2, aliases: ['mmol/l', 'mM'] },
  'nmol/L': { symbol: 'nmol/L', name: 'nanomoles per liter', category: 'concentration-molar', toCanonical: 0.001, precision: 1, aliases: ['nmol/l'] },
  'mEq/L': { symbol: 'mEq/L', name: 'milliequivalents per liter', category: 'concentration-molar', toCanonical: 1, precision: 1, aliases: ['meq/L', 'meq/l', 'mEq/l'] },
  'kg': { symbol: 'kg', name: 'kilograms', category: 'weight', toCanonical: 1, precision: 1, aliases: ['kgs', 'kilogram', 'kilograms'] },
  'lb': { symbol: 'lb', name: 'pounds', category: 'weight', toCanonical: 0.453592, precision: 1, aliases: ['lbs', 'pound', 'pounds'] },
  'g': { symbol: 'g', name: 'grams', category: 'weight', toCanonical: 0.001, precision: 0, aliases: ['gram', 'grams'] },
  'oz': { symbol: 'oz', name: 'ounces', category: 'weight', toCanonical: 0.0283495, precision: 1, aliases: ['ounce', 'ounces'] },
  'cm': { symbol: 'cm', name: 'centimeters', category: 'length', toCanonical: 1, precision: 1, aliases: ['centimeter', 'centimeters'] },
  'm': { symbol: 'm', name: 'meters', category: 'length', toCanonical: 100, precision: 2, aliases: ['meter', 'meters'] },
  'ft': { symbol: 'ft', name: 'feet', category: 'length', toCanonical: 30.48, precision: 1, aliases: ['foot', 'feet'] },
  'in': { symbol: 'in', name: 'inches', category: 'length', toCanonical: 2.54, precision: 1, aliases: ['inch', 'inches'] },
  'ft+in': { symbol: 'ft+in', name: 'feet and inches', category: 'length', toCanonical: 1, precision: 1, aliases: [] },
  'mmHg': { symbol: 'mmHg', name: 'millimeters of mercury', category: 'pressure', toCanonical: 1, precision: 0, aliases: ['mmhg'] },
  'kPa': { symbol: 'kPa', name: 'kilopascals', category: 'pressure', toCanonical: 7.50062, precision: 1, aliases: ['kpa'] },
  'cmH2O': { symbol: 'cmH2O', name: 'centimeters of water', category: 'pressure', toCanonical: 0.735559, precision: 0, aliases: ['cmh2o'] },
  '°C': { symbol: '°C', name: 'Celsius', category: 'temperature', toCanonical: (v: number) => v, fromCanonical: (v: number) => v, precision: 1, aliases: ['C', 'celsius'] },
  '°F': { symbol: '°F', name: 'Fahrenheit', category: 'temperature', toCanonical: (v: number) => (v - 32) * (5 / 9), fromCanonical: (v: number) => v * (9 / 5) + 32, precision: 1, aliases: ['F', 'fahrenheit'] },
  'K': { symbol: 'K', name: 'Kelvin', category: 'temperature', toCanonical: (v: number) => v - 273.15, fromCanonical: (v: number) => v + 273.15, precision: 1, aliases: ['kelvin'] },
  'mcg/kg/min': { symbol: 'mcg/kg/min', name: 'micrograms per kilogram per minute', category: 'rate', toCanonical: 1, precision: 3, aliases: ['µg/kg/min', 'ug/kg/min'] },
  'mcg/min': { symbol: 'mcg/min', name: 'micrograms per minute', category: 'rate', toCanonical: 1, precision: 2, aliases: ['µg/min', 'ug/min'] },
  'mg/hr': { symbol: 'mg/hr', name: 'milligrams per hour', category: 'rate', toCanonical: 1, precision: 2, aliases: ['mg/h', 'mg/hour'] },
  'mg/min': { symbol: 'mg/min', name: 'milligrams per minute', category: 'rate', toCanonical: 1, precision: 3, aliases: ['mg/minute'] },
  'units/min': { symbol: 'units/min', name: 'units per minute', category: 'rate', toCanonical: 1, precision: 4, aliases: ['u/min', 'U/min'] },
  'units/hr': { symbol: 'units/hr', name: 'units per hour', category: 'rate', toCanonical: 1, precision: 2, aliases: ['u/hr', 'U/hr'] },
  'mL/hr': { symbol: 'mL/hr', name: 'milliliters per hour', category: 'rate', toCanonical: 1, precision: 1, aliases: ['ml/hr', 'mL/h'] },
  'mL': { symbol: 'mL', name: 'milliliters', category: 'volume', toCanonical: 1, precision: 1, aliases: ['ml', 'milliliter', 'cc'] },
  'L': { symbol: 'L', name: 'liters', category: 'volume', toCanonical: 1000, precision: 2, aliases: ['l', 'liter', 'litre'] },
  'ratio': { symbol: 'ratio', name: 'ratio', category: 'dimensionless', toCanonical: 1, precision: 2, aliases: ['INR', 'inr'] },
  '%': { symbol: '%', name: 'percent', category: 'dimensionless', toCanonical: 1, precision: 1, aliases: ['percent', 'pct'] },
  'x10³/µL': { symbol: 'x10³/µL', name: 'thousands per microliter', category: 'dimensionless', toCanonical: 1, precision: 0, aliases: ['k/uL', 'x10^3/uL'] },
  'x10⁹/L': { symbol: 'x10⁹/L', name: 'billions per liter', category: 'dimensionless', toCanonical: 1, precision: 0, aliases: ['10^9/L', 'G/L'] },
  '/µL': { symbol: '/µL', name: 'per microliter', category: 'dimensionless', toCanonical: 0.001, precision: 0, aliases: ['/uL', 'per µL'] },
  'min': { symbol: 'min', name: 'minutes', category: 'time', toCanonical: 1, precision: 0, aliases: ['minute', 'minutes'] },
  'hr': { symbol: 'hr', name: 'hours', category: 'time', toCanonical: 60, precision: 1, aliases: ['h', 'hour', 'hours'] },
  'days': { symbol: 'days', name: 'days', category: 'time', toCanonical: 1440, precision: 0, aliases: ['day', 'd'] },
  'weeks': { symbol: 'weeks', name: 'weeks', category: 'time', toCanonical: 10080, precision: 1, aliases: ['week', 'wk', 'wks'] },
}

export function findUnit(symbol: string): UnitDefinition | undefined {
  if (UNIT_REGISTRY[symbol]) return UNIT_REGISTRY[symbol]
  return Object.values(UNIT_REGISTRY).find(
    (u) => u.aliases?.some((a) => a.toLowerCase() === symbol.toLowerCase())
  )
}

export function getUnitsByCategory(category: UnitCategory): UnitDefinition[] {
  return Object.values(UNIT_REGISTRY).filter((u) => u.category === category)
}

export const SUBSTANCE_UNIT_PAIRS: Record<string, [string, string]> = {
  creatinine: ['mg/dL', 'µmol/L'],
  bilirubin: ['mg/dL', 'µmol/L'],
  glucose: ['mg/dL', 'mmol/L'],
  urea: ['mg/dL', 'mmol/L'],
  'uric-acid': ['mg/dL', 'µmol/L'],
  cholesterol: ['mg/dL', 'mmol/L'],
  triglycerides: ['mg/dL', 'mmol/L'],
  iron: ['µg/dL', 'µmol/L'],
}
