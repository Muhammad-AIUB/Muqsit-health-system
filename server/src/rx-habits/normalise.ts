// Prescribing-habit matching keys.
//
// ⚕️ THE RULE THAT GOVERNS EVERY FUNCTION HERE:
//    normalisation may fold TYPOGRAPHY, never CLINICAL CONTENT.
//    When in doubt, treat two strings as different — two habit rows the doctor
//    can hide is a nuisance; two medicines folded into one is a patient-safety
//    failure. Never convert a unit, never drop a strength, never round.
//
// The dosage-form vocabulary below is a deliberately small copy of
// `client/src/lib/rxShorthand.ts#FORM_RE`. There is no shared package (the three
// apps install separately), so five entries are duplicated rather than
// twenty-five: the form token is taken STRUCTURALLY (everything up to and
// including the first `.`), and only an abbreviation needs a lookup.

// Bumped whenever anything in this file changes the key or the signature it
// produces. A DoctorRxHabit row whose `algoVersion` is behind this constant was
// built by an older algorithm and is due a rebuild — see
// `server/scripts/rebuild-rx-habits.js`.
export const ALGO_VERSION = 1;

export interface HabitLine {
  dose: string;
  food: string;
  duration: string;
}

// Abbreviation → full word. These five are what the `medicines` table actually
// emits and what doctors free-type ("inj. Halopid", "tab Seclo").
// See client/src/lib/rxShorthand.ts#FORM_RE for the client's larger list.
const FORM_ABBREV: Record<string, string> = {
  tab: 'tablet',
  cap: 'capsule',
  inj: 'injection',
  syp: 'syrup',
  syr: 'syrup',
  susp: 'suspension',
};

// Units that may legitimately be separated from their number by a space in the
// `medicines` table ("500 mg", "3.35 gm/5 ml"). Closing that gap is typography.
// Converting BETWEEN units is not, and is never done here.
const UNIT = '(?:mg|mcg|gm|g|kg|ml|l|iu|u|meq|mmol|%)';

const collapse = (s: string): string => (s ?? '').replace(/\s+/g, ' ').trim();

// "500 mg" → "500mg". Applies to every number/unit pair, so "3.35 gm/5 ml"
// becomes "3.35gm/5ml" consistently however the doctor spaced it.
const closeStrengthGap = (s: string): string =>
  s.replace(new RegExp(`(\\d)\\s+(${UNIT})\\b`, 'g'), '$1$2');

/**
 * Split a lowercased label into its dosage-form token and the rest.
 *
 * The form token is everything up to AND INCLUDING the first `.` — the
 * parenthesised qualifier comes with it, deliberately:
 * `tablet (enteric coated).` must NEVER fold into `tablet.`, and
 * `sc injection.` must never fold into `injection.`. Enteric-coated is not
 * plain, modified-release is not immediate-release, and SC is not IV.
 *
 * Two guards keep a decimal strength from being mistaken for a form:
 * the candidate must contain no digit (so `napa 0.5 mg` has no form) and be at
 * most four words (so a long free-typed sentence is not swallowed).
 *
 * A dot-less leading abbreviation (`tab seclo`, `inj halopid`) is also a form
 * token — design §2 rule 3 lists `tab` / `tab.` → `tablet.` together.
 * A dot-less FULL word (`tablet seclo`) is left alone: the design does not ask
 * for it, and the cost is a second habit row, never a wrong merge.
 */
function splitForm(s: string): { form: string; rest: string } {
  const dot = s.indexOf('.');
  if (dot !== -1) {
    const head = s.slice(0, dot).trim();
    if (head && !/\d/.test(head) && head.split(' ').length <= 4) {
      return { form: `${head}.`, rest: s.slice(dot + 1).trim() };
    }
  }
  const m = s.match(/^([a-z]+)\s+(.*)$/);
  if (m && FORM_ABBREV[m[1]]) return { form: `${m[1]}.`, rest: m[2].trim() };
  return { form: '', rest: s };
}

