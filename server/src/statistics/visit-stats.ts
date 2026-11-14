// The arithmetic behind Settings → Statistics (physician's sheet, 11/11/2026).
//
// Pure on purpose: no database, no clock. The query (statistics.service.ts)
// decides WHICH visits are seen and which day each belongs to; everything here
// only adds up what it is given, so it can be held in a table of cases.
//
// A day is a Dhaka `yyyy-mm-dd` and a month a `yyyy-mm`: plain text, never a
// Date that a clock or a time zone could move (the OPD queue's own rule,
// `opd/dhaka-day.ts`). Both compare in order as text.

const DAY_MS = 24 * 60 * 60 * 1000;

export type DayCount = { day: string; total: number; seen: number };
export type MonthCount = { month: string; total: number; seen: number };

// The years the app's dates allow (client `parseDateInput`: 1900 to today + 100).
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export function isYearKey(text: unknown): text is string {
  if (typeof text !== 'string' || !/^\d{4}$/.test(text)) return false;
  const y = Number(text);
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

// A real month written `yyyy-mm`. `2026-13` is not one.
export function isMonthKey(text: unknown): text is string {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}$/.test(text)) return false;
  const m = Number(text.slice(5));
  return isYearKey(text.slice(0, 4)) && m >= 1 && m <= 12;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const monthOf = (day: string): string => day.slice(0, 7);

export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5));
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

// Every day of a month, in order — `2028-02` has its 29th.
export function daysOfMonth(month: string): string[] {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${pad2(i + 1)}`);
}

export function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad2(i + 1)}`);
}

const dayMs = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

// Calendar days from `from` to `to`, both included (a closed day counts too).
export function countDaysInclusive(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;
}

// Calendar months from `from` to `to`, both included.
export function countMonthsInclusive(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5)) - Number(from.slice(5))) + 1;
}

// One entry for EVERY day of the month — a day with no visit is 0 and 0, never
// left out, so the chart's days are the month's days. A row of another month is
// not placed anywhere.
export function fillDays(month: string, rows: readonly DayCount[]): DayCount[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return daysOfMonth(month).map((day) => {
    const r = byDay.get(day);
    return { day, total: r?.total ?? 0, seen: r?.seen ?? 0 };
  });
}

export function fillMonths(year: string, rows: readonly MonthCount[]): MonthCount[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthsOfYear(year).map((month) => {
    const r = byMonth.get(month);
    return { month, total: r?.total ?? 0, seen: r?.seen ?? 0 };
  });
}

export type OverallInput = {
  seenTotal: number;
  firstSeenDay: string | null;
  thisMonth: number;
  previousMonth: number;
};

export type Overall = {
  totalVisits: number;
  averageMonthly: number | null;
  averageDaily: number | null;
  thisMonth: number;
  previousMonth: number;
  firstSeenDay: string | null;
  days: number;
  months: number;
  // The Dhaka day these figures were counted on: the screen names "this month"
  // and "previous month" from the SERVER's today, not from a PC clock that may
  // be wrong.
  today: string;
};

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

// ⚕️ The averages are CALENDAR averages (physician, 11/11/2026): the seen visits
// divided by every day — closed days included — from the first seen visit to
// today, and by every month from that visit's month to this one (this month
// included, though it is not over). So a clinic that sits three days a week
// reads lower than its sitting days would show. With nothing seen yet, or a first
// visit dated after today, there is no average: null, never 0 and never a
// division by nothing.
export function overallFigures(input: OverallInput, today: string): Overall {
  const { seenTotal, firstSeenDay } = input;
  const usable = firstSeenDay !== null && firstSeenDay <= today;
  const days = usable ? countDaysInclusive(firstSeenDay, today) : 0;
  const months = usable ? countMonthsInclusive(monthOf(firstSeenDay), monthOf(today)) : 0;
  return {
    totalVisits: seenTotal,
    averageMonthly: months > 0 ? oneDecimal(seenTotal / months) : null,
    averageDaily: days > 0 ? oneDecimal(seenTotal / days) : null,
    thisMonth: input.thisMonth,
    previousMonth: input.previousMonth,
    firstSeenDay,
    days,
    months,
    today,
  };
}

// ── Disease statistics ─────────────────────────────────────────────────

// Two writings of a diagnosis are one when they differ only in capitals and
// spacing — the same fold `drug-advice/keys.ts` gives the `diagnosis` scope, and
// no more. `DM` and `Diabetes mellitus`, `DM` and `T2DM`, `CKD stage 3` and
// `CKD stage 4` stay apart: which names mean the same disease is the physician's
// to say, not something to guess in a count.
export function foldDiagnosis(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export type DiagnosisLine = { patientId: string; name: string; createdAt: Date };
export type DiagnosisCount = { name: string; patients: number };

// How many DIFFERENT patients have each final diagnosis on a prescription
// (physician, 11/11/2026: "joto patient er prescription er final diagnosis").
// A patient with DM on five prescriptions is one; a patient who has both `dm` and
// `DM` is one. The name shown is the wording of the newest prescription that
// carries it, as written. Most patients first, then A to Z by the folded name.
export function rankDiagnoses(lines: readonly DiagnosisLine[]): DiagnosisCount[] {
  const groups = new Map<string, { name: string; at: number; patients: Set<string> }>();
  for (const line of lines) {
    const key = foldDiagnosis(line.name);
    if (!key) continue;
    const at = line.createdAt.getTime();
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { name: line.name.trim(), at, patients: new Set([line.patientId]) });
      continue;
    }
    g.patients.add(line.patientId);
    if (at > g.at) {
      g.name = line.name.trim();
      g.at = at;
    }
  }
  return Array.from(groups.entries())
    .sort(([ka, a], [kb, b]) => b.patients.size - a.patients.size || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([, g]) => ({ name: g.name, patients: g.patients.size }));
}
