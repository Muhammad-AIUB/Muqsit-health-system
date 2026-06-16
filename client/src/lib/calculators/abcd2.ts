// ABCD² Score for TIA stroke risk stratification

interface ABCD2Input {
  age60:    0 | 1;       // Age ≥60 years
  bp:       0 | 1;       // BP ≥140/90 mmHg
  clinical: 0 | 1 | 2;  // Clinical features: 0=other, 1=speech, 2=unilateral weakness
  duration: 0 | 1 | 2;  // Duration: 0=<10 min, 1=10-59 min, 2=≥60 min
  diabetes: 0 | 1;       // History of diabetes
}

export function calculateABCD2(input: ABCD2Input): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = input.age60 + input.bp + input.clinical + input.duration + input.diabetes;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 3) {
    severity       = 'success';
    interpretation = `ABCD² ${score} — Low Risk. 2-day stroke risk: 1.0%, 7-day: 1.2%, 90-day: 3.1%. Outpatient management usually appropriate.`;
  } else if (score <= 5) {
    severity       = 'warning';
    interpretation = `ABCD² ${score} — Moderate Risk. 2-day stroke risk: 4.1%, 7-day: 5.9%, 90-day: 9.8%. Hospital observation/admission justified in most situations.`;
  } else {
    severity       = 'danger';
    interpretation = `ABCD² ${score} — High Risk. 2-day stroke risk: 8.1%, 7-day: 11.7%, 90-day: 17.8%. Urgent hospitalization/specialist evaluation strongly recommended.`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Johnston SC, Rothwell PM, Nguyen-Huynh MN, et al. Validation and refinement of scores to predict very early stroke risk after transient ischaemic attack. Lancet. 2007;369(9558):283-292.',
    ],
  };
}
