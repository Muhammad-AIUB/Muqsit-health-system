interface CardiacOutputInput {
  weightKg:   number;
  heightCm:   number;
  sao2Pct:    number;  // % (will be converted to decimal)
  svo2Pct:    number;  // % (will be converted to decimal)
  hbGdl:      number;  // g/dL
  heartRate:  number;  // beats/min
  age70plus:  boolean;
}

export function calculateCardiacOutput(input: CardiacOutputInput): {
  bsa:   number;  // m²
  vo2:   number;  // mL/min
  co:    number;  // L/min
  ci:    number;  // L/min/m²
  sv:    number;  // mL/beat
  references: string[];
} {
  const { weightKg, heightCm, sao2Pct, svo2Pct, hbGdl, heartRate, age70plus } = input;

  // BSA by Mosteller formula
  const bsa = Math.sqrt((heightCm * weightKg) / 3600);

  // VO2 (mL O2/min)
  const vo2Constant = age70plus ? 110 : 125;
  const vo2 = vo2Constant * bsa;

  // Fick equation: CO = VO2 / [(SaO2 - SvO2) x Hb x 13.4]
  const sao2 = sao2Pct / 100;
  const svo2 = svo2Pct / 100;
  const co   = vo2 / ((sao2 - svo2) * hbGdl * 13.4);

  const ci   = co / bsa;
  const sv   = (co / heartRate) * 1000;  // mL/beat

  return {
    bsa:   Math.round(bsa  * 100) / 100,
    vo2:   Math.round(vo2  * 10)  / 10,
    co:    Math.round(co   * 100) / 100,
    ci:    Math.round(ci   * 100) / 100,
    sv:    Math.round(sv   * 10)  / 10,
    references: [
      'Fick A. Uber die Messung des Blutquantums in den Herzventrikeln. Sitzungsber Phys Med Ges Wurzburg. 1870',
      'Mosteller RD. N Engl J Med. 1987;317(17):1098',
    ],
  };
}
