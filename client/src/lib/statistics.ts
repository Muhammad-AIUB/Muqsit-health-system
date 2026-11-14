// The pure parts of Settings → Statistics (physician's sheet, 11/11/2026): which
// month or year comes next, the scale a chart is drawn on, and the check that an
// answer IS what the chart expects. Nothing here asks the browser to write a
// date or a number in its own locale (`toLocale…` answers differently on every
// machine — root CLAUDE.md): months are named from a table, a count is `String`,
// an average is `toFixed(1)`.

import { monthTitle, shiftMonth, type MonthRef } from "./opdDay";
import type { StatsDays, StatsDiagnosis, StatsMonths, StatsOverall } from "./api";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const refOf = (key: string): MonthRef => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) - 1 });
const keyOf = (ref: MonthRef): string => `${ref.year}-${String(ref.month + 1).padStart(2, "0")}`;

/** `2026-11` moved by `delta` months. */
export const shiftMonthKey = (key: string, delta: number): string => keyOf(shiftMonth(refOf(key), delta));
/** `2026` moved by `delta` years. */
export const shiftYearKey = (year: string, delta: number): string => String(Number(year) + delta);
/** `2026-11` → `November 2026`. */
export const monthCaption = (key: string): string => monthTitle(refOf(key));
/** `2026-09` → `Sep`. */
export const shortMonth = (key: string): string => SHORT[Number(key.slice(5, 7)) - 1] ?? "";
/** `2026-11-03` → `3`. */
export const dayNumber = (day: string): string => String(Number(day.slice(8, 10)));

// An average to one decimal place; no average (nobody seen yet) is a dash, never 0.
export const averageText = (n: number | null): string => (n === null ? "—" : n.toFixed(1));

// The scale of a bar chart: from 0, whole numbers only (a count of patients),
// four steps, the top the first tidy value at or above the biggest bar. A
// chart of zeros still has a scale to stand on.
export function axisFor(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const STEPS = 4;
  const raw = Math.max(1, Math.ceil(max / STEPS));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw / magnitude) * magnitude;
  // keep four whole steps: widen the step until four of them cover the biggest bar
  let step = nice;
  while (step * STEPS < max) step += magnitude;
  return { top: step * STEPS, ticks: Array.from({ length: STEPS + 1 }, (_, i) => i * step) };
}

// ── What an answer must be before it is read ───────────────────────────
// A reader that never throws turns an empty body or a hospital Wi-Fi's sign-in
// page into a chart of nothing — "no patients". These throw, and the screen says
// the numbers could not be loaded.

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const isAverage = (x: unknown): x is number | null => x === null || isCount(x);
const fail = (what: string): never => {
  throw new Error(`not ${what}`);
};

export function readDays(x: unknown): StatsDays {
  if (!isObject(x) || typeof x.month !== "string" || !Array.isArray(x.days)) return fail("the day counts");
  for (const d of x.days) {
    if (!isObject(d) || typeof d.day !== "string" || !isCount(d.total) || !isCount(d.seen)) return fail("the day counts");
  }
  return x as unknown as StatsDays;
}

export function readMonths(x: unknown): StatsMonths {
  if (!isObject(x) || typeof x.year !== "string" || !Array.isArray(x.months)) return fail("the month counts");
  for (const m of x.months) {
    if (!isObject(m) || typeof m.month !== "string" || !isCount(m.total) || !isCount(m.seen)) return fail("the month counts");
  }
  return x as unknown as StatsMonths;
}

export function readOverall(x: unknown): StatsOverall {
  if (
    !isObject(x) ||
    !isCount(x.totalVisits) || !isAverage(x.averageMonthly) || !isAverage(x.averageDaily) ||
    !isCount(x.thisMonth) || !isCount(x.previousMonth) ||
    !(x.firstSeenDay === null || typeof x.firstSeenDay === "string") ||
    !isCount(x.days) || !isCount(x.months) ||
    typeof x.today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.today)
  ) return fail("the overall numbers");
  return x as unknown as StatsOverall;
}

export function readDiagnoses(x: unknown): StatsDiagnosis[] {
  if (!isObject(x) || !Array.isArray(x.diagnoses)) return fail("the diagnosis counts");
  for (const d of x.diagnoses) {
    if (!isObject(d) || typeof d.name !== "string" || !isCount(d.patients)) return fail("the diagnosis counts");
  }
  return x.diagnoses as StatsDiagnosis[];
}
