// Left Ventricular Ejection Fraction (LVEF)
// Standard volumetric formula: EF (%) = (EDV − ESV) / EDV × 100
// Stroke Volume (SV) = EDV − ESV
// HF classification cutoffs per 2022 AHA/ACC/HFSA & 2021 ESC HF guidelines

interface EFInput {
  edv: number;  // End-diastolic volume (mL)
  esv: number;  // End-systolic volume (mL)
}

export function calculateEjectionFraction(input: EFInput): {
  ef:             number;   // %
  strokeVolume:   number;   // mL
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { edv, esv } = input;

  const strokeVolume = Math.round((edv - esv) * 10) / 10;
  const ef = Math.round(((edv - esv) / edv) * 100 * 10) / 10;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (ef >= 50) {
    severity       = 'success';
    interpretation = `LVEF ${ef}% — Preserved (normal ≥50%; HFpEF if heart failure present)`;
  } else if (ef >= 41) {
    severity       = 'warning';
    interpretation = `LVEF ${ef}% — Mildly reduced (41–49%; HFmrEF)`;
  } else if (ef >= 30) {
    severity       = 'danger';
    interpretation = `LVEF ${ef}% — Reduced (≤40%; HFrEF)`;
  } else {
    severity       = 'danger';
    interpretation = `LVEF ${ef}% — Severely reduced (<30%)`;
  }

  return {
    ef,
    strokeVolume,
    interpretation,
    severity,
    references: [
      'Lang RM, et al. Recommendations for Cardiac Chamber Quantification by Echocardiography in Adults. J Am Soc Echocardiogr. 2015;28(1):1-39.',
      'Heidenreich PA, et al. 2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure. Circulation. 2022;145(18):e895-e1032.',
    ],
  };
}
