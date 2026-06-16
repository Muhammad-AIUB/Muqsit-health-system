// Original IPSS — International Prognostic Scoring System for MDS
// Greenberg P et al., Blood 1997

type Karyotype  = 0 | 0.5 | 1;
type Blasts     = 0 | 0.5 | 1.5 | 2;
type Cytopenias = 0 | 0.5;

interface IpssInput {
  karyotype:  Karyotype;
  blasts:     Blasts;
  cytopenias: Cytopenias;
}

export function calculateIPSS(input: IpssInput): {
  score:          number;
  riskGroup:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = Math.round((input.karyotype + input.blasts + input.cytopenias) * 10) / 10;

  let riskGroup: string;
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score === 0) {
    riskGroup      = 'Low';
    severity       = 'success';
    interpretation = `Low Risk (IPSS ${score} = 0) — median OS ~5.7 years; AML transformation ~9.4 years`;
  } else if (score <= 1.0) {
    riskGroup      = 'INT-1';
    severity       = 'warning';
    interpretation = `Intermediate-1 Risk (IPSS ${score}: 0.5–1.0) — median OS ~3.5 years; AML transformation ~3.3 years`;
  } else if (score <= 2.0) {
    riskGroup      = 'INT-2';
    severity       = 'danger';
    interpretation = `Intermediate-2 Risk (IPSS ${score}: 1.5–2.0) — median OS ~1.2 years; AML transformation ~1.1 years`;
  } else {
    riskGroup      = 'High';
    severity       = 'danger';
    interpretation = `High Risk (IPSS ${score} ≥ 2.5) — median OS ~0.4 years; AML transformation ~0.2 years`;
  }

  return {
    score,
    riskGroup,
    interpretation,
    severity,
    references: [
      'Greenberg P et al. International scoring system for evaluating prognosis in myelodysplastic syndromes. Blood. 1997;89(6):2079-2088',
    ],
  };
}
