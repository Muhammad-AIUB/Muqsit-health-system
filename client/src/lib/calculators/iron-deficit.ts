// Iron Deficit Calculation — Ganzoni Formula
// Total iron deficit (mg) = Weight (kg) × (Target Hb − Actual Hb) g/dL × 2.4 + Iron stores (mg)

interface IronDeficitInput {
  weightKg:      number;
  targetHbGdl:   number;  // g/dL
  actualHbGdl:   number;  // g/dL
  ironStoresMg:  number;  // mg (500 for adults/≥35 kg; 15×weight for <35 kg)
}

export function calculateIronDeficit(input: IronDeficitInput): {
  ironDeficitMg:  number;
  interpretation: string;
  severity:       'success' | 'warning' | 'danger';
  references:     string[];
} {
  const { weightKg, targetHbGdl, actualHbGdl, ironStoresMg } = input;

  const ironDeficitMg = Math.round(weightKg * (targetHbGdl - actualHbGdl) * 2.4 + ironStoresMg);

  let interpretation: string;
  let severity: 'success' | 'warning' | 'danger';

  if (ironDeficitMg <= 0) {
    severity       = 'success';
    interpretation = `No iron deficit — calculated value ${ironDeficitMg} mg (target Hb may already be met)`;
  } else if (ironDeficitMg <= 500) {
    severity       = 'warning';
    interpretation = `Iron deficit: ${ironDeficitMg.toLocaleString()} mg — mild deficit`;
  } else if (ironDeficitMg <= 1500) {
    severity       = 'warning';
    interpretation = `Iron deficit: ${ironDeficitMg.toLocaleString()} mg — moderate deficit`;
  } else {
    severity       = 'danger';
    interpretation = `Iron deficit: ${ironDeficitMg.toLocaleString()} mg — severe deficit; IV iron therapy likely needed`;
  }

  return {
    ironDeficitMg,
    interpretation,
    severity,
    references: [
      'Ganzoni AM. Intravenous iron-dextran: therapeutic and experimental possibilities. Schweiz Med Wochenschr. 1970;100(7):301-303',
    ],
  };
}
