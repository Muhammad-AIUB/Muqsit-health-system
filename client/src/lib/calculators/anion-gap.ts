import type { CalculationResult } from '@/types/calculator';

interface AnionGapInput {
  sodium: number;       // mEq/L
  chloride: number;     // mEq/L
  bicarbonate: number;  // mEq/L
  albumin?: number;     // g/dL (optional)
}

const NORMAL_AG = 12; // mEq/L

export function calculateAnionGap(input: AnionGapInput): CalculationResult & {
  ag: number;
  deltaGap: number;
  correctedAg?: number;
  correctedDeltaGap?: number;
  deltaRatio: number;
  correctedDeltaRatio?: number;
} {
  const { sodium, chloride, bicarbonate, albumin } = input;

  const ag         = sodium - (chloride + bicarbonate);
  const deltaGap   = ag - NORMAL_AG;
  const deltaRatio = (24 - bicarbonate) !== 0
    ? Math.round((deltaGap / (24 - bicarbonate)) * 100) / 100
    : 0;

  let correctedAg: number | undefined;
  let correctedDeltaGap: number | undefined;
  let correctedDeltaRatio: number | undefined;

  if (albumin !== undefined && albumin >= 0) {
    correctedAg         = ag + 2.5 * (4 - albumin);
    correctedDeltaGap   = correctedAg - NORMAL_AG;
    correctedDeltaRatio = (24 - bicarbonate) !== 0
      ? Math.round((correctedDeltaGap / (24 - bicarbonate)) * 100) / 100
      : 0;
    correctedAg         = Math.round(correctedAg   * 10) / 10;
    correctedDeltaGap   = Math.round(correctedDeltaGap * 10) / 10;
  }

  const agRound  = Math.round(ag       * 10) / 10;
  const dgRound  = Math.round(deltaGap * 10) / 10;

  // Severity based on anion gap
  let severity: CalculationResult['severity'];
  let interpretation: string;

  const primaryAg = correctedAg ?? agRound;
  if (primaryAg <= 12) {
    severity = 'success';
    interpretation = 'Normal anion gap (<=12 mEq/L)';
  } else if (primaryAg <= 20) {
    severity = 'warning';
    interpretation = 'Elevated anion gap (12–20 mEq/L) — possible metabolic acidosis';
  } else {
    severity = 'danger';
    interpretation = 'High anion gap (>20 mEq/L) — MUDPILES: methanol, uremia, DKA, propylene glycol, isoniazid, lactic acidosis, ethylene glycol, salicylates';
  }

  return {
    calculatorId: 'anion-gap',
    score: agRound,
    unit: 'mEq/L',
    severity,
    label: interpretation,
    interpretation,
    ag: agRound,
    deltaGap: dgRound,
    correctedAg,
    correctedDeltaGap,
    deltaRatio,
    correctedDeltaRatio,
    references: ['MDCalc – Anion Gap', 'Emmett M, Narins RG. Medicine. 1977'],
  };
}
