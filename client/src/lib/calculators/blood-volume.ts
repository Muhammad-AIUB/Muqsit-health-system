// Blood Volume Calculation
// Adults/children ≥25 kg: Nadler formula (Am J Surg 1962)
// Neonates/children <25 kg: weight-based estimates

export type PatientType = 'preterm' | 'term' | 'infant' | 'child' | 'adult';
export type Sex = 'male' | 'female';

interface BloodVolumeInput {
  patientType: PatientType;
  sex?:        Sex;      // required for adult / child ≥25 kg
  heightCm?:   number;  // required for adult / child ≥25 kg
  weightKg:    number;
  hematocrit?: number;  // %, optional
}

const ML_PER_KG: Record<PatientType, number> = {
  preterm: 100,
  term:    85,
  infant:  75,
  child:   70,
  adult:   0,   // unused — uses Nadler formula
};

export function calculateBloodVolume(input: BloodVolumeInput): {
  tbvMl:          number;
  rbcMl:          number | null;
  plasmaMl:       number | null;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { patientType, sex, heightCm, weightKg, hematocrit } = input;

  let tbvMl: number;

  if (patientType === 'adult') {
    // Nadler formula — result in litres → convert to mL
    const hM = (heightCm ?? 0) / 100;
    const h3  = Math.pow(hM, 3);
    if (sex === 'male') {
      tbvMl = (0.3669 * h3 + 0.03219 * weightKg + 0.6041) * 1000;
    } else {
      tbvMl = (0.3561 * h3 + 0.03308 * weightKg + 0.1833) * 1000;
    }
  } else {
    tbvMl = weightKg * ML_PER_KG[patientType];
  }

  tbvMl = Math.round(tbvMl);

  let rbcMl:    number | null = null;
  let plasmaMl: number | null = null;

  if (hematocrit !== undefined && hematocrit > 0) {
    rbcMl    = Math.round(tbvMl * hematocrit / 100);
    plasmaMl = Math.round(tbvMl * (1 - hematocrit / 100));
  }

  // Rough assessment — no specific clinical threshold in the formula, just report
  const severity: 'success' | 'warning' | 'danger' = 'success';

  let interpretation = `Total Blood Volume: ${tbvMl.toLocaleString()} mL`;
  if (rbcMl !== null) interpretation += ` | RBC Volume: ${rbcMl.toLocaleString()} mL | Plasma Volume: ${plasmaMl!.toLocaleString()} mL`;

  return {
    tbvMl,
    rbcMl,
    plasmaMl,
    interpretation,
    severity,
    references: [
      'Nadler SB, Hidalgo JU, Bloch T. Prediction of blood volume in normal human adults. Surgery. 1962;51(2):224-232',
    ],
  };
}
