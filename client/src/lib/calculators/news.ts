// National Early Warning Score (NEWS) — aggregate physiological score for
// detecting acute clinical deterioration. Each parameter contributes 0–3 points.

export interface NEWSInput {
  respiratory: number;     // points (0–3)
  spo2: number;            // points (0–3)
  supplementalO2: number;  // points (0 or 2)
  temperature: number;     // points (0–3)
  systolicBP: number;      // points (0–3)
  heartRate: number;       // points (0–3)
  consciousness: number;   // points (0 or 3)
}

export function calculateNEWS(input: NEWSInput): {
  score: number;
  redFlag: boolean;
  severity: 'success' | 'warning' | 'danger';
  label: string;
  interpretation: string;
  references: string[];
} {
  const points = [
    input.respiratory,
    input.spo2,
    input.supplementalO2,
    input.temperature,
    input.systolicBP,
    input.heartRate,
    input.consciousness,
  ];
  const score = points.reduce((a, b) => a + b, 0);
  // A "RED" score = an extreme value (3 points) in any single parameter.
  const redFlag = points.some((p) => p >= 3);

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (score >= 7) {
    severity = 'danger';
    interpretation =
      `NEWS ${score} — High risk. Emergency assessment by a clinical/critical-care team ` +
      `with critical-care competencies; usually requires transfer to a higher-dependency care area.`;
  } else if (score >= 5 || redFlag) {
    severity = 'warning';
    interpretation =
      `NEWS ${score}${redFlag && score < 5 ? ' (RED score — a single parameter scoring 3)' : ''} — ` +
      `Medium risk. Urgent review by a clinician skilled in acute illness (ward-based doctor or acute team nurse) ` +
      `to decide whether escalation to a critical-care team is required.`;
  } else if (score >= 1) {
    severity = 'success';
    interpretation =
      `NEWS ${score} — Low risk. Assessment by a competent registered nurse who decides on the ` +
      `frequency of monitoring or whether escalation of care is needed.`;
  } else {
    severity = 'success';
    interpretation = `NEWS 0 — Low risk. Continue routine monitoring.`;
  }

  return {
    score,
    redFlag,
    severity,
    label: `${score} points`,
    interpretation,
    references: [
      'Royal College of Physicians. National Early Warning Score (NEWS): Standardising the assessment of acute illness severity in the NHS. London: RCP, 2012.',
    ],
  };
}
