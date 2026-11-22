import {
  ageFromDob,
  ageOf,
  CODE_DIGITS,
  codeMessage,
  hashCode,
  maskMobile,
  NAME_MAX,
  newCode,
  readCode,
  sameHash,
} from './code';

// ⚕️ The patient's own code (16/11/2026) — the pure parts. What the database and
// the SMS do with it is pinned in test/patient-access.int-spec.ts.

describe('newCode', () => {
  it('is always exactly six digits, leading zeros kept', () => {
    for (let i = 0; i < 3000; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it('pads a small number to six digits ("000042", not "42")', () => {
    jest.isolateModules(() => {
      jest.doMock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: () => 42 }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('./code') as typeof import('./code');
      expect(fresh.newCode()).toBe('000042');
      expect(fresh.newCode()).toHaveLength(fresh.CODE_DIGITS);
    });
    jest.dontMock('crypto');
  });

  it('is not the same code every time (the generator is random, not a constant)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newCode()));
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe('readCode — what the doctor typed, as a code', () => {
  it.each([
    ['482913', '482913'],
    [' 482913 ', '482913'],
    ['482 913', '482913'],
    ['482 913', '482913'], // a non-breaking space from a pasted message
    ['\t482913\n', '482913'],
    ['000042', '000042'], // leading zeros are part of the code
  ])('%j reads as %j', (typed, code) => {
    expect(readCode(typed)).toBe(code);
  });

  it.each([
    [''],
    ['   '],
    ['48291'], // one short
    ['4829133'], // one long
    ['48291a'],
    ['abc123'],
    ['482-913'], // punctuation is not guessed away
    ['৪৮২৯১৩'], // Bangla digits are not read as the SMS's digits
    ['Your code is 482913'], // a pasted sentence is not a code
    [null],
    [undefined],
    [482913], // a number, not what was typed
    [{ code: '482913' }],
  ])('%j is not a code', (typed) => {
    expect(readCode(typed)).toBeNull();
  });

  it('the length it asks for is the length it makes', () => {
    expect(readCode('1'.repeat(CODE_DIGITS))).not.toBeNull();
    expect(newCode()).toHaveLength(CODE_DIGITS);
  });
});

describe('hashCode / sameHash', () => {
  const S = 'secret-a';
  const h = hashCode(S, 'p1', 'd1', '482913');

  it('is a stable 64-character hex string, and is not the code', () => {
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashCode(S, 'p1', 'd1', '482913'));
    expect(h).not.toContain('482913');
  });

  it('names the patient, the practice and the code: change any one and it differs', () => {
    expect(hashCode(S, 'p2', 'd1', '482913')).not.toBe(h);
    expect(hashCode(S, 'p1', 'd2', '482913')).not.toBe(h);
    expect(hashCode(S, 'p1', 'd1', '482914')).not.toBe(h);
  });

  it('is keyed: the same inputs under another secret differ (the table alone gives no codes back)', () => {
    expect(hashCode('secret-b', 'p1', 'd1', '482913')).not.toBe(h);
  });

  it('a value that joins differently is not the same: "p1:d" + "1" is not "p1" + "d1"', () => {
    expect(hashCode(S, 'p1:d', '1', '482913')).not.toBe(hashCode(S, 'p1', 'd:1', '482913'));
  });

  it('compares equal hashes as equal and anything else — including another length — as not', () => {
    expect(sameHash(h, hashCode(S, 'p1', 'd1', '482913'))).toBe(true);
    expect(sameHash(h, hashCode(S, 'p1', 'd1', '000000'))).toBe(false);
    expect(sameHash(h, h.slice(0, 63))).toBe(false);
    expect(sameHash(h, '')).toBe(false);
    expect(sameHash('', '')).toBe(true);
  });
});

describe('maskMobile', () => {
  it('keeps the first three and the last three', () => {
    expect(maskMobile('01712345678')).toBe('017*****678');
  });
  it('never returns the whole number', () => {
    expect(maskMobile('01712345678')).not.toContain('12345');
  });
  it('a short or odd value is hidden, not returned', () => {
    expect(maskMobile('12345')).toBe('*****');
    expect(maskMobile('')).toBe('');
    expect(maskMobile('0171234')).toBe('017*234');
  });
  it('ignores spaces', () => {
    expect(maskMobile('017 1234 5678')).toBe('017*****678');
  });
});

describe('ageOf — a COPY of client/src/lib/age.ts (DOB wins; a manual age ticks up a year)', () => {
  const NOW = new Date(2026, 10, 16); // 16 Nov 2026 (local)
  const p = (over: Partial<{ dob: Date | null; age: number | null; ageAsOfYear: number | null }>) => ({
    dob: null, age: null, ageAsOfYear: null, ...over,
  });

  it('DOB wins over a manual age', () => {
    expect(ageOf(p({ dob: new Date(1990, 0, 1), age: 99, ageAsOfYear: 2020 }), NOW)).toBe(36);
  });
  it('a birthday not yet reached this year is not counted', () => {
    expect(ageOf(p({ dob: new Date(1990, 11, 25) }), NOW)).toBe(35);
    expect(ageOf(p({ dob: new Date(1990, 10, 16) }), NOW)).toBe(36); // today IS the birthday
    expect(ageOf(p({ dob: new Date(1990, 10, 17) }), NOW)).toBe(35); // tomorrow
  });
  it('a DOB in the future is not an age (and the manual age is used)', () => {
    expect(ageFromDob(new Date(2027, 0, 1), NOW)).toBeNull();
    expect(ageOf(p({ dob: new Date(2027, 0, 1), age: 40, ageAsOfYear: 2026 }), NOW)).toBe(40);
  });
  it('an invalid date is not an age', () => {
    expect(ageFromDob(new Date('nope'), NOW)).toBeNull();
    expect(ageFromDob(null, NOW)).toBeNull();
  });
  it('a manual age ticks up by one for each year since it was recorded (53 in 2024 → 55 in 2026)', () => {
    expect(ageOf(p({ age: 53, ageAsOfYear: 2024 }), NOW)).toBe(55);
    expect(ageOf(p({ age: 53, ageAsOfYear: 2026 }), NOW)).toBe(53);
  });
  it('a manual age with no base year is shown as it is; none at all is no age', () => {
    expect(ageOf(p({ age: 53, ageAsOfYear: null }), NOW)).toBe(53);
    expect(ageOf(p({ age: 53, ageAsOfYear: 0 }), NOW)).toBe(53);
    expect(ageOf(p({}), NOW)).toBeNull();
  });
  it('a base year so far ahead that it would give a negative age falls back to the age as recorded (as the client)', () => {
    expect(ageOf(p({ age: 5, ageAsOfYear: 2040 }), NOW)).toBe(5);
  });
  it('age 0 (a newborn recorded by hand) is an age, not "unknown"', () => {
    expect(ageOf(p({ age: 0, ageAsOfYear: 2026 }), NOW)).toBe(0);
  });
});

describe('codeMessage — what the patient reads', () => {
  it('carries the code, the doctor and what it opens', () => {
    const m = codeMessage('482913', 'Dr. Rahman');
    expect(m).toContain('482913');
    expect(m).toContain('Dr. Rahman');
    expect(m).toContain('health record');
    expect(m).toContain('10 minutes');
  });
  it('is one GSM-7 message (160) for an ordinary Latin name', () => {
    expect(codeMessage('482913', 'Dr. Md. Tanvir Ahmed').length).toBeLessThanOrEqual(160);
  });
  it('a name cannot add a line or a control character to the message', () => {
    const m = codeMessage('482913', 'Dr X\r\nYour bank PIN is\u0007 1234');
    expect(m).not.toMatch(/[\r\n\u0000-\u001f]/);
  });
  it('a name is cut at the limit, never longer', () => {
    const m = codeMessage('482913', 'A'.repeat(500));
    expect(m).toContain('A'.repeat(NAME_MAX));
    expect(m).not.toContain('A'.repeat(NAME_MAX + 1));
  });
  it('no name is "the doctor", never a blank or "undefined"', () => {
    expect(codeMessage('482913', '   ')).toContain('lets the doctor open');
    expect(codeMessage('482913', '')).not.toContain('undefined');
  });
  it('a Bangla name is carried as written', () => {
    expect(codeMessage('482913', 'ডা. রহমান')).toContain('ডা. রহমান');
  });
});
