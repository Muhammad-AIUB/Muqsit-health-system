// STOP-BANG Score for Obstructive Sleep Apnea
// Chung F, et al. Anesthesiology. 2008;108(5):812-821.

export interface StopBangInput {
  snore:   0 | 1;   // S — loud snoring
  tired:   0 | 1;   // T — tired / fatigued / sleepy daytime
  observed: 0 | 1;  // O — observed stop breathing
  pressure: 0 | 1;  // P — high blood pressure
  bmi:     0 | 1;   // B — BMI >35 kg/m²
  age:     0 | 1;   // A — age >50 years
  neck:    0 | 1;   // N — neck circumference >40 cm
  gender:  0 | 1;   // G — gender male
}

export function calculateStopBang(input: StopBangInput): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score =
    input.snore + input.tired + input.observed + input.pressure +
    input.bmi + input.age + input.neck + input.gender;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 2) {
    severity       = 'success';
    interpretation = `STOP-BANG ${score} — Low risk of moderate-to-severe OSA`;
  } else if (score <= 4) {
    severity       = 'warning';
    interpretation = `STOP-BANG ${score} — Moderate risk of moderate-to-severe OSA`;
  } else {
    severity       = 'danger';
    interpretation = `STOP-BANG ${score} — High risk of moderate-to-severe OSA`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Chung F, Yegneswaran B, Liao P, et al. STOP questionnaire: a tool to screen patients for obstructive sleep apnea. Anesthesiology. 2008;108(5):812-821.',
    ],
  };
}
