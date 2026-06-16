// Intracerebral Hemorrhage (ICH) Score
// Predicts 30-day mortality after intracerebral hemorrhage

interface ICHInput {
  gcs:           0 | 1 | 2;  // GCS: 13-15=0, 5-12=1, 3-4=2
  age80:         0 | 1;       // Age ≥80
  ichVolume:     0 | 1;       // ICH volume ≥30 mL
  ivh:           0 | 1;       // Intraventricular hemorrhage
  infratentorial: 0 | 1;      // Infratentorial origin of hemorrhage
}

const MORTALITY: Record<number, string> = {
  0: '0%',
  1: '13%',
  2: '26%',
  3: '72%',
  4: '97%',
  5: '100%',
  6: '100%',
};

export function calculateICH(input: ICHInput): {
  score:          number;
  mortality:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score = input.gcs + input.age80 + input.ichVolume + input.ivh + input.infratentorial;
  const mortality = MORTALITY[score] ?? '100%';

  let severity: 'success' | 'warning' | 'danger';
  if (score === 0)      severity = 'success';
  else if (score <= 2)  severity = 'warning';
  else                  severity = 'danger';

  const interpretation = `ICH Score ${score} — 30-day mortality ${mortality}`;

  return {
    score,
    mortality,
    interpretation,
    severity,
    references: [
      'Hemphill JC 3rd, Bonovich DC, Besmertis L, Manley GT, Johnston SC. The ICH score: a simple, reliable grading scale for intracerebral hemorrhage. Stroke. 2001;32(4):891-897.',
    ],
  };
}
