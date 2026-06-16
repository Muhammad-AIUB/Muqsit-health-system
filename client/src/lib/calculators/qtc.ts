interface QtcInput {
  qtMs:       number;  // QT interval in milliseconds
  heartRate:  number;  // beats/min
}

export interface QtcResult {
  bazett:      number;
  fridericia:  number;
  framingham:  number;
  hodges:      number;
  rautaharju:  number;
}

function interpretQTc(qtcMs: number): { text: string; severity: 'success' | 'warning' | 'danger' } {
  if (qtcMs < 440) return { text: 'Normal QTc interval (< 440 ms)', severity: 'success' };
  if (qtcMs < 500) return { text: 'Borderline/mildly prolonged QTc (440-499 ms) — monitor closely', severity: 'warning' };
  return { text: 'Significantly prolonged QTc (>= 500 ms) — high risk of Torsades de Pointes', severity: 'danger' };
}

export function calculateQTc(input: QtcInput): {
  results: QtcResult;
  interpretation: (qtcMs: number) => { text: string; severity: 'success' | 'warning' | 'danger' };
  references: string[];
} {
  const { qtMs, heartRate } = input;
  const rrSec = 60 / heartRate;   // RR interval in seconds

  // QT in ms for Framingham, Hodges, Rautaharju
  const bazett     = Math.round(qtMs / Math.sqrt(rrSec));
  const fridericia = Math.round(qtMs / Math.cbrt(rrSec));
  const framingham = Math.round(qtMs + 154 * (1 - rrSec));
  const hodges     = Math.round(qtMs + 1.75 * (heartRate - 60));
  const rautaharju = Math.round(qtMs * (120 + heartRate) / 180);

  return {
    results: { bazett, fridericia, framingham, hodges, rautaharju },
    interpretation: interpretQTc,
    references: [
      'Bazett HC. Heart. 1920;7:353-370',
      'Fridericia LS. Acta Med Scand. 1920;53:469-486',
      'Sagie A et al. Am J Cardiol. 1992;70(7):797-801 (Framingham)',
      'Hodges M et al. J Am Coll Cardiol. 1983;1(6):694 (abstract)',
      'Rautaharju PM et al. Ann Noninvas Electrocardiol. 2009;14(1):3-14',
    ],
  };
}
