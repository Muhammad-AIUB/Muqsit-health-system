import type { CalculationResult } from '@/types/calculator';

interface WintersInput {
  bicarbonate: number;  // mEq/L
}

export function calculateWintersFormula(input: WintersInput): CalculationResult & {
  expectedPco2: number;
  rangeMin2: number;
  rangeMax2: number;
  rangeMin5: number;
  rangeMax5: number;
} {
  const { bicarbonate } = input;

  const expectedPco2 = 1.5 * bicarbonate + 8;
  const rounded      = Math.round(expectedPco2 * 10) / 10;

  return {
    calculatorId: 'winters-formula',
    score: rounded,
    unit: 'mmHg',
    severity: 'info',
    label: 'Expected pCO2',
    interpretation: `Expected pCO2: ${rounded} mmHg (±2: ${Math.round((rounded-2)*10)/10}–${Math.round((rounded+2)*10)/10}) (±5: ${Math.round((rounded-5)*10)/10}–${Math.round((rounded+5)*10)/10})`,
    expectedPco2: rounded,
    rangeMin2: Math.round((rounded - 2) * 10) / 10,
    rangeMax2: Math.round((rounded + 2) * 10) / 10,
    rangeMin5: Math.round((rounded - 5) * 10) / 10,
    rangeMax5: Math.round((rounded + 5) * 10) / 10,
    references: ['Winters RW. Am J Med. 1960', 'MDCalc – Winters Formula'],
  };
}
