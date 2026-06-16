// APACHE II Score — Acute Physiology and Chronic Health Evaluation II
// Knaus WA, et al. APACHE II: a severity of disease classification system.
// Crit Care Med. 1985;13(10):818-829.

export interface Apache2Input {
  chronicHealth:    0 | 1;     // severe organ failure / immunocompromise
  age:              number;    // years
  tempC:            number;    // °C (rectal)
  map:              number;    // mean arterial pressure, mmHg
  ph:               number;    // arterial pH
  hr:               number;    // heart rate, beats/min
  rr:               number;    // respiratory rate, breaths/min
  sodium:           number;    // serum sodium, mmol/L
  potassium:        number;    // serum potassium, mmol/L
  creatinine:       number;    // serum creatinine, mg/dL
  acuteRenalFailure: 0 | 1;   // doubles creatinine points
  hematocrit:       number;    // %
  wbc:              number;    // ×10³/µL  (= ×10⁹/L)
  gcs:              number;    // Glasgow Coma Scale, 3–15
  fio2High:         boolean;   // false = FiO₂ <50%, true = ≥50%
  pao2?:            number;    // mmHg — required if FiO₂ <50%
  aado2?:           number;    // mmHg — required if FiO₂ ≥50%
}

// ── Individual APS sub-scores ────────────────────────────────────────────────

function tempPoints(c: number): number {
  if (c >= 41)   return 4;
  if (c >= 39)   return 3;
  if (c >= 38.5) return 1;
  if (c >= 36)   return 0;
  if (c >= 34)   return 1;
  if (c >= 32)   return 2;
  if (c >= 30)   return 3;
  return 4;
}

function mapPoints(v: number): number {
  if (v >= 160) return 4;
  if (v >= 130) return 3;
  if (v >= 110) return 2;
  if (v >= 70)  return 0;
  if (v >= 50)  return 2;
  return 4;
}

function hrPoints(v: number): number {
  if (v >= 180) return 4;
  if (v >= 140) return 3;
  if (v >= 110) return 2;
  if (v >= 70)  return 0;
  if (v >= 55)  return 2;
  if (v >= 40)  return 3;
  return 4;
}

function rrPoints(v: number): number {
  if (v >= 50) return 4;
  if (v >= 35) return 3;
  if (v >= 25) return 1;
  if (v >= 12) return 0;
  if (v >= 10) return 1;
  if (v >= 6)  return 2;
  return 4;
}

function oxyPoints(fio2High: boolean, pao2?: number, aado2?: number): number {
  if (fio2High) {
    // A-aDO₂ used when FiO₂ ≥ 50%
    if (aado2 === undefined || !Number.isFinite(aado2)) return 0;
    if (aado2 >= 500) return 4;
    if (aado2 >= 350) return 3;
    if (aado2 >= 200) return 2;
    return 0;
  } else {
    // PaO₂ used when FiO₂ < 50%
    if (pao2 === undefined || !Number.isFinite(pao2)) return 0;
    if (pao2 > 70)  return 0;
    if (pao2 >= 61) return 1;
    if (pao2 >= 55) return 3;
    return 4;
  }
}

function phPoints(v: number): number {
  if (v >= 7.7)  return 4;
  if (v >= 7.6)  return 3;
  if (v >= 7.5)  return 1;
  if (v >= 7.33) return 0;
  if (v >= 7.25) return 2;
  if (v >= 7.15) return 3;
  return 4;
}

function sodiumPoints(v: number): number {
  if (v >= 180) return 4;
  if (v >= 160) return 3;
  if (v >= 155) return 2;
  if (v >= 150) return 1;
  if (v >= 130) return 0;
  if (v >= 120) return 2;
  if (v >= 111) return 3;
  return 4;
}

function potassiumPoints(v: number): number {
  if (v >= 7)   return 4;
  if (v >= 6)   return 3;
  if (v >= 5.5) return 1;
  if (v >= 3.5) return 0;
  if (v >= 3)   return 1;
  if (v >= 2.5) return 2;
  return 4;
}

