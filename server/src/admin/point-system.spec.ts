import {
  checkScores,
  isPointValue,
  POINT_CRITERIA,
  POINT_MAX,
  POINT_MIN,
  readStoredScores,
} from './point-system';

// The admin's Point system (physician's sheet, 16/11/2026): ten criteria, a whole
// number from 1 to 10 each, kept as typed.

describe('the ten criteria', () => {
  it("are the sheet's, word for word and in its order", () => {
    expect(POINT_CRITERIA.map((c) => c.label)).toEqual([
      'Integrity and honesty',
      'Academic knowledge',
      'Clinical competence',
      'Communication',
      'Professionalism',
      'Empathy and behaviour',
      'Clinical maturity',
      'Teamwork and leadership',
      'Accountability',
      'Financial ethics',
    ]);
  });
  it('are ten, each with its own key', () => {
    expect(POINT_CRITERIA).toHaveLength(10);
    expect(new Set(POINT_CRITERIA.map((c) => c.key)).size).toBe(10);
  });
  it('run from 1 to 10', () => {
    expect([POINT_MIN, POINT_MAX]).toEqual([1, 10]);
  });
});

describe('isPointValue', () => {
  it.each([1, 2, 5, 9, 10])('%p is a score', (v) => expect(isPointValue(v)).toBe(true));
  it.each([0, -1, 11, 100, 7.5, 0.5, 10.0001, NaN, Infinity, -Infinity, '7', '', null, undefined, true, [], {}])(
    '%p is not a score',
    (v) => expect(isPointValue(v)).toBe(false),
  );
});

describe('checkScores — what the admin sent, as the set that is kept', () => {
  it('all ten at the two ends of the range are kept exactly', () => {
    const lo = Object.fromEntries(POINT_CRITERIA.map((c) => [c.key, 1]));
    const hi = Object.fromEntries(POINT_CRITERIA.map((c) => [c.key, 10]));
    expect(checkScores(lo)).toEqual({ ok: true, scores: lo });
    expect(checkScores(hi)).toEqual({ ok: true, scores: hi });
  });

  it('a criterion left out, or null, is cleared — not 0', () => {
    expect(checkScores({ integrity: 8, academic: null })).toEqual({ ok: true, scores: { integrity: 8 } });
    expect(checkScores({})).toEqual({ ok: true, scores: {} });
  });

  it.each([
    [{ integrity: 0 }, 'Integrity and honesty must be a whole number from 1 to 10.'],
    [{ academic: 11 }, 'Academic knowledge must be a whole number from 1 to 10.'],
    [{ clinical: 7.5 }, 'Clinical competence must be a whole number from 1 to 10.'],
    [{ communication: '7' }, 'Communication must be a whole number from 1 to 10.'],
    [{ professionalism: -3 }, 'Professionalism must be a whole number from 1 to 10.'],
    [{ empathy: NaN }, 'Empathy and behaviour must be a whole number from 1 to 10.'],
    [{ maturity: true }, 'Clinical maturity must be a whole number from 1 to 10.'],
    [{ teamwork: '' }, 'Teamwork and leadership must be a whole number from 1 to 10.'],
    [{ accountability: [] }, 'Accountability must be a whole number from 1 to 10.'],
    [{ financial: {} }, 'Financial ethics must be a whole number from 1 to 10.'],
  ])('%j is refused, naming the criterion', (input, problem) => {
    expect(checkScores(input)).toEqual({ ok: false, problem });
  });

  it('a criterion that is not one of the ten is refused, never kept', () => {
    expect(checkScores({ honesty: 5 })).toEqual({ ok: false, problem: '"honesty" is not one of the ten criteria.' });
    // an OWN key named __proto__ (what JSON.parse makes of it) is not a criterion either
    expect(checkScores(JSON.parse('{"__proto__": 5}'))).toEqual({ ok: false, problem: '"__proto__" is not one of the ten criteria.' });
    expect(checkScores({ constructor: 5 })).toEqual({ ok: false, problem: '"constructor" is not one of the ten criteria.' });
  });

  it('one bad value refuses the whole save — nothing is half kept', () => {
    const r = checkScores({ integrity: 9, academic: 99 });
    expect(r.ok).toBe(false);
  });

  it.each([[null], [undefined], ['7'], [7], [[1, 2]], [true]])('%p is not a set of scores', (input) => {
    expect(checkScores(input)).toEqual({ ok: false, problem: 'Send the scores as an object: { criterion: value }.' });
  });

  it('does not change what it was given and returns a set of its own', () => {
    const input = { integrity: 4 };
    const r = checkScores(input);
    expect(input).toEqual({ integrity: 4 });
    if (r.ok) expect(r.scores).not.toBe(input);
  });
});

describe('readStoredScores — the stored set, read for display', () => {
  it('returns the ten as stored', () => {
    expect(readStoredScores({ integrity: 8, financial: 10 })).toEqual({ integrity: 8, financial: 10 });
  });
  it('leaves out what is not a criterion or not a score — never throws', () => {
    expect(readStoredScores({ integrity: 8, honesty: 5, academic: 0, clinical: 'x', communication: 7.5 })).toEqual({ integrity: 8 });
  });
  it.each([[null], [undefined], [[]], ['{}'], [5], [true]])('%p reads as nothing scored', (stored) => {
    expect(readStoredScores(stored)).toEqual({});
  });
  it('an empty set is an empty set (nobody is scored 0)', () => {
    expect(readStoredScores({})).toEqual({});
  });
});
