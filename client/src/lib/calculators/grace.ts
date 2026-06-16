interface GraceInput {
  age:              number;
  heartRate:        number;  // beats/min
  systolicBP:       number;  // mmHg
  creatinineMgDl:   number;  // mg/dL
  cardiacArrest:    0 | 1;
  stDeviation:      0 | 1;
  abnormalEnzymes:  0 | 1;
  killipClass:      1 | 2 | 3 | 4;
}

function agePoints(age: number): number {
  if (age < 30)  return 0;
  if (age < 40)  return 8;
  if (age < 50)  return 25;
  if (age < 60)  return 41;
  if (age < 70)  return 58;
  if (age < 80)  return 75;
  if (age < 90)  return 91;
  return 100;
}

function hrPoints(hr: number): number {
  if (hr < 50)   return 0;
  if (hr < 70)   return 3;
  if (hr < 90)   return 9;
  if (hr < 110)  return 15;
  if (hr < 150)  return 24;
  if (hr < 200)  return 38;
  return 46;
}

function sbpPoints(sbp: number): number {
  if (sbp < 80)   return 58;
  if (sbp < 100)  return 53;
  if (sbp < 120)  return 43;
  if (sbp < 140)  return 34;
  if (sbp < 160)  return 24;
  if (sbp < 200)  return 10;
  return 0;
}

function creatininePoints(cr: number): number {
  if (cr < 0.40)  return 1;
  if (cr < 0.80)  return 4;
  if (cr < 1.20)  return 7;
  if (cr < 1.60)  return 10;
  if (cr < 2.00)  return 13;
  if (cr < 4.00)  return 21;
  return 28;
}

function killipPoints(k: 1 | 2 | 3 | 4): number {
  const map: Record<number, number> = { 1: 0, 2: 20, 3: 39, 4: 59 };
  return map[k];
}

function getMortalityRisk(score: number): string {
  if (score <= 87)  return '0-2%';
  if (score <= 128) return '3-10%';
  if (score <= 149) return '10-20%';
  if (score <= 173) return '20-30%';
  if (score <= 182) return '40%';
  if (score <= 190) return '50%';
  if (score <= 199) return '60%';
  if (score <= 207) return '70%';
  if (score <= 218) return '80%';
  if (score <= 284) return '90%';
  return '99%';
}

export function calculateGrace(input: GraceInput): {
  score: number;
  mortalityRisk: string;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const score =
    agePoints(input.age) +
    hrPoints(input.heartRate) +
    sbpPoints(input.systolicBP) +
    creatininePoints(input.creatinineMgDl) +
    killipPoints(input.killipClass) +
    (input.cardiacArrest   ? 39 : 0) +
    (input.stDeviation     ? 28 : 0) +
    (input.abnormalEnzymes ? 14 : 0);

  const mortalityRisk = getMortalityRisk(score);

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (score <= 87) {
    severity = 'success';
    interpretation = `Low risk — estimated 6-month mortality ${mortalityRisk} (GRACE score ${score})`;
  } else if (score <= 128) {
    severity = 'warning';
    interpretation = `Intermediate risk — estimated 6-month mortality ${mortalityRisk} (GRACE score ${score})`;
  } else {
    severity = 'danger';
    interpretation = `High risk — estimated 6-month mortality ${mortalityRisk} (GRACE score ${score})`;
  }

  return {
    score,
    mortalityRisk,
    interpretation,
    severity,
    references: [
      'Fox KA et al. BMJ. 2006;333(7578):1091',
      'GRACE Investigators. Lancet. 2002;359(9306):601-605',
    ],
  };
}
