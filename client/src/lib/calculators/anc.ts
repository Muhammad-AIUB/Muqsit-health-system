// Absolute Neutrophil Count (ANC)
// Formula: ANC = 10 × WBC count (×10³/µL) × (% neutrophils + % bands)

interface AncInput {
  neutrophilsPct: number;  // %
  bandsPct:       number;  // %
  wbcCount:       number;  // × 10³ cells/µL  (= × 10⁹ cells/L — numerically identical)
}

export function calculateANC(input: AncInput): {
  anc:            number;   // cells/µL
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { neutrophilsPct, bandsPct, wbcCount } = input;

  // ANC (cells/µL) = 10 × WBC (×10³/µL) × (% PMNs + % bands)
  const anc = Math.round(10 * wbcCount * (neutrophilsPct + bandsPct));

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (anc >= 1500) {
    severity       = 'success';
    interpretation = `ANC ${anc.toLocaleString()} cells/µL — Normal. No significant increased risk.`;
  } else if (anc >= 1000) {
    severity       = 'warning';
    interpretation = `ANC ${anc.toLocaleString()} cells/µL — Mild neutropenia. Usually minimal risk.`;
  } else if (anc >= 500) {
    severity       = 'warning';
    interpretation = `ANC ${anc.toLocaleString()} cells/µL — Moderate neutropenia. Increased infection risk.`;
  } else if (anc >= 100) {
    severity       = 'danger';
    interpretation = `ANC ${anc.toLocaleString()} cells/µL — Severe neutropenia. High risk of serious infection.`;
  } else {
    severity       = 'danger';
    interpretation = `ANC ${anc.toLocaleString()} cells/µL — Profound neutropenia. Very high/life-threatening infection risk.`;
  }

  return {
    anc,
    interpretation,
    severity,
    references: [
      'Boxer LA. How to approach neutropenia. Hematology Am Soc Hematol Educ Program. 2012;2012:174-182',
    ],
  };
}
