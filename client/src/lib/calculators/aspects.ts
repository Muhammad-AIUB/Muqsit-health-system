// ASPECTS Score — Alberta Stroke Program Early CT Score
// Starts at 10; subtract 1 for each region with early ischemic change

export interface ASPECTSInput {
  // Subcortical structures (−1 each)
  caudate:         0 | -1;   // C
  internalCapsule: 0 | -1;   // IC
  lentiform:       0 | -1;   // L
  // MCA Cortex (−1 each)
  insularRibbon:   0 | -1;   // I
  m1:              0 | -1;   // Anterior MCA cortex
  m2:              0 | -1;   // MCA cortex lateral to insular ribbon
  m3:              0 | -1;   // Posterior MCA cortex
  m4:              0 | -1;   // Anterior cortex rostral to M1
  m5:              0 | -1;   // Lateral cortex rostral to M3
  m6:              0 | -1;   // Posterior cortex rostral to M3
}

export function calculateASPECTS(input: ASPECTSInput): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = 10 + Object.values(input).reduce((a, b) => a + b, 0);

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score === 10) {
    severity       = 'success';
    interpretation = 'ASPECTS 10 — No ischemic change. Normal CT.';
  } else if (score >= 8) {
    severity       = 'warning';
    interpretation = `ASPECTS ${score} — Small infarct core. Good prognosis; favorable for reperfusion.`;
  } else if (score >= 6) {
    severity       = 'danger';
    interpretation = `ASPECTS ${score} — Moderate infarct size. Possible thrombectomy/thrombolysis candidate.`;
  } else if (score >= 1) {
    severity       = 'danger';
    interpretation = `ASPECTS ${score} — Large infarct core. Higher risk of poor outcome and hemorrhagic transformation.`;
  } else {
    severity       = 'danger';
    interpretation = 'ASPECTS 0 — Diffuse MCA infarction. Very severe stroke.';
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Barber PA, Demchuk AM, Zhang J, Buchan AM. Validity and reliability of a quantitative computed tomography score in predicting outcome of hyperacute stroke before thrombolytic therapy. ASPECTS Study Group. Lancet. 2000;355(9216):1670-1674.',
    ],
  };
}
