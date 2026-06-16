interface Cha2ds2VascInput {
  age:          0 | 1 | 2;  // <65=0, 65-74=1, >=75=2
  sex:          0 | 1;      // male=0, female=+1
  chf:          0 | 1;
  hypertension: 0 | 1;
  stroke:       0 | 2;      // stroke/TIA/thromboembolism
  vascular:     0 | 1;
  diabetes:     0 | 1;
}

// Approximate annual stroke risk % by score (Lip GY et al., 2010)
const ANNUAL_RISK: Record<number, string> = {
  0: '~0%',
  1: '~1.3%',
  2: '~2.2%',
  3: '~3.2%',
  4: '~4.0%',
  5: '~6.7%',
  6: '~9.8%',
  7: '~9.6%',
  8: '~12.5%',
  9: '~15.2%',
};

export function calculateCha2ds2Vasc(input: Cha2ds2VascInput): {
  score: number;
  annualRisk: string;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { age, sex, chf, hypertension, stroke, vascular, diabetes } = input;
  const score = age + sex + chf + hypertension + stroke + vascular + diabetes;

  const annualRisk = ANNUAL_RISK[score] ?? '';

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (score === 0) {
    severity = 'success';
    interpretation = `Low risk (annual stroke risk ${annualRisk}) — anticoagulation not recommended`;
  } else if (score === 1) {
    severity = 'warning';
    interpretation = `Low-moderate risk (annual stroke risk ${annualRisk}) — consider anticoagulation`;
  } else {
    severity = 'danger';
    interpretation = `High risk (annual stroke risk ${annualRisk}) — anticoagulation recommended`;
  }

  return {
    score,
    annualRisk,
    interpretation,
    severity,
    references: [
      'Lip GY et al. Chest. 2010;137(2):263-272',
      'January CT et al. AHA/ACC/HRS AF Guideline. JACC. 2014',
    ],
  };
}
