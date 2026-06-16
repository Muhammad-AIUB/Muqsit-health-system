// PERC Rule for Pulmonary Embolism
// Kline JA, et al. Ann Emerg Med. 2004;44(2):122-131.

export interface PERCInput {
  age50:    0 | 1;   // age ≥50
  hr100:    0 | 1;   // HR ≥100
  o2sat:    0 | 1;   // O₂ sat <95% on room air
  legSwelling: 0 | 1; // unilateral leg swelling
  hemoptysis: 0 | 1;
  surgery:  0 | 1;   // surgery or trauma ≤4 weeks ago
  priorPeDvt: 0 | 1; // prior PE or DVT
  hormones: 0 | 1;   // oral contraceptives / HRT / estrogenic hormones
}

export function calculatePERC(input: PERCInput): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'danger';
  references:     string[];
} {
  const score =
    input.age50 + input.hr100 + input.o2sat + input.legSwelling +
    input.hemoptysis + input.surgery + input.priorPeDvt + input.hormones;

  const percNegative = score === 0;

  return {
    score,
    interpretation: percNegative
      ? 'PERC Negative — all criteria absent; PE can be ruled out in low pre-test probability patients without further testing'
      : `PERC Positive — ${score} criterion${score > 1 ? 'a' : ''} present; PE cannot be ruled out, further workup required`,
    severity: percNegative ? 'success' : 'danger',
    references: [
      'Kline JA, Mitchell AM, Kabrhel C, Richman PB, Courtney DM. Clinical criteria to prevent unnecessary diagnostic testing in emergency department patients with suspected pulmonary embolism. J Thromb Haemost. 2004;2(8):1247-1255.',
    ],
  };
}