// Expand ONLY abbreviations inside the form token, wherever they sit
// (`sc inj.` → `sc injection.`, `tab (enteric coated).` → `tablet (…).`).
// Every other word — including the qualifier — is carried through untouched.
function expandForm(form: string): string {
  const body = form.endsWith('.') ? form.slice(0, -1) : form;
  return `${body
    .split(' ')
    .map((w) => FORM_ABBREV[w] ?? w)
    .join(' ')}.`;
}

/**
 * The grouping key for a medicine, INCLUDING its strength.
 * "Tablet. Napa 500mg" and "Tablet. Napa 665mg" are different keys, always.
 *
 * Steps: collapse whitespace → lowercase → expand form abbreviations →
 * close the number/unit gap → drop a trailing `n/a`.
 *
 * The `n/a` drop is the ONE and ONLY normalisation permitted at the strength
 * position: `fmtMedicine` joins the medicines table's `strength` column
 * verbatim, so a medicine with no recorded strength renders as
 * "Tablet. Bicozin N/A" while the same medicine typed by hand renders as
 * "Tablet. Bicozin". `n/a` carries no dose and no unit — it means "strength not
 * recorded". It is dropped from the KEY only; `drugLabel` keeps what was
 * written, and that is what gets inserted into the pad.
 */
export function normaliseDrugKey(label: string): string {
  const s = collapse(label).toLowerCase();
  if (!s) return '';
  const { form, rest } = splitForm(s);
  const name = closeStrengthGap(rest).replace(/\s*\bn\/a$/, '').trim();
  if (!form) return name;
  return name ? `${expandForm(form)} ${name}` : expandForm(form);
}

/**
 * The prefix-search key: `normaliseDrugKey` with the leading form token
 * removed, qualifier included — so `tablet (enteric coated). pantonix 40mg`
 * searches as `pantonix 40mg`. The distinction survives in `drugKey`, which is
 * what groups habits.
 *
 * The same function normalises what the doctor has typed, so `tab napa`,
 * `Tablet. Napa` and `napa` all become `napa` and hit one index.
 */
export function searchKeyOf(label: string): string {
  return splitForm(normaliseDrugKey(label)).rest;
}

// ASCII Unit / Record separators. Chosen because no clinical value contains
// them, so a dose can never be mistaken for a field boundary.
// Written as escapes on purpose — a literal control character in a source file
// is invisible and does not survive every editor or diff tool.
const US = '\u001F'; // ASCII Unit Separator
const RS = '\u001E'; // ASCII Record Separator

/**
 * The uniqueness key for a whole instruction block: the head line's
 * dose/food/duration, then each continuation (`>>>`) line in order.
 *
 * Order is part of the key — a taper that goes 3 → 1 is NOT the same
 * instruction as 1 → 3.
 *
 * Only case and outer whitespace are folded. The pad canonicalises dose/food/
 * duration on blur (`parseDose` / `parseFood` / `parseDuration`), so `101`
 * arrives as `1+0+1`; in the rare case a value reaches the server unblurred it
 * simply forms its own habit row, which the doctor can hide. Do NOT
 * re-implement those parsers here — two copies of clinical shorthand parsing
 * that can drift is a worse hazard than a stray low-count row.
 */
export function signatureOf(head: HabitLine, contLines: HabitLine[] = []): string {
  const line = (l: HabitLine) =>
    [l.dose, l.food, l.duration].map((v) => (v ?? '').trim().toLowerCase()).join(US);
  return [line(head), ...contLines.map(line)].join(RS);
}

/**
 * The in-memory identity of a block: (drugKey, signature) as one string, for
 * Set/Map lookups. Joined with a THIRD separator so no drugKey/signature split
 * can be confused with another — plain concatenation would let ("ab", "c") and
 * ("a", "bc") collide.
 */
export function blockKey(drugKey: string, signature: string): string {
  return `${drugKey}\u001D${signature}`; // ASCII Group Separator
}
