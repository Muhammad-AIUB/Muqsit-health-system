import { blockEditProblem, findBlock } from './drug-history-edit';

// The cases of `client/src/lib/drugCourse.ts#rewriteCourse` that decide what may be
// changed — the same table is in `drugCourse.test.ts`. Edit one, edit both.
const HEAD = '06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days';
const CONT = '06/11/2026(cont): 2+1+0 — After meal — 5 days';

describe('blockEditProblem — what may replace a stored block', () => {
  it('allows a new date on every line and a new duration', () => {
    expect(blockEditProblem(
      [HEAD, CONT],
      ['08/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 7 days', '08/11/2026(cont): 2+1+0 — After meal — 3 days'],
    )).toBeNull();
  });

  it('allows a duration alone, and an empty one', () => {
    expect(blockEditProblem([HEAD], ['06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 7 days'])).toBeNull();
    expect(blockEditProblem([HEAD], ['06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — '])).toBeNull();
  });

  it('allows a line stored with fewer cells to gain the missing blank ones and a duration', () => {
    expect(blockEditProblem(['06/11/2026: Tablet. A 5 mg'], ['06/11/2026: Tablet. A 5 mg —  —  — 3 days'])).toBeNull();
  });

  it('allows the no-date marker to be given a real date', () => {
    expect(blockEditProblem(['01/01/2000: Tablet. A 5 mg — 1+0+1 —  — 7 days'], ['03/11/2026: Tablet. A 5 mg — 1+0+1 —  — 7 days'])).toBeNull();
  });

  it.each([
    ['a changed name', '06/11/2026: Tablet. Prednisolone 20 mg — 2+2+0 — After meal — 5 days'],
    ['a changed dose', '06/11/2026: Tablet. Prednisolone 10 mg — 1+1+0 — After meal — 5 days'],
    ['a changed food', '06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — Before meal — 5 days'],
    ['a medicine turned into a note', '06/11/2026(note): Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days'],
    ['a medicine turned into a taper', '06/11/2026(cont): 2+2+0 — After meal — 5 days'],
    ['a duration holding the cell separator', '06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 — days'],
    ['a date not on the calendar', '31/02/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days'],
    ['a year outside the years the app accepts', '06/11/1850: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days'],
    ['a line not in the dd/mm/yyyy format', 'Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days'],
    ['a line break in the duration', '06/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5\ndays'],
  ])('refuses %s', (_why, to) => {
    expect(blockEditProblem([HEAD], [to])).not.toBeNull();
  });

  it('refuses a block that gains or loses a line, or a block of nothing', () => {
    expect(blockEditProblem([HEAD], [HEAD, CONT])).not.toBeNull();
    expect(blockEditProblem([HEAD, CONT], [HEAD])).not.toBeNull();
    expect(blockEditProblem([], [])).not.toBeNull();
    expect(blockEditProblem('x', 'y')).not.toBeNull();
  });

  it('refuses to touch a note, an older Current:/Past: line, or a taper with no medicine above it', () => {
    const note = '06/11/2026(note): Insulin as before';
    expect(blockEditProblem([note], [note])).not.toBeNull();
    expect(blockEditProblem(['Current: Tablet. A 5 mg — 1+0+1 —  — 7 days'], ['Current: Tablet. A 5 mg — 1+0+1 —  — 5 days'])).not.toBeNull();
    expect(blockEditProblem([CONT], [CONT])).not.toBeNull();
  });

  it('a taper must move with its medicine: one date for the whole block', () => {
    expect(blockEditProblem(
      [HEAD, CONT],
      ['08/11/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days', '09/11/2026(cont): 2+1+0 — After meal — 5 days'],
    )).not.toBeNull();
  });

  it('a medicine followed by a line that is not a taper is not a block', () => {
    expect(blockEditProblem([HEAD, HEAD], [HEAD, HEAD])).not.toBeNull();
  });
});

describe('findBlock', () => {
  const list = ['x', HEAD, CONT, 'y', HEAD, 'z'];
  it('finds the first place the whole block stands, in order', () => {
    expect(findBlock(list, [HEAD, CONT])).toBe(1);
    expect(findBlock(list, [HEAD])).toBe(1);
  });
  it('does not find a block that is only part of what stands there, or out of order', () => {
    expect(findBlock(list, [CONT, HEAD])).toBe(-1);
    expect(findBlock(list, [HEAD, 'y'])).toBe(-1);
    expect(findBlock([HEAD], [HEAD, CONT])).toBe(-1);
  });
  it('compares text exactly: a changed character, or a value that is not a string, is not it', () => {
    expect(findBlock([HEAD.replace('5 days', '5 day')], [HEAD])).toBe(-1);
    expect(findBlock([{ a: 1 }, null, 7], [HEAD])).toBe(-1);
  });
});
