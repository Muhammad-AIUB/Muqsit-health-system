interface MapInput {
  sbp: number;  // mm Hg
  dbp: number;  // mm Hg
}

export function calculateMAP(input: MapInput): {
  map: number;
  interpretation: string;
  severity: 'success' | 'warning' | 'danger';
  references: string[];
} {
  const { sbp, dbp } = input;
  const map = Math.round((sbp / 3 + (2 * dbp) / 3) * 10) / 10;

  let severity: 'success' | 'warning' | 'danger';
  let interpretation: string;

  if (map < 60) {
    severity = 'danger';
    interpretation = 'Low MAP (< 60 mmHg) — inadequate organ perfusion';
  } else if (map <= 100) {
    severity = 'success';
    interpretation = 'Normal MAP (60-100 mmHg)';
  } else {
    severity = 'warning';
    interpretation = 'Elevated MAP (> 100 mmHg) — hypertension';
  }

  return {
    map,
    interpretation,
    severity,
    references: [
      'Magder SA. Curr Opin Crit Care. 2014;20(3):270-276',
    ],
  };
}
