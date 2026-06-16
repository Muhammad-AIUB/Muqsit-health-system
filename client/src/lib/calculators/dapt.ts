// DAPT Score — Yeh RW et al., JAMA Cardiol 2016
// Predicts net clinical benefit of prolonged DAPT (>12 months) after coronary stent implantation
// Score range: -2 to 10

interface DaptInput {
  age:             -2 | -1 | 0;  // ≥75 → -2, 65-74 → -1, <65 → 0
  smoking:          0 | 1;
  diabetes:         0 | 1;
  miPresentation:   0 | 1;
  priorPciMi:       0 | 1;
  paclitaxelStent:  0 | 1;
  stentDiameter:    0 | 1;
  chfLvef:          0 | 2;
  veinGraft:        0 | 2;
}

export function calculateDapt(input: DaptInput): {
  score: number;
  interpretation: string;
  recommendation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const score =
    input.age +
    input.smoking +
    input.diabetes +
    input.miPresentation +
    input.priorPciMi +
    input.paclitaxelStent +
    input.stentDiameter +
    input.chfLvef +
    input.veinGraft;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;
  let recommendation: string;

  if (score >= 2) {
    severity       = 'warning';
    interpretation = `High ischemic risk (DAPT Score ${score} ≥ 2)`;
    recommendation = 'Prolonged DAPT (>12 months) is reasonable — ischemic benefit likely outweighs bleeding risk';
  } else {
    severity       = 'success';
    interpretation = `Low ischemic risk (DAPT Score ${score} < 2)`;
    recommendation = 'Standard DAPT (≤12 months) recommended — prolonged DAPT does not offer net benefit';
  }

  return {
    score,
    interpretation,
    recommendation,
    severity,
    references: [
      'Yeh RW et al. Population-level short-term and long-term benefit-harm profile of prolonged dual antiplatelet therapy after MI. JAMA Cardiol. 2016;1(3):243-252',
      'Mauri L et al. Twelve or 30 months of dual antiplatelet therapy after drug-eluting stents. N Engl J Med. 2014;371(23):2155-2166',
    ],
  };
}
