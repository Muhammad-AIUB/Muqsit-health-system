// Montreal Cognitive Assessment (MoCA)
// Nasreddine ZS, et al. J Am Geriatr Soc. 2005;53(4):695-699.

// `raw` is the 30-point subtotal. Per Nasreddine 2005, add 1 point (capped at
// 30) for subjects with ≤12 years of formal education to correct education bias.
export function calculateMoCA(raw: number, educationLE12 = false): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  // Guard against impossible entries (a MoCA total is bounded 0-30).
  if (!Number.isFinite(raw) || raw < 0 || raw > 30) {
    return {
      score: raw,
      interpretation: `MoCA ${raw} — out of range (score must be 0–30)`,
      severity: 'warning',
      references: [
        'Nasreddine ZS, Phillips NA, Bédirian V, et al. The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment. J Am Geriatr Soc. 2005;53(4):695-699.',
      ],
    };
  }

  const score = Math.min(30, raw + (educationLE12 && raw < 30 ? 1 : 0));

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
