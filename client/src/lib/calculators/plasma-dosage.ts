// Plasma Dosage (FFP) Calculator
// Total plasma dosage (mL) = desired dosage (mL/kg) × weight (kg)

interface PlasmaDosageInput {
  weightKg:     number;
  dosageMlKg:   number;  // mL/kg — typically 10–20
  unitVolumeMl: number;  // mL per unit — typically 200–250
}

export function calculatePlasmaDosage(input: PlasmaDosageInput): {
  totalMl:        number;
  unitsNeeded:    number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { weightKg, dosageMlKg, unitVolumeMl } = input;

  const totalMl     = Math.round(dosageMlKg * weightKg);
  const unitsNeeded = Math.ceil(totalMl / unitVolumeMl);

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (dosageMlKg < 10) {
    severity       = 'warning';
    interpretation = `Total: ${totalMl.toLocaleString()} mL — dosage ${dosageMlKg} mL/kg is below the standard 10 mL/kg`;
  } else if (dosageMlKg <= 20) {
    severity       = 'success';
    interpretation = `Total: ${totalMl.toLocaleString()} mL (${unitsNeeded} unit${unitsNeeded !== 1 ? 's' : ''} of ${unitVolumeMl} mL) — within recommended range (10–20 mL/kg)`;
  } else {
    severity       = 'warning';
    interpretation = `Total: ${totalMl.toLocaleString()} mL — dosage ${dosageMlKg} mL/kg exceeds recommended maximum of 20 mL/kg`;
  }

  return {
    totalMl,
    unitsNeeded,
    interpretation,
    severity,
    references: [
      'Roback JD et al. (eds). Technical Manual, 17th ed. Bethesda: AABB; 2011',
      'O\'Shaughnessy DF et al. Guidelines for the use of fresh-frozen plasma, cryoprecipitate and cryosupernatant. Br J Haematol. 2004;126(1):11-28',
    ],
  };
}
