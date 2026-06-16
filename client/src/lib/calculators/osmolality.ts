import type { CalculationResult } from '@/types/calculator';

interface OsmolalityInput {
  sodium: number;       // mEq/L
  bun: number;          // mg/dL
  glucose: number;      // mg/dL
  ethanol?: number;     // mg/dL (optional)
  measuredOsm?: number; // mmol/kg (optional)
}

export function calculateOsmolality(input: OsmolalityInput): CalculationResult & {
  traditional: number;
  purssell: number;
  osmolarGap?: number;
} {
  const { sodium, bun, glucose, ethanol, measuredOsm } = input;

  // Traditional equation (ethanol / 4.6)
  const ethanolTermTraditional = ethanol ? ethanol / 4.6 : 0;
  const traditional = 2 * sodium + bun / 2.8 + glucose / 18 + ethanolTermTraditional;

  // Purssell et al. equation (ethanol / 3.7)
  const ethanolTermPurssell = ethanol ? ethanol / 3.7 : 0;
  const purssell = 2 * sodium + bun / 2.8 + glucose / 18 + ethanolTermPurssell;

  // Osmolar gap uses Purssell equation
  const osmolarGap = measuredOsm !== undefined
    ? Math.round((measuredOsm - purssell) * 10) / 10
    : undefined;

  const trad = Math.round(traditional * 10) / 10;
  const purs = Math.round(purssell    * 10) / 10;

  let severity: CalculationResult['severity'];
  let interpretation: string;

  if (purs < 275) {
    severity = 'warning';
    interpretation = 'Hypo-osmolality (<275 mmol/kg)';
  } else if (purs <= 295) {
    severity = 'success';
    interpretation = 'Normal serum osmolality (275–295 mmol/kg)';
  } else if (purs <= 320) {
    severity = 'warning';
    interpretation = 'Mild hyperosmolality (296–320 mmol/kg)';
  } else {
    severity = 'danger';
    interpretation = 'Severe hyperosmolality (>320 mmol/kg)';
  }

  return {
    calculatorId: 'osmolality',
    score: purs,
    unit: 'mmol/kg',
    severity,
    label: interpretation,
    interpretation,
    traditional: trad,
    purssell: purs,
    osmolarGap,
    references: [
      'Smithline N, Gardner KD. JAMA. 1976',
      'Purssell RA et al. Ann Emerg Med. 2001',
      'MDCalc – Serum Osmolality/Osmolarity',
    ],
  };
}
