interface UrrInput {
  upre: number;   // mg/dL
  upost: number;  // mg/dL
}

export function calculateURR(input: UrrInput): {
  urr: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { upre, upost } = input;

  const urr = Math.round(((upre - upost) / upre) * 100 * 10) / 10;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (urr >= 70) {
    severity = 'success';
    interpretation = 'Adequate dialysis (URR >= 70%)';
  } else if (urr >= 65) {
    severity = 'success';
    interpretation = 'Minimally adequate dialysis (URR >= 65%, KDOQI minimum target)';
  } else {
    severity = 'danger';
    interpretation = 'Inadequate dialysis (URR < 65%, below KDOQI minimum target)';
  }

  return {
    urr,
    interpretation,
    severity,
    references: [
      'NKF KDOQI Clinical Practice Guidelines for Hemodialysis Adequacy, 2015',
      'Owen WF et al. The urea reduction ratio and serum albumin as predictors of mortality. NEJM. 1993',
    ],
  };
}
