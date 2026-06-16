interface ShockIndexInput {
  heartRate: number;  // beats/min
  sbp:       number;  // mm Hg
}

export function calculateShockIndex(input: ShockIndexInput): {
  shockIndex: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { heartRate, sbp } = input;
  const shockIndex = Math.round((heartRate / sbp) * 100) / 100;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (shockIndex < 0.5) {
    severity = 'warning';
    interpretation = 'Below normal Shock Index (< 0.5) — consider bradycardia or relative hypotension';
  } else if (shockIndex <= 0.7) {
    severity = 'success';
    interpretation = 'Normal Shock Index (0.5 – 0.7)';
  } else if (shockIndex <= 1.0) {
    severity = 'warning';
    interpretation = 'Mildly elevated Shock Index (0.7 – 1.0) — possible early hemodynamic compromise';
  } else if (shockIndex <= 1.4) {
    severity = 'danger';
    interpretation = 'Elevated Shock Index (1.0 – 1.4) — moderate shock, urgent evaluation needed';
  } else {
    severity = 'danger';
    interpretation = 'Severely elevated Shock Index (> 1.4) — severe shock, immediate intervention required';
  }

  return {
    shockIndex,
    interpretation,
    severity,
    references: [
      'Allgöwer M, Burri C. Schockindex. Dtsch Med Wochenschr. 1967;92(43):1947-1950',
      'Rady MY et al. Ann Emerg Med. 1994;24(4):685-690',
    ],
  };
}
