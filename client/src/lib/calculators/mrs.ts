// Modified Rankin Scale (mRS)
// Measures degree of disability or dependence after stroke

export function calculateMRS(score: number): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const descriptions: Record<number, string> = {
    0: 'No symptoms at all',
    1: 'No significant disability despite symptoms',
    2: 'Slight disability',
    3: 'Moderate disability',
    4: 'Moderately severe disability',
    5: 'Severe disability',
    6: 'Dead',
  };

  let severity: 'success' | 'warning' | 'danger';
  if (score <= 1)       severity = 'success';
  else if (score <= 3)  severity = 'warning';
  else                  severity = 'danger';

  return {
    score,
    interpretation: `mRS ${score} — ${descriptions[score]}`,
    severity,
    references: [
      'Rankin J. Cerebral vascular accidents in patients over the age of 60. Scott Med J. 1957;2(5):200-215.',
      'van Swieten JC, Koudstaal PJ, Visser MC, Schouten HJ, van Gijn J. Interobserver agreement for the assessment of handicap in stroke patients. Stroke. 1988;19(5):604-607.',
    ],
  };
}
