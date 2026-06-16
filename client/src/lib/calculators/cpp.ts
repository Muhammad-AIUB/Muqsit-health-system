import type { CalculationResult } from '@/types/calculator';

interface CppInput {
  map: number;  // mm Hg
  icp: number;  // mm Hg
}

export function calculateCPP(input: CppInput): CalculationResult {
  const { map, icp } = input;
  const cpp   = map - icp;
  const score = Math.round(cpp * 10) / 10;

  let severity: CalculationResult['severity'];
  let interpretation: string;

  if (cpp >= 60) {
    severity = 'success';
    interpretation = 'Normal CPP (>=60 mmHg)';
  } else if (cpp >= 50) {
    severity = 'warning';
    interpretation = 'Low CPP (50–59 mmHg) — risk of cerebral ischemia';
  } else {
    severity = 'danger';
    interpretation = 'Critical CPP (<50 mmHg) — severe cerebral hypoperfusion';
  }

  return {
    calculatorId: 'cpp',
    score,
    unit: 'mm Hg',
    severity,
    label: interpretation,
    interpretation,
    references: ['MDCalc – Cerebral Perfusion Pressure'],
  };
}
