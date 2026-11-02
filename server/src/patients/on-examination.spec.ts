import { appendOeEntries, setHxRemoved } from './on-examination';

describe('appendOeEntries — the shared on-examination history', () => {
  const OLD = { date: '20/10/2026', text: 'BP: 120/80 mmHg' }; // written before `by` existed

  it('appends new entries with the author, and keeps every stored entry as stored', () => {
    const next = appendOeEntries([OLD], [{ date: '28/10/2026', text: 'Pulse: 78 b/min' }], 'Dr. Rahim');
    expect(next).toEqual([OLD, { date: '28/10/2026', text: 'Pulse: 78 b/min', by: 'Dr. Rahim' }]);
    expect(next[0]).toBe(OLD); // the old entry is not given an author
  });

  it('does not write the same finding twice on one date, whoever writes it', () => {
    const next = appendOeEntries([OLD], [{ date: '20/10/2026', text: '  bp: 120/80 MMHG ' }], 'Dr. Karim');
    expect(next).toEqual([OLD]);
  });

  it('the same text on another date is another finding', () => {
    expect(appendOeEntries([OLD], [{ date: '28/10/2026', text: OLD.text }], 'A')).toHaveLength(2);
  });

  it('drops blank text and repeats within one request', () => {
    const next = appendOeEntries([], [
      { date: '28/10/2026', text: '   ' },
      { date: '28/10/2026', text: 'Pallor: absent' },
      { date: '28/10/2026', text: 'Pallor: absent' },
    ], 'A');
    expect(next).toEqual([{ date: '28/10/2026', text: 'Pallor: absent', by: 'A' }]);
  });

  it('writes no `by` when there is no name — never an invented one', () => {
    expect(appendOeEntries([], [{ date: '28/10/2026', text: 'x' }], '')).toEqual([{ date: '28/10/2026', text: 'x' }]);
  });

  it('passes through stored values it cannot read, untouched', () => {
    const odd = ['legacy string', null, 7];
    expect(appendOeEntries(odd, [{ date: '28/10/2026', text: 'x' }], 'A')).toEqual([...odd, { date: '28/10/2026', text: 'x', by: 'A' }]);
  });
});

// ⚕️ Disease / Surgical history in the sidebar (sheet 28/10/2026, item 7):
// removal is SOFT, and Undo puts back exactly what was taken off.
describe('setHxRemoved — Disease / Surgical history entries', () => {
  const DM = { date: '20/10/2026', text: 'Disease Hx: DM 01/01/2010' }; // old OE-popup entry, no author
  const DM2 = { date: '28/10/2026', text: 'Disease Hx:  dm 01/01/2010 ', by: 'Dr. A' }; // the same history at a later visit
  const BP = { date: '20/10/2026', text: 'BP: 120/80 mmHg' };
  const CHOLE = { date: '28/10/2026', text: 'Surgical Hx: H/O cholecystectomy', by: 'Dr. A' };
  const AT = { at: '2026-11-02T10:00:00.000Z', by: 'Dr. B' };

  it('marks every copy of the entry removed, and nothing else', () => {
    const { next, changed } = setHxRemoved([DM, BP, DM2, CHOLE], 'disease', 'DM 01/01/2010', AT);
    expect(changed).toBe(2);
    expect(next).toEqual([
      { ...DM, removedAt: AT.at, removedBy: 'Dr. B' }, BP,
      { ...DM2, removedAt: AT.at, removedBy: 'Dr. B' }, CHOLE,
    ]);
    expect(next[1]).toBe(BP);
    expect(next[3]).toBe(CHOLE);
  });

  it('names the kind: a surgical entry is not taken off as a disease one, an examination finding never', () => {
    expect(setHxRemoved([CHOLE], 'disease', 'H/O cholecystectomy', AT).changed).toBe(0);
    expect(setHxRemoved([BP], 'disease', '120/80 mmHg', AT).changed).toBe(0);
    expect(setHxRemoved([BP], 'surgical', 'BP: 120/80 mmHg', AT).changed).toBe(0);
  });

  it('restore takes the mark off — the entry is exactly as it was', () => {
    const removed = setHxRemoved([DM, CHOLE], 'disease', 'dm 01/01/2010', AT).next;
    const { next, changed } = setHxRemoved(removed, 'disease', 'DM 01/01/2010', null);
    expect(changed).toBe(1);
    expect(next).toEqual([DM, CHOLE]);
  });

  it('nothing to do is said (changed 0), not done twice', () => {
    const removed = setHxRemoved([DM], 'disease', 'DM 01/01/2010', AT).next;
    expect(setHxRemoved(removed, 'disease', 'DM 01/01/2010', AT).changed).toBe(0);
    expect(setHxRemoved([DM], 'disease', 'DM 01/01/2010', null).changed).toBe(0);
    expect(setHxRemoved([DM], 'disease', '   ', AT).changed).toBe(0);
  });

  it('passes through stored values it cannot read', () => {
    const odd = ['legacy', null, 7, { text: 5 }];
    expect(setHxRemoved(odd, 'disease', 'x', AT)).toEqual({ next: odd, changed: 0 });
  });

  it('the same words added again after a removal are a new entry, not skipped as already there', () => {
    const removed = setHxRemoved([DM], 'disease', 'DM 01/01/2010', AT).next;
    const next = appendOeEntries(removed, [{ date: DM.date, text: DM.text }], 'Dr. C');
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ ...DM, by: 'Dr. C' });
  });
});
