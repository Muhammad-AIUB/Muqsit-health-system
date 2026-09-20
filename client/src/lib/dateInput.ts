// Flexible DD/MM/YY date entry. The doctor can type the 6-digit shorthand DDMMYY
// (e.g. 030626 → 03/06/2026), or a slashed date (03/06/26, 3-6-2026). Stored
// internally as ISO "YYYY-MM-DD".

// How far ahead a given kind of date may legitimately point. A 2-digit year that
// lands beyond this is read as the previous century, not the next one.
export const YEAR_POLICY = {
  /** Birth dates, LMP, scan dates — the event has already happened. */
  past: 0,
  /** Visit dates, findings, timeline bars — a follow-up may be years out. */
  clinical: 5,
} as const;

// Sliding century window. Anchored on the current year, so it keeps working past
// 2099 instead of baking 2000 in: `030398` under the `past` policy resolves to
// 1998 on any date in 2026, because 2098 is far beyond the allowance.
export function resolveTwoDigitYear(
  yy: number,
  futureAllowanceYears: number,
  now = new Date(),
): number {
  const nowY = now.getFullYear();
  const year = Math.floor(nowY / 100) * 100 + yy;
  return year > nowY + futureAllowanceYears ? year - 100 : year;
}

// Sanity bounds, independent of the century policy above. The policy only decides
// which century an AMBIGUOUS 2-digit year belongs to; these catch a year that is
// not a plausible date at all, however it was typed. `03/03/998` used to sail
// through as year 998 — an age of 1028, printed verbatim onto a prescription
// (prescriptionDoc prints the date string as-is).
//
// 1900 is the floor the health-trend chart already uses. The ceiling is a
// century ahead: generous enough that no real clinical date can trip it, tight
// enough to catch 9998.
const MIN_YEAR = 1900;
const MAX_YEARS_AHEAD = 100;

// A bare null cannot say WHY the input failed, and the field has to tell "that is
// not a date" apart from "a birth date cannot be in the future".
export type DateParseResult =
  | { ok: true; iso: string }
  | { ok: false; reason: "malformed" | "future" };

// Local midnight today. Calendar days, never instants: doctors are in Bangladesh
// (UTC+6) while the server may run UTC, and an instant comparison would reject a
// same-day birth date for several hours each night.
function startOfToday(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function parseDateInput(
  input: string,
  futureAllowanceYears: number = YEAR_POLICY.clinical,
  now = new Date(),
): DateParseResult {
  const s = input.trim();
  if (!s) return { ok: false, reason: "malformed" };
  let dd: number, mm: number, yy: number;

  if (/[/.\-]/.test(s)) {
    const parts = s.split(/[/.\-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) return { ok: false, reason: "malformed" };
    dd = +parts[0]; mm = +parts[1];
    const y = +parts[2];
    // A year typed in full is taken at face value — only a 2-digit year is
    // ambiguous enough to need the century window.
    yy = y < 100 ? resolveTwoDigitYear(y, futureAllowanceYears, now) : y;
  } else {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 6) {
      dd = +digits.slice(0, 2); mm = +digits.slice(2, 4);
      yy = resolveTwoDigitYear(+digits.slice(4, 6), futureAllowanceYears, now);
    } else if (digits.length === 8) {
      dd = +digits.slice(0, 2); mm = +digits.slice(2, 4); yy = +digits.slice(4, 8);
    } else {
      return { ok: false, reason: "malformed" };
    }
  }

  if (!dd || !mm || dd > 31 || mm > 12 || Number.isNaN(yy)) return { ok: false, reason: "malformed" };
  if (yy < MIN_YEAR || yy > now.getFullYear() + MAX_YEARS_AHEAD) return { ok: false, reason: "malformed" };
  // Reject impossible calendar dates (31 Apr, 30 Feb, …): a rebuilt Date whose
  // components don't round-trip means the day overflowed into the next month.
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
    return { ok: false, reason: "malformed" };
  }

  // The year window alone is not enough when nothing in the future is allowed:
  // on 27 Jul 2026, `031226` resolves to 2026, which is still a future birth
  // date. Say so rather than silently guessing 1926 — a genuine 1926 date is
  // typed in full as 03/12/1926.
  if (futureAllowanceYears === 0 && dt.getTime() > startOfToday(now)) {
    return { ok: false, reason: "future" };
  }

  return { ok: true, iso: `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` };
}

