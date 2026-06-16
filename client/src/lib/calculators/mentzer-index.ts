// Mentzer Index — Mentzer WC, Blood 1973
// Differentiates iron deficiency anaemia from thalassaemia trait

interface MentzerInput {
  mcv:      number;  // fL
  rbcCount: number;  // × 10⁶ cells/µL  (= × 10¹² cells/L — numerically identical)
}

export function calculateMentzerIndex(input: MentzerInput): {
  index:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { mcv, rbcCount } = input;

  const index = Math.round((mcv / rbcCount) * 100) / 100;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (index < 13) {
    severity       = 'warning';
    interpretation = `Mentzer Index ${index} < 13 — Thalassaemia trait likely`;
  } else if (index > 13) {
    severity       = 'danger';
    interpretation = `Mentzer Index ${index} > 13 — Iron deficiency anaemia likely`;
  } else {
    severity       = 'warning';
    interpretation = `Mentzer Index ${index} = 13 — Indeterminate (overlap between thalassaemia and iron deficiency)`;
  }

  return {
    index,
    interpretation,
    severity,
    references: [
      'Mentzer WC Jr. Differentiation of iron deficiency from thalassaemia trait. Lancet. 1973;1(7808):882',
    ],
  };
}
