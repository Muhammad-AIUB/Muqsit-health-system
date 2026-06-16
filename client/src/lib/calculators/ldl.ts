// Friedewald equation
// LDL (mg/dL) = TC (mg/dL) - HDL (mg/dL) - TG (mg/dL) / 5
// Not valid when TG > 400 mg/dL

// Conversion factors
// Cholesterol (TC, HDL, LDL): 1 mmol/L = 38.67 mg/dL
// Triglycerides:               1 mmol/L = 88.57 mg/dL

interface LdlInput {
  tcMgDl:  number;  // total cholesterol mg/dL
  hdlMgDl: number;  // HDL mg/dL
  tgMgDl:  number;  // triglycerides mg/dL
}

export function calculateLDL(input: LdlInput): {
  ldlMgDl:  number;
  ldlMmol:  number;
  warning?: string;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { tcMgDl, hdlMgDl, tgMgDl } = input;

  const ldlMgDl = Math.round((tcMgDl - hdlMgDl - tgMgDl / 5) * 10) / 10;
  const ldlMmol = Math.round((ldlMgDl / 38.67) * 100) / 100;

  const warning = tgMgDl > 400
    ? 'Friedewald equation is not reliable when triglycerides > 400 mg/dL'
    : undefined;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (ldlMgDl < 100) {
    severity = 'success';
    interpretation = ldlMgDl < 70
      ? 'Optimal LDL (< 70 mg/dL) — target for very high-risk patients'
      : 'Optimal LDL (< 100 mg/dL)';
  } else if (ldlMgDl < 130) {
    severity = 'success';
    interpretation = 'Near optimal LDL (100–129 mg/dL)';
  } else if (ldlMgDl < 160) {
    severity = 'warning';
    interpretation = 'Borderline high LDL (130–159 mg/dL)';
  } else if (ldlMgDl < 190) {
    severity = 'warning';
    interpretation = 'High LDL (160–189 mg/dL)';
  } else {
    severity = 'danger';
    interpretation = 'Very high LDL (>= 190 mg/dL)';
  }

  return {
    ldlMgDl,
    ldlMmol,
    warning,
    interpretation,
    severity,
    references: [
      'Friedewald WT et al. Clin Chem. 1972;18(6):499-502',
      'ACC/AHA Blood Cholesterol Guideline, 2018',
    ],
  };
}
