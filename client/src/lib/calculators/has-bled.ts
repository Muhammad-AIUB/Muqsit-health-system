interface HasBledInput {
  hypertension: 0 | 1;  // uncontrolled, >160 mmHg systolic
  renalDisease: 0 | 1;  // dialysis, transplant, Cr >2.26 mg/dL or >200 µmol/L
  liverDisease: 0 | 1;  // cirrhosis or bilirubin >2x normal with AST/ALT/AP >3x normal
  strokeHistory:    0 | 1;
  priorBleeding:    0 | 1;  // prior major bleeding or predisposition
  labileINR:        0 | 1;  // unstable/high INRs, time in therapeutic range <60%
  elderly:          0 | 1;  // age >65
  medications:      0 | 1;  // aspirin, clopidogrel, NSAIDs
  alcoholUse:       0 | 1;  // >=8 drinks/week
}

export function calculateHasBled(input: HasBledInput): {
  score: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const score =
    input.hypertension +
    input.renalDisease +
    input.liverDisease +
    input.strokeHistory +
    input.priorBleeding +
    input.labileINR +
    input.elderly +
    input.medications +
    input.alcoholUse;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (score <= 1) {
    severity = 'success';
    interpretation = 'Low risk of major bleeding (score 0-1)';
  } else if (score === 2) {
    severity = 'warning';
    interpretation = 'Moderate risk of major bleeding (score 2) — use caution';
  } else {
    severity = 'danger';
    interpretation = `High risk of major bleeding (score ${score}) — carefully weigh anticoagulation risks vs benefits`;
  }

  return {
    score,
    interpretation,
    severity,
    references: [
      'Pisters R et al. Chest. 2010;138(5):1093-1100',
      'Lip GY et al. J Am Coll Cardiol. 2011;57(2):173-180',
    ],
  };
}
