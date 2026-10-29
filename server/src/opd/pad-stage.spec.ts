import { HISTORY_FIELDS, padStage, PENDING_FIELDS } from './pad-stage';

const TODAY = '2026-10-29';
const draft = (over: Record<string, unknown>) => ({ ptDate: TODAY, ...over });

describe('padStage — what the parked visit says', () => {
  it('is null for nothing, an empty draft, or anything that is not a draft', () => {
    for (const d of [
      null,
      undefined,
      'x',
      5,
      [],
      {},
      draft({}),
      draft({ chiefComplaints: [], note: '  ' }),
    ]) {
      expect(padStage(d, TODAY)).toBeNull();
    }
  });

  it('is "history" when any history field holds text', () => {
    for (const f of HISTORY_FIELDS) {
      expect(padStage(draft({ [f]: ['x'] }), TODAY)).toBe('history');
      expect(padStage(draft({ [f]: 'x' }), TODAY)).toBe('history');
    }
  });

  it('is "pending" when a medicine is written, a pad line is held, or an investigation is entered', () => {
    expect(
      padStage(draft({ rxItems: [{ drug: 'Tablet. Napa 500 mg' }] }), TODAY),
    ).toBe('pending');
    expect(padStage(draft({ rxPadHeld: [{ drug: '' }] }), TODAY)).toBe(
      'pending',
    );
    for (const f of PENDING_FIELDS)
      expect(padStage(draft({ [f]: ['29/10/2026:Hb:11'] }), TODAY)).toBe(
        'pending',
      );
  });

  it('pending wins over history', () => {
    expect(
      padStage(
        draft({ chiefComplaints: ['fever'], rxItems: [{ drug: 'Napa' }] }),
        TODAY,
      ),
    ).toBe('pending');
  });

  it('a blank medicine line is not a medicine', () => {
    expect(
      padStage(draft({ rxItems: [{ drug: '  ', dose: '' }] }), TODAY),
    ).toBeNull();
  });

  it("a draft of another day is not today's visit, and nor is one with no date", () => {
    expect(
      padStage({ ptDate: '2026-10-28', chiefComplaints: ['fever'] }, TODAY),
    ).toBeNull();
    expect(padStage({ chiefComplaints: ['fever'] }, TODAY)).toBeNull();
  });
});
