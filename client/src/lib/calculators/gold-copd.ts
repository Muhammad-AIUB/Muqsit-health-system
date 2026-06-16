// GOLD COPD Assessment (2024)
// Global Initiative for Chronic Obstructive Lung Disease (GOLD) 2024 Report.

export type GOLDGrade = 1 | 2 | 3 | 4;
export type GOLDGroup = 'A' | 'B' | 'E';

export interface GOLDInput {
  symptoms:       'lower' | 'higher'; // mMRC <2 / CAT <10  vs  mMRC ≥2 / CAT ≥10
  exacerbationIdx: 0 | 1 | 2 | 3;    // 0=none, 1=1 no admit, 2=≥1 admit, 3=≥2
  fev1Idx:         0 | 1 | 2 | 3;    // 0=≥80%, 1=50-79%, 2=30-49%, 3=<30%
}

const FEV1_LABELS  = ['≥80%', '50–79%', '30–49%', '<30%'];
const GRADE_NAMES  = ['1 (Mild)', '2 (Moderate)', '3 (Severe)', '4 (Very Severe)'];

export function calculateGOLD(input: GOLDInput): {
  grade:               GOLDGrade;
  gradeLabel:          string;
  gradeInterpretation: string;
  gradeSeverity:       'success' | 'warning' | 'danger';
  group:               GOLDGroup;
  groupLabel:          string;
  groupInterpretation: string;
  groupSeverity:       'success' | 'warning' | 'danger';
  references:          string[];
} {
  // ── GOLD Grade 1–4 (from FEV₁ % predicted) ───────────────────────────────
  const grade = (input.fev1Idx + 1) as GOLDGrade;
  const gradeLabel = `GOLD ${GRADE_NAMES[input.fev1Idx]}`;
  const gradeSeverity: 'success' | 'warning' | 'danger' =
    grade === 1 ? 'success' : grade === 2 ? 'warning' : 'danger';
  const gradeInterpretation =
    `GOLD Grade ${grade} — Post-bronchodilator FEV₁ ${FEV1_LABELS[input.fev1Idx]} predicted`;

  // ── GOLD Group A / B / E (from exacerbation history + symptoms) ──────────
  // High risk → E regardless of symptoms
  const highRisk = input.exacerbationIdx >= 2;
  const group: GOLDGroup = highRisk
    ? 'E'
    : input.symptoms === 'lower' ? 'A' : 'B';

  const GROUP_INTERP: Record<GOLDGroup, string> = {
    A: 'Group A — Low exacerbation risk, lower symptoms: short-acting bronchodilator as needed',
    B: 'Group B — Low exacerbation risk, higher symptoms: initiate long-acting bronchodilator (LABA or LAMA)',
    E: 'Group E — High exacerbation risk: LABA + LAMA; add ICS if blood eosinophils ≥300 cells/µL',
  };
  const GROUP_SEVERITY: Record<GOLDGroup, 'success' | 'warning' | 'danger'> = {
    A: 'success',
    B: 'warning',
    E: 'danger',
  };

  return {
    grade,
    gradeLabel,
    gradeInterpretation,
    gradeSeverity,
    group,
    groupLabel:          `Group ${group}`,
    groupInterpretation: GROUP_INTERP[group],
    groupSeverity:       GROUP_SEVERITY[group],
    references: [
      'Global Initiative for Chronic Obstructive Lung Disease (GOLD). Global Strategy for the Diagnosis, Management and Prevention of COPD. GOLD 2024 Report. goldcopd.org.',
    ],
  };
}
