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
