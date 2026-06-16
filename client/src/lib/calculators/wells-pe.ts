interface WellsPeInput {
  dvtSigns:        0 | 3;    // Clinical signs/symptoms of DVT
  pe1stDiagnosis:  0 | 3;    // PE is #1 diagnosis or equally likely
  heartRate100:    0 | 1.5;  // Heart rate > 100
  immobilization:  0 | 1.5;  // Immobilization >=3 days OR surgery in previous 4 weeks
  previousPeDvt:   0 | 1.5;  // Previous objectively diagnosed PE or DVT
  hemoptysis:      0 | 1;    // Hemoptysis
  malignancy:      0 | 1;    // Malignancy with treatment within 6 months or palliative
}

export function calculateWellsPE(input: WellsPeInput): {
  score: number;
  threeTier: string;
  twoTier: string;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const score =
    input.dvtSigns +
    input.pe1stDiagnosis +
    input.heartRate100 +
    input.immobilization +
    input.previousPeDvt +
    input.hemoptysis +
    input.malignancy;

  const roundedScore = Math.round(score * 10) / 10;

  // Three-tier model
  let threeTier: string;
  let severity: 'success' | 'warning' | 'danger';

  if (roundedScore <= 1) {
    threeTier = 'Low Risk';
    severity  = 'success';
  } else if (roundedScore <= 6) {
    threeTier = 'Moderate Risk';
    severity  = 'warning';
  } else {
    threeTier = 'High Risk';
    severity  = 'danger';
  }

  // Two-tier model
  const twoTier = roundedScore <= 4
    ? 'PE Unlikely — consider D-dimer testing'
    : 'PE Likely — consider CTPA';

  const interpretation =
    `Three-Tier: ${threeTier} | Two-Tier: ${roundedScore <= 4 ? 'PE Unlikely (D-dimer)' : 'PE Likely (CTPA)'}`;

  return {
    score: roundedScore,
    threeTier,
    twoTier,
    interpretation,
    severity,
    references: [
      'Wells PS et al. Thromb Haemost. 2000;83(3):416-420',
      'Wells PS et al. N Engl J Med. 2003;349(13):1227-1235',
    ],
  };
}
