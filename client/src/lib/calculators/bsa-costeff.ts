// Body Surface Area (BSA) — Costeff formula
// Costeff H. A simple empirical formula for calculating approximate surface area in children.
// Arch Dis Child. 1966;41(220):681-683.

interface BSACosteffInput {
  weightKg: number;  // kg
}

export function calculateBSACosteff(input: BSACosteffInput): {
  bsa:            number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { weightKg } = input;

  // Costeff: BSA (m²) = (4 × W + 7) / (90 + W), W in kg
  const bsa = Math.round(((4 * weightKg + 7) / (90 + weightKg)) * 100) / 100;

  return {
    bsa,
    interpretation: `Body Surface Area: ${bsa} m²`,
    severity: 'success',
    references: [
      'Costeff H. A simple empirical formula for calculating approximate surface area in children. Arch Dis Child. 1966;41(220):681-683.',
    ],
  };
}
