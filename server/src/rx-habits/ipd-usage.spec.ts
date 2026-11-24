import { ipdMedicines } from './ipd-usage';

const day = (d: number) => new Date(Date.UTC(2026, 10, d));
const line = (drug: string, dose: string, instruction: string, duration: string, extra: object = {}) => ({ drug, dose, instruction, duration, ...extra });
const adm = (d: number, rxItems: unknown) => ({ admittedAt: day(d), clinical: { rxItems } });

describe('ipdMedicines — what was ordered on the ward', () => {
  it('ranks by distinct admissions, then the newest, and counts an admission once', () => {
    const list = ipdMedicines([
      adm(1, [line('Injection. Ceftriaxone 1 gm', '1+0+1', 'IV', '5 days'), line('Injection. Ceftriaxone 1 gm', '1+0+1', 'IV', '5 days')]),
      adm(2, [line('Injection. Ceftriaxone 1 gm', '1+0+1', 'IV', '5 days'), line('Tablet. Napa 500 mg', '1+1+1', '', '3 days')]),
      adm(3, [line('Tablet. Napa 500 mg', '1+1+1', '', '3 days')]),
    ]);
    expect(list.map((m) => [m.drugLabel, m.patientCount])).toEqual([
      ['Tablet. Napa 500 mg', 2], // tie on 2 admissions: the newer one first
      ['Injection. Ceftriaxone 1 gm', 2],
    ]);
  });

  it('the usual instruction is the one written for the most admissions; the last three are its choices', () => {
    const [m] = ipdMedicines([
      adm(1, [line('Tablet. Napa 500 mg', '1+1+1', '', '3 days')]),
      adm(2, [line('Tablet. Napa 500 mg', '1+0+1', '', '5 days')]),
      adm(3, [line('Tablet. Napa 500 mg', '1+0+1', '', '5 days')]),
      adm(4, [line('Tablet. Napa 500 mg', '0+0+1', 'Before meal', '7 days')]),
      adm(5, [line('Tablet. Napa 500 mg', '1+1+1', '', '10 days')]),
    ]);
    expect([m.dose, m.duration]).toEqual(['1+0+1', '5 days']);
    expect(m.patientCount).toBe(5);
    expect(m.recent.map((r) => r.duration)).toEqual(['10 days', '7 days', '5 days']);
  });

  it('keeps a taper with its medicine and never invents or rewords a cell', () => {
    const [m] = ipdMedicines([
      adm(1, [line('Tablet. Prednisolone 10 mg', '2+0+0', 'After meal', '3 days'), { drug: '', dose: '1+0+0', instruction: '', duration: '3 days', isCont: true }]),
    ]);
    expect(m.dose).toBe('2+0+0');
    expect(m.food).toBe('After meal');
    expect(m.contLines).toEqual([{ dose: '1+0+0', food: '', duration: '3 days' }]);
  });

  it('skips notes, empty lines and anything that is not a list — never throws', () => {
    expect(ipdMedicines([
      { admittedAt: day(1), clinical: null },
      { admittedAt: day(2), clinical: { rxItems: 'x' } },
      { admittedAt: day(3), clinical: [] },
      adm(4, [{ drug: 'bed rest', dose: '', instruction: '', duration: '', isNote: true }, line('Tablet. Empty 1 mg', '', '', ''), null, 5]),
    ])).toEqual([]);
  });
});
