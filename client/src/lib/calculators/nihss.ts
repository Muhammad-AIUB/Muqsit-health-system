// NIH Stroke Scale (NIHSS)
// Sum of scores across 15 neurological domains (1A, 1B, 1C, 2–11)
// Maximum score: 42

export function calculateNIHSS(totalScore: number): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (totalScore === 0) {
    severity       = 'success';
    interpretation = 'NIHSS 0 — No stroke symptoms';
  } else if (totalScore <= 4) {
    severity       = 'warning';
    interpretation = `NIHSS ${totalScore} — Minor stroke`;
  } else if (totalScore <= 15) {
    severity       = 'warning';
    interpretation = `NIHSS ${totalScore} — Moderate stroke`;
  } else if (totalScore <= 20) {
    severity       = 'danger';
    interpretation = `NIHSS ${totalScore} — Moderate to severe stroke`;
  } else {
    severity       = 'danger';
    interpretation = `NIHSS ${totalScore} — Severe stroke`;
  }

  return {
    score: totalScore,
    interpretation,
    severity,
    references: [
      'Brott T, Adams HP Jr, Olinger CP, et al. Measurements of acute cerebral infarction: a clinical examination scale. Stroke. 1989;20(7):864-870.',
      'Lyden P, Brott T, Tilley B, et al. Improved reliability of the NIH Stroke Scale using video training. NINDS TPA Stroke Study Group. Stroke. 1994;25(11):2220-2226.',
    ],
  };
}
