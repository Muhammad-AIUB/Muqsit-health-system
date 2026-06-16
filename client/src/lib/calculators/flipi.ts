// FLIPI — Follicular Lymphoma International Prognostic Index
// Solal-Céligny P et al., Blood 2004

interface FlipIInput {
  age60:       0 | 1;  // Age >60 years
  nodalSites:  0 | 1;  // >4 nodal sites
  ldhElevated: 0 | 1;  // LDH above normal
  hemoglobin:  0 | 1;  // Hgb <120 g/L (12 g/dL)
  stageIIIIV:  0 | 1;  // Ann Arbor Stage III or IV
}

export function calculateFLIPI(input: FlipIInput): {
  score:          number;
  riskGroup:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score =
    input.age60 +
    input.nodalSites +
    input.ldhElevated +
    input.hemoglobin +
    input.stageIIIIV;

  let riskGroup: string;
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 1) {
    riskGroup      = 'Low Risk';
    severity       = 'success';
    interpretation = `Low Risk (FLIPI ${score} — 0–1): estimated 10-year OS ~71%`;
  } else if (score === 2) {
    riskGroup      = 'Intermediate Risk';
    severity       = 'warning';
    interpretation = `Intermediate Risk (FLIPI ${score} — 2): estimated 10-year OS ~51%`;
  } else {
    riskGroup      = 'High Risk';
    severity       = 'danger';
    interpretation = `High Risk (FLIPI ${score} — 3–5): estimated 10-year OS ~36%`;
  }

  return {
    score,
    riskGroup,
    interpretation,
    severity,
    references: [
      'Solal-Céligny P et al. Follicular Lymphoma International Prognostic Index. Blood. 2004;104(5):1258-1265',
    ],
  };
}