function creatininePoints(v: number, arf: boolean): number {
  let pts: number;
  if (v >= 3.5) pts = 4;
  else if (v >= 2)   pts = 3;
  else if (v >= 1.5) pts = 2;
  else if (v >= 0.6) pts = 0;
  else               pts = 2;
  return arf ? pts * 2 : pts;
}

function hematocritPoints(v: number): number {
  if (v >= 60) return 4;
  if (v >= 50) return 2;
  if (v >= 46) return 1;
  if (v >= 30) return 0;
  if (v >= 20) return 2;
  return 4;
}

function wbcPoints(v: number): number {
  if (v >= 40) return 4;
  if (v >= 20) return 2;
  if (v >= 15) return 1;
  if (v >= 3)  return 0;
  if (v >= 1)  return 2;
  return 4;
}

function agePoints(age: number): number {
  if (age >= 75) return 6;
  if (age >= 65) return 5;
  if (age >= 55) return 3;
  if (age >= 45) return 2;
  return 0;
}

// ── Main calculation ─────────────────────────────────────────────────────────

export function calculateApache2(input: Apache2Input): {
  score:          number;
  aps:            number;
  ageScore:       number;
  chronicScore:   number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const tPts  = tempPoints(input.tempC);
  const mPts  = mapPoints(input.map);
  const hPts  = hrPoints(input.hr);
  const rPts  = rrPoints(input.rr);
  const oPts  = oxyPoints(input.fio2High, input.pao2, input.aado2);
  const phPts = phPoints(input.ph);
  const naPts = sodiumPoints(input.sodium);
  const kPts  = potassiumPoints(input.potassium);
  const crPts = creatininePoints(input.creatinine, input.acuteRenalFailure === 1);
  const hctPts = hematocritPoints(input.hematocrit);
  const wPts   = wbcPoints(input.wbc);
  const gcsPts = 15 - input.gcs;            // APS = 15 − GCS

  const aps          = tPts + mPts + hPts + rPts + oPts + phPts + naPts + kPts + crPts + hctPts + wPts + gcsPts;
  const ageScore     = agePoints(input.age);
  const chronicScore = input.chronicHealth === 1 ? 5 : 0;
  const score        = aps + ageScore + chronicScore;

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (score <= 4) {
    severity       = 'success';
    interpretation = `APACHE II ${score} — Low severity; predicted hospital mortality ~4%`;
  } else if (score <= 9) {
    severity       = 'success';
    interpretation = `APACHE II ${score} — Low-moderate severity; predicted hospital mortality ~8%`;
  } else if (score <= 14) {
    severity       = 'warning';
    interpretation = `APACHE II ${score} — Moderate severity; predicted hospital mortality ~15%`;
  } else if (score <= 19) {
    severity       = 'warning';
    interpretation = `APACHE II ${score} — Moderate-high severity; predicted hospital mortality ~25%`;
  } else if (score <= 24) {
    severity       = 'danger';
    interpretation = `APACHE II ${score} — High severity; predicted hospital mortality ~40%`;
  } else if (score <= 29) {
    severity       = 'danger';
    interpretation = `APACHE II ${score} — Very high severity; predicted hospital mortality ~55%`;
  } else if (score <= 34) {
    severity       = 'danger';
    interpretation = `APACHE II ${score} — Extremely high severity; predicted hospital mortality ~75%`;
  } else {
    severity       = 'danger';
    interpretation = `APACHE II ${score} — Maximum severity; predicted hospital mortality ~85%`;
  }

  return {
    score,
    aps,
    ageScore,
    chronicScore,
    interpretation,
    severity,
    references: [
      'Knaus WA, Draper EA, Wagner DP, Zimmerman JE. APACHE II: a severity of disease classification system. Crit Care Med. 1985;13(10):818-829.',
    ],
  };
}
