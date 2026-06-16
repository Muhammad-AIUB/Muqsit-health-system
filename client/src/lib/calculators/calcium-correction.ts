// Corrected Calcium for Hypoalbuminaemia
// Formula: Corrected Ca (mg/dL) = (0.8 × (Normal Albumin − Patient Albumin)) + Serum Ca
// Note: formula uses albumin in g/dL and calcium in mg/dL

interface CalciumCorrectionInput {
  calciumMgDl:      number;  // mg/dL
  albuminGdl:       number;  // g/dL  (patient)
  normalAlbuminGdl: number;  // g/dL  (reference — typically 4 g/dL)
}

export function calculateCalciumCorrection(input: CalciumCorrectionInput): {
  correctedCaMgDl:  number;
  correctedCaMmolL: number;
  interpretation:   string;
  severity:         'success' | 'warning' | 'danger';
  references:       string[];
} {
  const { calciumMgDl, albuminGdl, normalAlbuminGdl } = input;

  const correctedCaMgDl  = Math.round((0.8 * (normalAlbuminGdl - albuminGdl) + calciumMgDl) * 100) / 100;
  const correctedCaMmolL = Math.round((correctedCaMgDl / 4.0) * 100) / 100;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (correctedCaMgDl < 8.5) {
    severity       = 'danger';
    interpretation = `Hypocalcaemia — Corrected Ca ${correctedCaMgDl} mg/dL (${correctedCaMmolL} mmol/L) < 8.5 mg/dL`;
  } else if (correctedCaMgDl <= 10.5) {
    severity       = 'success';
    interpretation = `Normal — Corrected Ca ${correctedCaMgDl} mg/dL (${correctedCaMmolL} mmol/L) within 8.5–10.5 mg/dL`;
  } else {
    severity       = 'danger';
    interpretation = `Hypercalcaemia — Corrected Ca ${correctedCaMgDl} mg/dL (${correctedCaMmolL} mmol/L) > 10.5 mg/dL`;
  }

  return {
    correctedCaMgDl,
    correctedCaMmolL,
    interpretation,
    severity,
    references: [
      'Payne RB et al. Interpretation of serum calcium in patients with abnormal serum proteins. BMJ. 1973;4(5893):643-644',
    ],
  };
}
