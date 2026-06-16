// IPSS-R — Revised International Prognostic Scoring System for MDS
// Greenberg PL et al., Blood 2012

type Cytogenetics = 0 | 1 | 2 | 3 | 4;
type Blasts       = 0 | 1 | 2 | 3;
type Hemoglobin   = 0 | 1 | 1.5;
type Platelets    = 0 | 0.5 | 1;
type Anc          = 0 | 0.5;

interface IpssRInput {
  cytogenetics: Cytogenetics;
  blasts:       Blasts;
  hemoglobin:   Hemoglobin;
  platelets:    Platelets;
  anc:          Anc;
}

export function calculateIpssR(input: IpssRInput): {
  score:          number;
  riskGroup:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score =
    input.cytogenetics +
    input.blasts +
    input.hemoglobin +
    input.platelets +
    input.anc;

  const s = Math.round(score * 10) / 10;

  let riskGroup: string;
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (s <= 1.5) {
    riskGroup      = 'Very Low';
    severity       = 'success';
    interpretation = `Very Low Risk (IPSS-R ${s} ≤ 1.5) — median OS ~8.8 years`;
  } else if (s <= 3) {
    riskGroup      = 'Low';
    severity       = 'success';
    interpretation = `Low Risk (IPSS-R ${s}: 1.5–3) — median OS ~5.3 years`;
  } else if (s <= 4.5) {
    riskGroup      = 'Intermediate';
    severity       = 'warning';
    interpretation = `Intermediate Risk (IPSS-R ${s}: 3–4.5) — median OS ~3.0 years`;
  } else if (s <= 6) {
    riskGroup      = 'High';
    severity       = 'danger';
    interpretation = `High Risk (IPSS-R ${s}: 4.5–6) — median OS ~1.6 years`;
  } else {
    riskGroup      = 'Very High';
    severity       = 'danger';
    interpretation = `Very High Risk (IPSS-R ${s} > 6) — median OS ~0.8 years`;
  }

  return {
    score: s,
    riskGroup,
    interpretation,
    severity,
    references: [
      'Greenberg PL et al. Revised international prognostic scoring system for myelodysplastic syndromes. Blood. 2012;120(12):2454-2465',
    ],
  };
}
