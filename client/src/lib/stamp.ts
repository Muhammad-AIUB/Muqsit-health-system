// How a moment the SYSTEM recorded is shown: admitted on, page added at, note
// last saved. (A date a doctor TYPES is `dd/mm/yyyy` and belongs to
// `dateInput.ts` — this file never reads one of those.)
//
// Written out by hand, day first, month as a word:  9 Oct 2026 · 17:04
//
// Until 2026-10-09 four screens each asked the browser to format these, in the
// browser's own language. On one machine the ward list read "Oct 9", the open
// admission "Oct 9, 2026" and its follow-up entries "9 Oct 2026 · 17:04" — three
// orders on two screens — and the personal note's "Last saved 10/9/2026" is the
// 10th of September to anyone used to this app's own dd/mm/yyyy. A browser set
// to Bangla drew the month in Bangla inside an English sentence.
//
// A month written as a word cannot be read as a day, and nothing here depends
// on the machine's language. The time is the device's local time, 24-hour.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const p2 = (n: number) => String(n).padStart(2, "0");

// An ISO timestamp from the server. Anything unreadable shows as nothing —
// never "Invalid Date" on a patient's row.
function read(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `9 Oct` — a list row, where the year is the current admission's. */
export function dayMonth(iso: string | null | undefined): string {
  const d = read(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "";
}

/** `9 Oct 2026` */
export function dayMonthYear(iso: string | null | undefined): string {
  const d = read(iso);
  return d ? `${dayMonth(iso)} ${d.getFullYear()}` : "";
}

/** `9 Oct 2026 · 17:04`, or `9 Oct · 17:04` with `{ year: false }`. */
export function stamp(iso: string | null | undefined, { year = true }: { year?: boolean } = {}): string {
  const d = read(iso);
  if (!d) return "";
  return `${year ? dayMonthYear(iso) : dayMonth(iso)} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
