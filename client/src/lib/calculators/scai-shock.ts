// SCAI Cardiogenic Shock Classification (SCAI SHOCK Stages)
// Naidu SS, et al. SCAI SHOCK Stage Classification Expert Consensus Update.
// J Am Coll Cardiol. 2022;79(9):933-946.

export type SCAIStage = 'A' | 'B' | 'C' | 'D' | 'E';

interface SCAIInput {
  stage: SCAIStage;
}

// In-hospital mortality by SCAI stage (Jentzer JC et al. JACC 2019, Mayo cohort)
const STAGE_DATA: Record<SCAIStage, { name: string; mortality: string; severity: 'success' | 'warning' | 'danger'; desc: string }> = {
  A: {
    name: 'A — At Risk',
    mortality: '~3%',
    severity: 'success',
    desc: 'At risk for cardiogenic shock (e.g. large MI, acute or acute-on-chronic HF). No current signs or symptoms. Normal BP, normal perfusion, lactate normal.',
  },
  B: {
    name: 'B — Beginning',
    mortality: '~7%',
    severity: 'warning',
    desc: 'Beginning shock / compensated. Relative hypotension (SBP <90, MAP <60, or ≥30 mmHg drop) or tachycardia, WITHOUT hypoperfusion. Lactate normal (<2 mmol/L).',
  },
  C: {
    name: 'C — Classic',
    mortality: '~12%',
    severity: 'danger',
    desc: 'Classic cardiogenic shock. Hypoperfusion requiring intervention (1 vasopressor/inotrope and/or 1 mechanical circulatory support device) beyond volume. Lactate ≥2 mmol/L; cold/clammy, oliguria, or altered mentation.',
  },
  D: {
    name: 'D — Deteriorating',
    mortality: '~40%',
    severity: 'danger',
    desc: 'Deteriorating / doom. Failing to respond to initial interventions — requires escalation (≥2 drugs or devices), worsening hypoperfusion (rising lactate, often 5–10 mmol/L).',
  },
  E: {
    name: 'E — Extremis',
    mortality: '~67%',
    severity: 'danger',
    desc: 'Extremis. Actual or impending circulatory collapse — refractory shock, cardiac arrest with ongoing CPR, severe hypotension (SBP <60 / MAP <50) despite maximal support, lactate >10 mmol/L or pH ≤7.2.',
  },
};

export function calculateSCAIShock(input: SCAIInput): {
  stage:          SCAIStage;
  mortality:      string;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const data = STAGE_DATA[input.stage];

  return {
    stage: input.stage,
    mortality: data.mortality,
    interpretation: `SCAI Stage ${data.name} — In-hospital mortality ${data.mortality}. ${data.desc}`,
    severity: data.severity,
    references: [
      'Naidu SS, Baran DA, Jentzer JC, et al. SCAI SHOCK Stage Classification Expert Consensus Update. J Am Coll Cardiol. 2022;79(9):933-946.',
      'Jentzer JC, et al. Cardiogenic Shock Classification to Predict Mortality in the Cardiac ICU. J Am Coll Cardiol. 2019;74(17):2117-2128.',
    ],
  };
}

export { STAGE_DATA };
