// Corrected Reticulocyte Percentage, Absolute Reticulocyte Count & RPI

interface CorrectedReticulocyteInput {
  reticulocytePct: number;  // %
  rbcCount:        number;  // × 10⁶ cells/µL  (= × 10¹² cells/L — numerically identical)
  measuredHct:     number;  // %
  normalHct:       number;  // %
}

function maturationFactor(measuredHct: number): number {
  if (measuredHct >= 35) return 1.0;
  if (measuredHct >= 25) return 1.5;
  if (measuredHct >= 20) return 2.0;
  return 2.5;
}

export function calculateCorrectedReticulocyte(input: CorrectedReticulocyteInput): {
  correctedRetic: number;   // %
  arc:            number;   // cells/µL
  rpi:            number;
  matFactor:      number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { reticulocytePct, rbcCount, measuredHct, normalHct } = input;

  // Absolute reticulocyte count (cells/µL) = (retic% / 100) × RBC (cells/µL)
  // RBC input is in × 10⁶ cells/µL, so actual = rbcCount × 10⁶
  const arc = Math.round((reticulocytePct / 100) * rbcCount * 1e6);

  // Corrected reticulocyte %
  const correctedRetic = Math.round((reticulocytePct * (measuredHct / normalHct)) * 100) / 100;

  // Maturation factor & RPI
  const matFactor = maturationFactor(measuredHct);
  const rpi       = Math.round((correctedRetic / matFactor) * 100) / 100;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (rpi >= 3) {
    severity       = 'warning';
    interpretation = `RPI ${rpi} ≥ 3 — hyperproliferative; adequate marrow response (suggests hemolysis or acute blood loss)`;
  } else if (rpi >= 2) {
    severity       = 'warning';
    interpretation = `RPI ${rpi} (2–3) — borderline marrow response`;
  } else {
    severity       = 'danger';
    interpretation = `RPI ${rpi} < 2 — hypoproliferative; inadequate bone marrow response`;
  }

  return {
    correctedRetic,
    arc,
    rpi,
    matFactor,
    interpretation,
    severity,
    references: [
      'Hillman RS, Finch CA. Red Cell Manual. 7th ed. Philadelphia: FA Davis; 1996',
      'Buttarello M, Plebani M. Automated blood cell counts: state of the art. Am J Clin Pathol. 2008;130(1):104-116',
    ],
  };
}
