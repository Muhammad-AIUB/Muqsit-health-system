// Corrected Count Increment (CCI) for Platelet Transfusion
// CCI = (ΔPlatelet count × 10⁹/L × BSA m²) / (unit content × 10¹¹) × 1000

interface CciInput {
  prePlt:      number;  // × 10⁹/L  (= × 10³/µL — numerically identical)
  postPlt:     number;  // × 10⁹/L
  timeHour:    1 | 20;  // blood draw timing
  heightCm:    number;
  weightKg:    number;
  unitContent: number;  // × 10¹¹ platelets
}

export function calculateCCI(input: CciInput): {
  cci:            number;
  bsa:            number;
  increment:      number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { prePlt, postPlt, timeHour, heightCm, weightKg, unitContent } = input;

  const increment = postPlt - prePlt;
  const bsa       = Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;  // Mosteller

  // CCI formula: (increment × 10⁹/L × BSA) / (unitContent × 10¹¹) × 1000
  const cci = Math.round((increment * bsa / unitContent) * 1000);

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  // Thresholds: 1-hr ≥7500 adequate; 20-hr ≥4500 adequate
  const threshold = timeHour === 1 ? 7500 : 4500;
  const timeLabel = timeHour === 1 ? '1-hour' : '20-hour';

  if (cci >= threshold) {
    severity       = 'success';
    interpretation = `Adequate platelet response — ${timeLabel} CCI ${cci.toLocaleString()} ≥ ${threshold.toLocaleString()}`;
  } else {
    severity       = 'danger';
    interpretation = `Poor platelet response — ${timeLabel} CCI ${cci.toLocaleString()} < ${threshold.toLocaleString()} (suggests platelet refractoriness)`;
  }

  return {
    cci,
    bsa,
    increment,
    interpretation,
    severity,
    references: [
      'Slichter SJ et al. Mechanism of thrombocytopenia in patients with autoimmune hemolytic anemia. Blood. 1966;23(3):355-363',
      'Davis KB et al. Corrected Count Increment (CCI). Transfusion. 1999',
    ],
  };
}
