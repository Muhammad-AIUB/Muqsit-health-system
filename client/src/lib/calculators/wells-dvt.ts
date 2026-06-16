// Wells' Criteria for DVT — Wells PS et al., Lancet 1997
// Score range: -2 to 9

interface WellsDvtInput {
  activeCancer:      0 | 1;
  bedridden:         0 | 1;
  calfSwelling:      0 | 1;
  collateralVeins:   0 | 1;
  entireLegSwollen:  0 | 1;
  localTenderness:   0 | 1;
  pittingEdema:      0 | 1;
  paralysis:         0 | 1;
  priorDvt:          0 | 1;
  altDiagnosis:      0 | -2;  // alternative diagnosis as likely → -2
}

export function calculateWellsDvt(input: WellsDvtInput): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const score =
    input.activeCancer +
    input.bedridden +
    input.calfSwelling +
    input.collateralVeins +
    input.entireLegSwollen +
    input.localTenderness +
    input.pittingEdema +
    input.paralysis +
    input.priorDvt +
    input.altDiagnosis;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 0) {
    severity       = 'success';
    interpretation = `Low probability (Score ${score} ≤ 0) — DVT unlikely; consider D-dimer to exclude`;
  } else if (score <= 2) {
    severity       = 'warning';
    interpretation = `Moderate probability (Score ${score}: 1–2) — further evaluation with ultrasound recommended`;
  } else {
    severity       = 'danger';
    interpretation = `High probability (Score ${score} ≥ 3) — DVT likely; ultrasound and/or anticoagulation evaluation`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Wells PS et al. Value of assessment of pretest probability of deep-vein thrombosis in clinical management. Lancet. 1997;350(9094):1795-1798',
      'Wells PS et al. Evaluation of D-dimer in the diagnosis of suspected deep-vein thrombosis. N Engl J Med. 2003;349(13):1227-1235',
    ],
  };
}
