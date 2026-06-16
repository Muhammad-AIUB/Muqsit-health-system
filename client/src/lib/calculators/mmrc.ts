// mMRC Dyspnea Scale (Modified Medical Research Council)
// Bestall JC, et al. Thorax. 1999;54(7):581-586.

export function calculateMMRC(grade: number): {
  grade:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (grade === 0) {
    severity       = 'success';
    interpretation = 'mMRC Grade 0 — Dyspnea only with strenuous exercise';
  } else if (grade === 1) {
    severity       = 'success';
    interpretation = 'mMRC Grade 1 — Dyspnea when hurrying or walking up a slight hill';
  } else if (grade === 2) {
    severity       = 'warning';
    interpretation = 'mMRC Grade 2 — Walks slower than peers or stops for breath at own pace';
  } else if (grade === 3) {
    severity       = 'danger';
    interpretation = 'mMRC Grade 3 — Stops for breath after ~100 yards or a few minutes';
  } else {
    severity       = 'danger';
    interpretation = 'mMRC Grade 4 — Too dyspneic to leave house or breathless when dressing';
  }

  return {
    grade,
    interpretation,
    severity,
    references: [
      'Bestall JC, Paul EA, Garrod R, Garnham R, Jones PW, Wedzicha JA. Usefulness of the Medical Research Council (MRC) dyspnoea scale as a measure of disability in patients with chronic obstructive pulmonary disease. Thorax. 1999;54(7):581-586.',
    ],
  };
}
