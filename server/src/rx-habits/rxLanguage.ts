// ⚕️ A ℞ dose / food / duration cell written in Bangla, read back as the
// English the app writes for it — so that `খাবারের আগে` and `Before meal` are
// ONE instruction to the habit key (`signatureOf`), and a dose a doctor
// prescribes in BAN and in EN is one habit with one distinct-patient count.
//
// This is a COPY of the English-writing half of
// `client/src/lib/rxLanguage.ts#rxCellIn(text, "en")` — there is no shared
// package, the three apps install separately. The table is the physician's own
// (2026-10-14), word for word. The two copies are pinned by the SAME literal
// table in `normalise.spec.ts` and `client/src/lib/rxLanguage.test.ts`: edit one,
// edit both, and only on the physician's say-so.
//
// What it does NOT do, on purpose:
//   - it never touches a cell that has no Bangla in it (an English cell is
//     returned exactly as it came — every habit already learned keeps its key);
//   - it never guesses: a cell the table does not cover is returned as typed;
//   - it converts nothing but the physician's phrases and the digits of a number
//     (a decimal point stays a point: `০.৫` is `0.5`, never `5`).

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toEnDigits = (s: string): string =>
  s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

// The Bengali block, digits included.
const HAS_BANGLA = /[ঀ-৿]/;

// Shared by every phrase, so two of them can never spell a word differently.
const MEAL_BN = 'খাবারের';
const HOUR_BN = 'ঘণ্টা';

type Fixed = 'before' | 'after' | 'with' | 'night' | 'continue';
// The English the pad itself writes (`parseFood`, `parseDuration`).
const FIXED_EN: Record<Fixed, string> = {
  before: 'Before meal',
  after: 'After meal',
  with: 'With food',
  night: 'at night',
  continue: 'Continue',
};
const FIXED_BN: Record<Fixed, string> = {
  before: `${MEAL_BN} আগে`,
  after: `${MEAL_BN} পরে`,
  with: `${MEAL_BN} সাথে`,
  night: 'রাতে',
  continue: 'চলবে',
};

type When = 'before' | 'after' | 'either';
const WHEN_EN: Record<When, string> = {
  before: 'before meal',
  after: 'after meal',
  either: 'before or after meal',
};

type Unit = 'day' | 'week' | 'month';
const UNIT_EN: Record<Unit, string> = { day: 'days', week: 'week', month: 'month' };

type Canon =
  | { k: 'fixed'; v: Fixed }
  | { k: 'hr'; when: When; n: string }
  | { k: 'dur'; unit: Unit; n: string }
  | { k: 'num'; text: string };

const N = '(\\d+(?:\\.\\d+)?)';
const HR_EN = new RegExp(`^${N} ?hrs? (before or after|before|after) meal$`);
const HR_BN = new RegExp(`^${MEAL_BN} ${N} ${HOUR_BN} (আগে বা পরে|আগে|পরে)$`);
const DUR_EN = new RegExp(`^${N} ?(days?|weeks?|months?)$`);
const DUR_BN = new RegExp(`^${N} ?(দিন|সপ্তাহ|মাস)$`);
// A dose written as counts: digits, `+`, `/`, `.` and spaces, nothing else.
const SCHEDULE = /^[\d.+/ ]+$/;

function read(raw: string): Canon | null {
  // Digits are read in either script, so a half-converted cell is understood.
  const t = toEnDigits(raw.trim());
  if (!t) return null;
  if (SCHEDULE.test(t) && /\d/.test(t)) return { k: 'num', text: t };
  const s = t.replace(/\s+/g, ' ');
  const low = s.toLowerCase();
  for (const v of Object.keys(FIXED_EN) as Fixed[]) {
    if (low === FIXED_EN[v].toLowerCase() || s === FIXED_BN[v]) return { k: 'fixed', v };
  }
  let m = HR_EN.exec(low);
  if (m) {
    return { k: 'hr', n: m[1], when: m[2] === 'before' ? 'before' : m[2] === 'after' ? 'after' : 'either' };
  }
  m = HR_BN.exec(s);
  if (m) {
    return { k: 'hr', n: m[1], when: m[2] === 'আগে' ? 'before' : m[2] === 'পরে' ? 'after' : 'either' };
  }
  m = DUR_EN.exec(low);
  if (m) {
    return {
      k: 'dur',
      n: m[1],
      unit: m[2].startsWith('day') ? 'day' : m[2].startsWith('week') ? 'week' : 'month',
    };
  }
  m = DUR_BN.exec(s);
  if (m) {
    return {
      k: 'dur',
      n: m[1],
      unit: m[2] === 'দিন' ? 'day' : m[2] === 'সপ্তাহ' ? 'week' : 'month',
    };
  }
  return null;
}

function writeEnglish(c: Canon): string {
  if (c.k === 'fixed') return FIXED_EN[c.v];
  if (c.k === 'hr') return `${c.n} hr ${WHEN_EN[c.when]}`;
  if (c.k === 'dur') return `${c.n} ${UNIT_EN[c.unit]}`;
  return c.text;
}

/**
 * One ℞ cell, in English. A cell with no Bangla in it — and any cell the
 * physician's table does not cover — is returned exactly as it was written.
 */
export function cellInEnglish(text: string | null | undefined): string {
  const s = text ?? '';
  if (!HAS_BANGLA.test(s)) return s;
  const c = read(s);
  return c ? writeEnglish(c) : s;
}
