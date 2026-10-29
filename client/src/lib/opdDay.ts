// Days for the OPD queue. A queue is booked by Dhaka calendar DAY, written
// `yyyy-mm-dd` — the key the server files a visit under (`OpdVisit.queueDate`,
// `server/src/opd/dhaka-day.ts`). A day is a name, not an instant: it compares
// as text, no time zone moves it, and nothing here asks the browser to write a
// date in its own locale (`toLocaleDateString` answers `10/9/2026` for the 9th of
// October beside this app's `09/10/2026`).

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthRef {
  year: number;
  month: number; // 0 = January
}

/** The Dhaka calendar day of a moment (default: now) — the doctor's today,
 *  whatever time zone the machine is set to. */
export function dhakaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whether `text` is a real calendar day written `yyyy-mm-dd`. */
export function isDayKey(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** A day against today: only today and later days can be changed. */
export function dayRelation(day: string, today: string): "past" | "today" | "future" {
  return day < today ? "past" : day === today ? "today" : "future";
}

/** `28/10/2026` — how the app writes a date. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function shiftDay(day: string, days: number): string {
  return keyOf(utc(day) + days * 24 * 60 * 60 * 1000);
}

export function shiftMonth(ref: MonthRef, months: number): MonthRef {
  const index = ref.year * 12 + ref.month + months;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export function monthOf(day: string): MonthRef {
  const [y, m] = day.split("-").map(Number);
  return { year: y, month: m - 1 };
}

export function monthTitle(ref: MonthRef): string {
  return `${MONTHS[ref.month]} ${ref.year}`;
}

/** The month as weeks of seven places, Sunday first, a blank (`null`) where the
 *  month has not begun or has ended. */
export function monthGrid(ref: MonthRef): (string | null)[][] {
  const first = new Date(Date.UTC(ref.year, ref.month, 1));
  const lead = first.getUTCDay();
  const length = new Date(Date.UTC(ref.year, ref.month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  const mm = String(ref.month + 1).padStart(2, "0");
  for (let d = 1; d <= length; d++) cells.push(`${ref.year}-${mm}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
