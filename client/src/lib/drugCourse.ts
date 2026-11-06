// ⚕️ A medicine of the Drug history READ AS A COURSE (physician's sheet,
// 07/11/2026): the name, the dose, the duration, the day it started, the day it
// ends and how many were taken in all — one row per medicine, the tapering
// lines under it counted in. Pure: it reads the stored entries
// (`dd/mm/yyyy: Drug — dose — food — duration`, `dd/mm/yyyy(cont): …`,
// `dd/mm/yyyy(note): …`) and changes nothing; pinned in `drugCourse.test.ts`.
//
// What the sheet's own examples fix (a 7-day course from 06/11 is "13/11", a
// 10-day one "16/11"; 1+0+1 for 7 days is 14, 1+1+1 for 10 days is 30):
//   End   = Start + the days of every line of the block, one after the other
//   Total = the sum of (units a day × days) of every line
// Tapering lines "follow their medicine in order", as the monthly-cost box
// already counts them (`lib/monthlyCost.ts`), whose readers of a dose and of a
// duration are used here as they are — one answer to "how many a day" and "how
// many days".
//
// ⚕️ Nothing is guessed. A duration with no unit (`5`), a dose that is not
// counts joined by `+`, a date that is not on the calendar, the no-date marker,
// a food cell that says HOW OFTEN (`once a week`, not just beside which meal):
// each leaves End and/or Total BLANK, never a number made up to fill the box. A
// total is not rounded to a whole number (half a tablet is a half).
//
// This is a leaf on purpose. `drugHistorySummary` (the Health-trend chart's
// bars) reads it, and `rxAlerts` reads that; reaching `drugHistorySplit` /
// `drugHistoryAdd` from here would reach `MedicinePad`, which imports `rxAlerts`.
// So the two literals it needs are kept here and pinned against the app's own in
// the test.

import { ddmmyyyyMsStrict } from "@/lib/dateInput";
import { dosesPerDay, durationDays, saysOnlyWhen } from "@/lib/monthlyCost";
import { rxCellIn } from "@/lib/rxLanguage";
import { splitDrugLabel } from "@/lib/rxShorthand";

/** The marker Drug history groups under "no date" (`NO_DATE`, `lib/drugHistoryAdd.ts`). */
export const NO_DATE_MARKER = "01/01/2000";
/** The separator of a stored entry's cells (`SEP`, `lib/rxDrugHistory.ts`). */
export const CELL_SEP = " — ";

const DATED = /^(\d{2}\/\d{2}\/\d{4})(\(note\)|\(cont\))?:\s*(.*)$/;
const LEGACY = /^(Current|Past)(\(note\)|\(cont\))?:\s*(.*)$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export interface CourseLine { dose: string; food: string; duration: string }

export interface Course {
  /** The block's stored lines joined by a line break: what names it. */
  key: string;
  /** The stored entries, the medicine first. */
  lines: string[];
  /** "med": a medicine; "note": a free-text note; "other": a line that belongs to nothing readable. */
  kind: "med" | "note" | "other";
  /** The medicine as stored (`Tablet. Napa 500 mg`); a note's words; an unreadable line as it is. */
  label: string;
  /** `dd/mm/yyyy` as the entry carries it (the no-date marker, or a legacy line's reading). */
  date: string;
  /** A real calendar date that is not the no-date marker. */
  hasDate: boolean;
  head: CourseLine;
  tapers: CourseLine[];
  /** `dd/mm/yyyy`: the start plus the days of every line; null unless all of them can be read. */
  end: string | null;
  /** Some line says Continue: there is no end to read. */
  open: boolean;
  /** Units taken in all; null unless every line's dose, food and duration can be read. */
  total: number | null;
  /** A dated medicine whose every line is dated: its start and durations may be edited. */
  editable: boolean;
}

interface Parsed { raw: string; date: string; dated: boolean; kind: "med" | "note" | "cont"; body: string }

const kindOf = (suffix?: string): Parsed["kind"] => (suffix === "(note)" ? "note" : suffix === "(cont)" ? "cont" : "med");

