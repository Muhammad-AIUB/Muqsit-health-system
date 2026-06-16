import type { CalculationResult } from '@/types/calculator';

interface CockcroftGaultInput {
  sex: 'male' | 'female';
  age: number;
  weightKg: number;
  creatinineMgDl: number;
  heightCm?: number;  // optional — needed for IBW/ABW
}

function ibw(sex: 'male' | 'female', heightInches: number): number {
  const base = sex === 'male' ? 50 : 45.5;
  const extra = Math.max(0, heightInches - 60);
  return base + 2.3 * extra;
}

function crcl(age: number, weightKg: number, crMgDl: number, sex: 'male' | 'female'): number {
  const sexFactor = sex === 'female' ? 0.85 : 1;
  return ((140 - age) * weightKg * sexFactor) / (72 * crMgDl);
}

export function calculateCockcroftGault(input: CockcroftGaultInput): CalculationResult & {
  crclActual: number;
  crclIbw?: number;
  crclAbw?: number;
  ibwKg?: number;
  abwKg?: number;
} {
  const { sex, age, weightKg, creatinineMgDl, heightCm } = input;

  const actual = Math.round(crcl(age, weightKg, creatinineMgDl, sex) * 10) / 10;

  let ibwKg: number | undefined;
  let abwKg: number | undefined;
  let crclIbw: number | undefined;
  let crclAbw: number | undefined;

  if (heightCm && heightCm > 0) {
    const heightIn = heightCm / 2.54;
    ibwKg   = Math.round(ibw(sex, heightIn) * 10) / 10;
    abwKg   = Math.round((ibwKg + 0.4 * (weightKg - ibwKg)) * 10) / 10;
    crclIbw = Math.round(crcl(age, ibwKg,  creatinineMgDl, sex) * 10) / 10;
    crclAbw = Math.round(crcl(age, abwKg,  creatinineMgDl, sex) * 10) / 10;
  }

  const getSeverity = (val: number): CalculationResult['severity'] => {
    if (val >= 90)  return 'success';
    if (val >= 60)  return 'info';
    if (val >= 30)  return 'warning';
    return 'danger';
  };

  const getLabel = (val: number): string => {
    if (val >= 90)  return 'Normal or high (CKD G1)';
    if (val >= 60)  return 'Mildly decreased (CKD G2)';
    if (val >= 45)  return 'Mild-moderate decrease (CKD G3a)';
    if (val >= 30)  return 'Moderate-severe decrease (CKD G3b)';
    if (val >= 15)  return 'Severely decreased (CKD G4)';
    return 'Kidney failure (CKD G5)';
  };

  return {
    calculatorId: 'cockcroft-gault',
    score: actual,
    unit: 'mL/min',
    severity: getSeverity(actual),
    label: getLabel(actual),
    interpretation: getLabel(actual),
    crclActual: actual,
    crclIbw,
    crclAbw,
    ibwKg,
    abwKg,
    references: [
      'Cockcroft DW, Gault MH. Nephron. 1976',
      'Devine BJ. Drug Intell Clin Pharm. 1974',
    ],
  };
}
