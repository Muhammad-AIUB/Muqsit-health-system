import type { CalculationResult } from '@/types/calculator';

interface OsmolarGapInput {
  method: 'measured' | 'assumed';
  measuredOsm?: number;  // mOsm/kg — required when method = 'measured'
  sodium: number;        // stool Na, mEq/L
  potassium: number;     // stool K, mEq/L
}

export function calculateOsmolarGap(input: OsmolarGapInput): CalculationResult {
  const { method, measuredOsm, sodium, potassium } = input;

  const baseOsm = method === 'measured' ? (measuredOsm ?? 290) : 290;
  const gap = baseOsm - 2 * (sodium + potassium);
  const score = Math.round(gap * 10) / 10;

  let severity: CalculationResult['severity'];
  let interpretation: string;

  if (gap < 50) {
    severity = 'info';
    interpretation = 'Secretory diarrhea likely — gap <50 mOsm/kg (electrolyte-driven)';
  } else if (gap <= 125) {
    severity = 'warning';
    interpretation = 'Indeterminate / mixed — gap 50–125 mOsm/kg';
  } else {
    severity = 'danger';
    interpretation = 'Osmotic diarrhea likely — gap >125 mOsm/kg (non-electrolyte osmoles present)';
  }

  const formulaUsed = method === 'measured'
    ? `Stool Osmolal Gap = Stool Osm - (2 x (Na + K))\n= ${baseOsm} - (2 x (${sodium} + ${potassium}))`
    : `Stool Osmolal Gap = 290 - (2 x (Na + K))\n= 290 - (2 x (${sodium} + ${potassium}))`;

  return {
    calculatorId: 'osmolar-gap',
    score,
    unit: 'mOsm/kg',
    severity,
    label: interpretation,
    interpretation,
    formulaUsed,
    references: ['Eherer AJ, Fordtran JS. Gastroenterology 1992', 'MDCalc – Stool Osmolal Gap'],
  };
}
