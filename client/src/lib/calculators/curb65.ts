// CURB-65 Score for Pneumonia Severity
// Lim WS, et al. Thorax. 2003;58(5):377-382.

export interface CURB65Input {
  confusion: 0 | 1;   // new-onset disorientation
  bun:       0 | 1;   // BUN >19 mg/dL (>7 mmol/L urea)
  rr:        0 | 1;   // respiratory rate ≥30
  bp:        0 | 1;   // SBP <90 or DBP ≤60 mmHg
  age65:     0 | 1;   // age ≥65
}

export function calculateCURB65(input: CURB65Input): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = input.confusion + input.bun + input.rr + input.bp + input.age65;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 1) {
    severity       = 'success';
    interpretation = `CURB-65 ${score} — Low risk; consider outpatient treatment (~${score === 0 ? '0.6' : '2.7'}% 30-day mortality)`;
  } else if (score === 2) {
    severity       = 'warning';
    interpretation = `CURB-65 2 — Moderate risk; consider short hospitalization or supervised outpatient (~6.8% 30-day mortality)`;
  } else if (score === 3) {
    severity       = 'danger';
    interpretation = `CURB-65 3 — High risk; hospitalize (~14% 30-day mortality)`;
  } else {
    severity       = 'danger';
    interpretation = `CURB-65 ${score} — Very high risk; hospitalize, consider ICU (~${score === 4 ? '27.8' : '27.8+'}% 30-day mortality)`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Lim WS, van der Eerden MM, Laing R, et al. Defining community acquired pneumonia severity on presentation to hospital: an international derivation and validation study. Thorax. 2003;58(5):377-382.',
    ],
  };
}