function parse(raw: string, visitDate: string): Parsed {
  let m = raw.match(DATED);
  if (m) return { raw, date: m[1], dated: true, kind: kindOf(m[2]), body: m[3] };
  m = raw.match(LEGACY);
  // A legacy `Current:` line reads as the visit's date, `Past:` as no date — the
  // Drug history modal's and the Records view's own reading.
  if (m) return { raw, date: m[1] === "Past" ? NO_DATE_MARKER : visitDate, dated: false, kind: kindOf(m[2]), body: m[3] };
  return { raw, date: visitDate, dated: false, kind: "med", body: raw };
}

const cells = (body: string): string[] => body.split(CELL_SEP);
const cell = (parts: string[], i: number): string => (parts[i] ?? "").trim();

const headOf = (body: string): { label: string; line: CourseLine; tooLong: boolean } => {
  const p = cells(body);
  return { label: cell(p, 0), line: { dose: cell(p, 1), food: cell(p, 2), duration: cell(p, 3) }, tooLong: p.length > 4 };
};
const contOf = (body: string): { line: CourseLine; tooLong: boolean } => {
  const p = cells(body);
  return { line: { dose: cell(p, 0), food: cell(p, 1), duration: cell(p, 2) }, tooLong: p.length > 3 };
};

/** `dd/mm/yyyy` plus `n` days, or null when the date is not real or the result is outside the years the app accepts. */
export function addDays(date: string, n: number): string | null {
  const ms = ddmmyyyyMsStrict(date);
  if (Number.isNaN(ms)) return null;
  const m = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m || !Number.isFinite(n)) return null;
  const t = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]) + n));
  const y = t.getUTCFullYear();
  if (Number.isNaN(y) || y < MIN_YEAR || y > MAX_YEAR) return null;
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${y}`;
}

/** A total as shown: a whole number as it is, a fraction to two places (the sum of halves and thirds). */
export function formatTotal(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function figures(startOk: boolean, start: string, lines: CourseLine[]): { end: string | null; open: boolean; total: number | null } {
  let days = 0;
  let allDays = true;
  let open = false;
  let units = 0;
  let allUnits = true;
  for (const l of lines) {
    // A cell BAN wrote in Bangla is read as its English, as the monthly-cost box reads it.
    const d = durationDays(rxCellIn(l.duration, "en"));
    if (d === "continue") { open = true; allDays = false; allUnits = false; continue; }
    if (d === null) { allDays = false; allUnits = false; continue; }
    days += d;
    const perDay = dosesPerDay(rxCellIn(l.dose, "en"));
    // How OFTEN is not known from a dose and a number of days when the food
    // cell says it (`once a week`): not counted, as the monthly cost box does.
    if (perDay === null || !saysOnlyWhen(l.food)) allUnits = false;
    else units += perDay * d;
  }
  return {
    end: startOk && allDays ? addDays(start, days) : null,
    open,
    total: allUnits ? units : null,
  };
}

/**
 * The medicines, notes and stray lines of a stored Drug history, one row each, in
 * stored order. A tapering line goes to the medicine directly above it — by
 * position alone, as everywhere else in the app — and never to a medicine above a
 * note; one with nothing above it is a row of its own that cannot be edited.
 * `visitDate` is what a legacy `Current:` line reads as.
 */
export function coursesOf(entries: string[], visitDate: string): Course[] {
  const blocks: Parsed[][] = [];
  for (const raw of entries ?? []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const row = parse(raw, visitDate);
    const last = blocks[blocks.length - 1];
    if (row.kind === "cont" && last && last[0].kind === "med") last.push(row);
    else blocks.push([row]);
  }
  return blocks.map((b): Course => {
    const first = b[0];
    const lines = b.map((r) => r.raw);
    const key = lines.join("\n");
    const hasDate = first.dated && first.date !== NO_DATE_MARKER && !Number.isNaN(ddmmyyyyMsStrict(first.date));
    const blank: CourseLine = { dose: "", food: "", duration: "" };
    if (first.kind === "note") {
      return { key, lines, kind: "note", label: first.body.trim(), date: first.date, hasDate, head: blank, tapers: [], end: null, open: false, total: null, editable: false };
    }
    if (first.kind === "cont") {
      return { key, lines, kind: "other", label: first.raw.trim(), date: first.date, hasDate, head: blank, tapers: [], end: null, open: false, total: null, editable: false };
    }
    const h = headOf(first.body);
    const tapers = b.slice(1).map((r) => contOf(r.body));
    const all = [h.line, ...tapers.map((t) => t.line)];
    const f = figures(hasDate, first.date, all);
    const editable = b.every((r) => r.dated) && !h.tooLong && !tapers.some((t) => t.tooLong);
    return { key, lines, kind: "med", label: h.label, date: first.date, hasDate, head: h.line, tapers: tapers.map((t) => t.line), end: f.end, open: f.open, total: f.total, editable };
  });
}

/** Still being taken: it goes on (`Continue`), or its End is today or later. A note and a line with no readable End are not. */
export function isCurrentCourse(c: Course, todayMs: number): boolean {
  if (c.kind !== "med") return false;
  if (c.open) return true;
  if (c.end === null) return false;
  const e = ddmmyyyyMsStrict(c.end);
  return !Number.isNaN(e) && e >= todayMs;
}

export type CourseSort = "generic" | "date";

/**
 * Current medication first; then the rest. By generic: A to Z (a medicine with no
 * generic by its brand name, a note by its words); by date: the start, newest
 * first, a line with no date last. The same order inside the current group.
 * Equal ones keep their stored order. The list given is not changed.
 */
export function sortCourses(courses: Course[], mode: CourseSort, todayMs: number, genericOf: (label: string) => string | null): Course[] {
  const keyed = courses.map((c, i) => {
    const name = c.kind === "med" ? (genericOf(c.label) ?? splitDrugLabel(c.label).name ?? c.label) : c.label;
    return { c, i, current: isCurrentCourse(c, todayMs), name: (name || c.label).trim().toLowerCase(), start: c.hasDate ? ddmmyyyyMsStrict(c.date) : -Infinity };
  });
  keyed.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (mode === "generic") {
      const byName = a.name.localeCompare(b.name, "en");
      if (byName !== 0) return byName;
      if (a.start !== b.start) return b.start > a.start ? 1 : -1;
    } else if (a.start !== b.start) {
      return b.start > a.start ? 1 : -1;
    }
    return a.i - b.i;
  });
  return keyed.map((k) => k.c);
}

/**
 * The stored lines of an editable course with its start date and durations
 * changed — `durations` has one entry for the medicine's line and one for each
 * tapering line under it, in order. Every other cell is carried over character for
 * character. Null when it cannot be done safely: not an editable medicine, a date
 * that is not on the calendar (or outside 1900–2200), the wrong number of
 * durations, or a duration holding the cell separator or a line break.
 */
export function rewriteCourse(c: Course, edit: { start: string; durations: string[] }): string[] | null {
  if (c.kind !== "med" || !c.editable) return null;
  if (edit.durations.length !== c.lines.length) return null;
  const startMs = ddmmyyyyMsStrict(edit.start);
  if (Number.isNaN(startMs)) return null;
  const year = new Date(startMs).getFullYear();
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const start = edit.start.trim().replace(/^(\d)\//, "0$1/").replace(/\/(\d)\//, "/0$1/");
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(start)) return null;
  const out: string[] = [];
  for (let i = 0; i < c.lines.length; i++) {
    const duration = edit.durations[i].trim();
    if (duration.includes(CELL_SEP) || /[\r\n]/.test(duration)) return null;
    const m = c.lines[i].match(DATED);
    if (!m) return null;
    const cont = m[2] === "(cont)";
    const parts = cells(m[3]);
    const width = cont ? 3 : 4;
    if (parts.length > width) return null;
    while (parts.length < width) parts.push("");
    parts[width - 1] = duration;
    out.push(`${start}${cont ? "(cont)" : ""}: ${parts.join(CELL_SEP)}`);
  }
  return out;
}
