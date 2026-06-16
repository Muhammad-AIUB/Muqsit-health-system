// CLL-IPI — International Prognostic Index for CLL
// International CLL-IPI working group, Lancet Oncology 2016

interface CllIpiInput {
  age:           0 | 1;   // ≤65 → 0, >65 → +1
  clinicalStage: 0 | 1;   // Binet A / Rai 0 → 0; Binet B-C / Rai I-IV → +1
  b2m:           0 | 2;   // ≤3.5 mg/L → 0; >3.5 → +2
  ighv:          0 | 2;   // Mutated → 0; Unmutated → +2
  tp53:          0 | 4;   // No abnormalities → 0; del17p/TP53 mutation → +4
}

export function calculateCllIpi(input: CllIpiInput): {
  score:          number;
  riskGroup:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = input.age + input.clinicalStage + input.b2m + input.ighv + input.tp53;

  let riskGroup: string;
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 1) {
    riskGroup      = 'Low Risk';
    severity       = 'success';
    interpretation = `Low Risk (CLL-IPI ${score} — 0–1): estimated 5-year OS ~93.2%`;
  } else if (score <= 3) {
    riskGroup      = 'Intermediate Risk';
    severity       = 'warning';
    interpretation = `Intermediate Risk (CLL-IPI ${score} — 2–3): estimated 5-year OS ~79.4%`;
  } else if (score <= 6) {
    riskGroup      = 'High Risk';
    severity       = 'danger';
    interpretation = `High Risk (CLL-IPI ${score} — 4–6): estimated 5-year OS ~63.6%`;
  } else {
    riskGroup      = 'Very High Risk';
    severity       = 'danger';
    interpretation = `Very High Risk (CLL-IPI ${score} — 7–10): estimated 5-year OS ~23.3%`;
  }

  return {
    score,
    riskGroup,
    interpretation,
    severity,
    references: [
      'International CLL-IPI working group. An international prognostic index for patients with chronic lymphocytic leukaemia (CLL-IPI): a meta-analysis of individual patient data. Lancet Oncol. 2016;17(6):779-790',
    ],
  };
}
