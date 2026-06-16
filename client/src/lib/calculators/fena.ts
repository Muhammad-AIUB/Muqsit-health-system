import type { CalculationResult } from '@/types/calculator';

interface FENaInput {
  serumSodium: number;      // mEq/L
  serumCreatinine: number;  // mg/dL
  urineSodium: number;      // mEq/L
  urineCreatinine: number;  // mg/dL
}

export function calculateFENa(input: FENaInput): CalculationResult {
  const { serumSodium, serumCreatinine, urineSodium, urineCreatinine } = input;

  // FENa (%) = 100 × (SCr × UNa) / (SNa × UCr)
  const fena  = 100 * (serumCreatinine * urineSodium) / (serumSodium * urineCreatinine);
  const score = Math.round(fena * 100) / 100;

  let severity: CalculationResult['severity'];
  let interpretation: string;

  if (fena < 1) {
    severity = 'info';
    interpretation = 'FENa <1% — Prerenal azotemia likely (volume depletion, low cardiac output)';
  } else if (fena <= 2) {
    severity = 'warning';
    interpretation = 'FENa 1–2% — Indeterminate; consider clinical context';
  } else {
    severity = 'danger';
    interpretation = 'FENa >2% — Intrinsic renal disease likely (e.g., ATN)';
  }

  return {
    calculatorId: 'fena',
    score,
    unit: '%',
    severity,
    label: interpretation,
    interpretation,
    references: ['Espinel CH. JAMA. 1976', 'MDCalc – Fractional Excretion of Sodium (FENa)'],
  };
}
