import { appendOeEntries } from './on-examination';

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
