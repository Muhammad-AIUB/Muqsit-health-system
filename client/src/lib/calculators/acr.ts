interface AcrInput {
  albuminMgDl:    number;  // mg/dL
  creatinineGDl:  number;  // g/dL
}

export function calculateACR(input: AcrInput): {
  acr: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  category: string;
  references: string[];
} {
  const { albuminMgDl, creatinineGDl } = input;

  // ACR (mg/g) = Albumin (mg/dL) / Creatinine (g/dL)
  const acr = Math.round((albuminMgDl / creatinineGDl) * 10) / 10;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;
  let category: string;

  if (acr < 30) {
    severity = 'success';
    category = 'A1';
    interpretation = 'Normal to mildly increased';
  } else if (acr <= 300) {
    severity = 'warning';
    category = 'A2';
    interpretation = 'Moderately increased albuminuria ("microalbuminuria")';
  } else {
    severity = 'danger';
    category = 'A3';
    interpretation = 'Severely increased albuminuria ("macroalbuminuria")';
  }

  return {
    acr,
    interpretation,
    severity,
    category,
    references: [
      'KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of CKD',
      'Levey AS et al. AJKD. 2011',
    ],
  };
}
