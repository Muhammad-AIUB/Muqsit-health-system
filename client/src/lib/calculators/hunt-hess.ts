// Hunt and Hess Scale for Subarachnoid Hemorrhage
// Grades clinical severity to predict surgical risk and outcome

export function calculateHuntHess(grade: number): {
  score:          number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const survival: Record<number, string> = {
    1: '~70%',
    2: '~60%',
    3: '~50%',
    4: '~20%',
    5: '~10%',
  };

  let severity: 'success' | 'warning' | 'danger';
  if (grade <= 2)       severity = 'success';
  else if (grade <= 3)  severity = 'warning';
  else                  severity = 'danger';

  return {
    score: grade,
    interpretation: `Hunt-Hess Grade ${grade} — Estimated survival ${survival[grade] ?? '~10%'}`,
    severity,
    references: [
      'Hunt WE, Hess RM. Surgical risk as related to time of intervention in the repair of intracranial aneurysms. J Neurosurg. 1968;28(1):14-20.',
    ],
  };
}
