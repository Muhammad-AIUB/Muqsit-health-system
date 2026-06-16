// Montreal Cognitive Assessment (MoCA)
// Nasreddine ZS, et al. J Am Geriatr Soc. 2005;53(4):695-699.

export function calculateMoCA(score: number): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score >= 26) {
    severity       = 'success';
    interpretation = `MoCA ${score}/30 — Normal cognition`;
  } else if (score >= 18) {
    severity       = 'warning';
    interpretation = `MoCA ${score}/30 — Mild cognitive impairment`;
  } else if (score >= 10) {
    severity       = 'danger';
    interpretation = `MoCA ${score}/30 — Moderate cognitive impairment`;
  } else {
    severity       = 'danger';
    interpretation = `MoCA ${score}/30 — Severe cognitive impairment`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Nasreddine ZS, Phillips NA, Bédirian V, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. J Am Geriatr Soc. 2005;53(4):695-699.',
    ],
  };
}
