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

  // NOTE: this is a crude mechanistic K·t/V from nominal dialyzer clearance and
  // a fixed V = 0.6·weight. It ignores urea generation, ultrafiltration and
  // post-dialysis rebound, so it OVER-READS relative to the urea-based
  // (Daugirdas) single-pool Kt/V — treat the thresholds as an optimistic bound.
  const caveat = ' — crude clearance-based estimate; overreads vs urea-based (Daugirdas) Kt/V';

  if (ktv >= 1.4) {
    severity = 'success';
    interpretation = 'Adequate dialysis (Kt/V >= 1.4)' + caveat;
  } else if (ktv >= 1.2) {
    severity = 'warning';
    interpretation = 'Minimally adequate dialysis (Kt/V >= 1.2, KDOQI minimum target)' + caveat;
  } else {
    severity = 'danger';
    interpretation = 'Inadequate dialysis (Kt/V < 1.2, below KDOQI minimum target)' + caveat;
  }

  return {
    ktv,
    interpretation,
    severity,
    references: [
      'NKF KDOQI Clinical Practice Guidelines for Hemodialysis Adequacy, 2015',
    ],
  };
}
