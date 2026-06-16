// Body Surface Area (BSA) — Mosteller formula
// Mosteller RD. Simplified calculation of body-surface area. N Engl J Med. 1987;317(17):1098.

interface BSAInput {
  heightCm: number;  // cm
  weightKg: number;  // kg
}

export function calculateBSA(input: BSAInput): {
  bsa:            number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { heightCm, weightKg } = input;

  // Mosteller (metric): BSA (m²) = √[(Height cm × Weight kg) / 3600]
  const bsa = Math.round(Math.sqrt((heightCm * weightKg) / 3600) * 100) / 100;

  return {
    bsa,
    interpretation: `Body Surface Area: ${bsa} m²`,
    severity: 'success',
    references: [
      'Mosteller RD. Simplified calculation of body-surface area. N Engl J Med. 1987;317(17):1098.',
    ],
  };
}
