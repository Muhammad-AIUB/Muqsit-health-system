// Expanded Disability Status Scale (EDSS) for Multiple Sclerosis
// Combines Ambulation score (4.0–10.0) with Functional Systems Scale (FSS, 0–3.5)

export interface FSSScores {
  pyramidal:    number;  // 0–6
  cerebellar:   number;  // 0–5
  brainstem:    number;  // 0–5
  sensory:      number;  // 0–6
  bowelBladder: number;  // 0–6
  visual:       number;  // 0–6
  cerebral:     number;  // 0–5
  other:        number;  // 0–1
}

/** Derive EDSS 0–4.0 from FSS grades when patient is fully ambulatory (Kurtzke step definitions) */
function fssToEdss(fss: FSSScores): number {
  const scores = [
    fss.pyramidal, fss.cerebellar, fss.brainstem,
    fss.sensory, fss.bowelBladder, fss.visual,
    fss.cerebral, fss.other,
  ];
  const maxScore = Math.max(...scores);
  const count1   = scores.filter(s => s === 1).length;  // exactly grade 1
  const count2   = scores.filter(s => s === 2).length;  // exactly grade 2
  const count3   = scores.filter(s => s === 3).length;  // exactly grade 3

  if (maxScore === 0) return 0;

  // Max FS grade 1
  if (maxScore === 1) return count1 === 1 ? 1.0 : 1.5;   // one → 1.0; ≥2 → 1.5

  // Max FS grade 2
  if (maxScore === 2) {
    if (count2 === 1) return 2.0;       // one FS grade 2
    if (count2 === 2) return 2.5;       // two FS grade 2
    if (count2 <= 4) return 3.0;        // three–four FS grade 2
    return 3.5;                         // five+ FS grade 2
  }

  // Max FS grade 3
  if (maxScore === 3) {
    if (count3 === 1 && count2 === 0) return 3.0;   // one FS grade 3 alone
    return 3.5;                                     // one grade 3 + grade 2s, or two grade 3
  }

  // Max FS grade ≥4 while still fully ambulatory → EDSS 4.0
  return 4.0;
}

export function calculateEDSS(input: { ambulation: number; fss: FSSScores }): {
  score:          number;
  fssTotal:       number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { ambulation, fss } = input;
  const fssValues = Object.values(fss) as number[];
  const fssTotal  = fssValues.reduce((a, b) => a + b, 0);

  // EDSS is the higher of the ambulation-derived score and the FSS-derived score,
  // so FSS impairment is never discarded when an ambulation grade is also set.
  const score = Math.max(ambulation || 0, fssToEdss(fss));

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score === 0) {
    severity = 'success';
    interpretation = 'EDSS 0 — Normal neurological exam';
  } else if (score <= 1.5) {
    severity = 'success';
    interpretation = `EDSS ${score} — No disability, minimal signs`;
  } else if (score <= 3.5) {
    severity = 'warning';
    interpretation = `EDSS ${score} — Mild-moderate disability; fully ambulatory`;
  } else if (score <= 5.5) {
    severity = 'warning';
    interpretation = `EDSS ${score} — Moderate disability; ambulatory without aid`;
  } else if (score <= 7.5) {
    severity = 'danger';
    interpretation = `EDSS ${score} — Severe disability; requires assistance to walk or wheelchair`;
  } else {
    severity = 'danger';
    interpretation = `EDSS ${score} — Very severe disability; restricted to bed/chair`;
  }

  return {
    score,
    fssTotal,
    interpretation,
    severity,
    references: [
      'Kurtzke JF. Rating neurologic impairment in multiple sclerosis: an expanded disability status scale (EDSS). Neurology. 1983;33(11):1444-1452.',
    ],
  };
}
