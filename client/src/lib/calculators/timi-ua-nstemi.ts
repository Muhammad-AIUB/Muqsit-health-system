interface TimiUaNstemiInput {
  age65:          0 | 1;  // age >= 65
  cadRiskFactors: 0 | 1;  // >=3 CAD risk factors
  knownCAD:       0 | 1;  // known CAD, stenosis >=50%
  asaUse:         0 | 1;  // ASA use in past 7 days
  severeAngina:   0 | 1;  // >=2 angina episodes in 24 hrs
  stChanges:      0 | 1;  // EKG ST changes >=0.5mm
  cardiacMarker:  0 | 1;  // positive cardiac marker
}

// 14-day risk of all-cause mortality, new MI, or severe recurrent ischemia
const RISK_TABLE: Record<number, string> = {
  0: '4.7%',
  1: '4.7%',
  2: '8.3%',
  3: '13.2%',
  4: '19.9%',
  5: '26.2%',
  6: '40.9%',
  7: '40.9%',
};

export function calculateTimiUaNstemi(input: TimiUaNstemiInput): {
  score: number;
  riskAt14Days: string;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const score =
    input.age65 +
    input.cadRiskFactors +
    input.knownCAD +
    input.asaUse +
    input.severeAngina +
    input.stChanges +
    input.cardiacMarker;

  const riskAt14Days = RISK_TABLE[score] ?? '';

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (score <= 1) {
    severity = 'success';
    interpretation = `Very low risk — 14-day adverse event risk ${riskAt14Days}`;
  } else if (score === 2) {
    severity = 'success';
    interpretation = `Low risk — 14-day adverse event risk ${riskAt14Days}`;
  } else if (score <= 4) {
    severity = 'warning';
    interpretation = `Moderate risk — 14-day adverse event risk ${riskAt14Days}`;
  } else {
    severity = 'danger';
    interpretation = `High risk — 14-day adverse event risk ${riskAt14Days}`;
  }

  return {
    score,
    riskAt14Days,
    interpretation,
    severity,
    references: [
      'Antman EM et al. JAMA. 2000;284(7):835-842',
      'TIMI Study Group — UA/NSTEMI Risk Score',
    ],
  };
}
