// BODE Index for COPD Survival
// Celli BR, et al. N Engl J Med. 2004;350(10):1005-1012.

export function calculateBODE(score: number): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 2) {
    severity       = 'success';
    interpretation = `BODE ${score} — Q1; ~80% 4-year survival. Low mortality risk.`;
  } else if (score <= 4) {
    severity       = 'warning';
    interpretation = `BODE ${score} — Q2; ~67% 4-year survival. Moderate mortality risk.`;
  } else if (score <= 6) {
    severity       = 'danger';
    interpretation = `BODE ${score} — Q3; ~57% 4-year survival. High mortality risk.`;
  } else {
    severity       = 'danger';
    interpretation = `BODE ${score} — Q4; ~18% 4-year survival. Very high mortality risk.`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Celli BR, Cote CG, Marin JM, et al. The body-mass index, airflow obstruction, dyspnea, and exercise capacity index in chronic obstructive pulmonary disease. N Engl J Med. 2004;350(10):1005-1012.',
    ],
  };
}
