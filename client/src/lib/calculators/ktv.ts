interface KtvInput {
  clearance: number;  // mL/min
  timeHours: number;  // hours
  weightKg: number;   // kg
}

export function calculateKtV(input: KtvInput): {
  ktv: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { clearance, timeHours, weightKg } = input;

  // V = total body water ~ 0.6 x weight (L) -> convert to mL
  const V = 0.6 * weightKg * 1000; // mL

  // K (mL/min) x t (min) / V (mL)
  const t = timeHours * 60; // minutes
  const ktv = Math.round((clearance * t) / V * 100) / 100;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (ktv >= 1.4) {
    severity = 'success';
    interpretation = 'Adequate dialysis (Kt/V >= 1.4)';
  } else if (ktv >= 1.2) {
    severity = 'success';
    interpretation = 'Minimally adequate dialysis (Kt/V >= 1.2, KDOQI minimum target)';
  } else {
    severity = 'danger';
    interpretation = 'Inadequate dialysis (Kt/V < 1.2, below KDOQI minimum target)';
  }

  return {
    ktv,
    interpretation,
    severity,
    references: [
      'NKF KDOQI Clinical Practice Guidelines for Hemodialysis Adequacy, 2015',
      'Daugirdas JT. Second generation logarithmic estimates of single-pool variable volume Kt/V. JASN. 1993',
    ],
  };
}