// Unchanged signature and semantics — existing call sites keep working.
export function parseFlexibleDate(
  input: string,
  futureAllowanceYears: number = YEAR_POLICY.clinical,
): string | null {
  const r = parseDateInput(input, futureAllowanceYears);
  return r.ok ? r.iso : null;
}

// Is this stored date too far ahead to be real? Nullable on purpose: call sites
// feed it from parses that can fail, and "we could not read this date" is a
// different claim from "this date is wrong". Unreadable dates keep their existing
// dropped-and-counted treatment; they never get a marker here.
export function isImplausibleDate(
  d: Date | null | undefined,
  futureAllowanceYears: number,
  now = new Date(),
): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  const limit = new Date(now.getFullYear() + futureAllowanceYears, now.getMonth(), now.getDate());
  return d.getTime() > limit.getTime();
}

// ISO "2026-06-03" → "03/06/2026". Returns the input unchanged if not ISO.
export function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * `dd/mm/yyyy` → epoch milliseconds at local midnight. 0 when the string is not
 * a well-formed dd/mm/yyyy.
 *
 * ⚕️ THE one place this conversion lives. It was copied into eight files, each
 * written slightly differently, and two screens disagreeing about which of two
 * findings is newer is a real hazard in this app — the whole Health-trend chart,
 * the investigation summary, the drug-history ranges and the printed sheet's
 * ordering all hang off it.
 *
 * Milliseconds, not a `yyyymmdd` sort key, because three callers do real time
 * ARITHMETIC with the result and not just comparison: `rxAlerts` divides a
 * difference by 86_400_000 to get days, `DrugHistoryField` compares against
 * `Date.now()`, and `investigationSummary.filterByDate` is handed epoch bounds
 * from a date picker.
 *
 * Built from the three integers, never `new Date(str)` — JS reads a slashed date
 * as month/day/year, so `new Date("25/07/2026")` is Invalid Date and
 * `new Date("03/06/2026")` is silently 6 March (root CLAUDE.md).
 *
 * Deliberately LENIENT about the calendar, matching the seven call sites this
 * replaced: `31/06/2026` rolls over to 1 July rather than failing. The one
 * caller that must reject a rolled-over date does its own round-trip check —
 * see `ddmmyyyyMs` in `lib/rxAlerts.ts`, which is a stricter, NaN-returning
 * variant kept separate on purpose.
 *
 * A malformed value returns 0, which sorts older than every real clinical date,
 * so a junk entry lands at the end of a newest-first list instead of the top.
 */
export function ddmmyyyyMs(d: unknown): number {
  if (typeof d !== "string") return 0;
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 0;
  const t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * `dd/mm/yyyy` → epoch milliseconds, or **NaN** when the string is not a real
 * calendar date. The strict sibling of `ddmmyyyyMs`.
 *
 * ⚕️ Use this wherever an unreadable date must be DROPPED rather than placed:
 *  • `HealthTrendsChart` plots on a shared time axis. When its parser returned 0
 *    for junk, ONE malformed record stretched the axis across 126 years and
 *    squeezed every real value into a couple of pixels.
 *  • `rxAlerts` divides a difference by 86_400_000 to decide whether a drug is
 *    one the patient is CURRENTLY on. An epoch-zero stamp would compute a
 *    ~56-year gap and silence an alert that should fire.
 *
 * It also REFUSES a rolled-over date: `new Date(2026, 1, 31)` is 3 March, and
 * drawing `31/02/2026` there would present a date the record never held.
 *
 * `ddmmyyyyMs` above is the LENIENT one, for ordering — there, junk must simply
 * sort last, and dropping a finding off a printed list would be far worse than
 * placing it at the bottom.
 */
export function ddmmyyyyMsStrict(d: unknown): number {
  if (typeof d !== "string") return NaN;
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return NaN;
  const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
  const dt = new Date(yy, mm - 1, dd);
  const real = dt.getFullYear() === yy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
  return real ? dt.getTime() : NaN;
}
