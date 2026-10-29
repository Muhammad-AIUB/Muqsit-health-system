// Start of the current calendar day in Bangladesh, as a UTC instant.
//
// The OPD queue and its T-NN token serial reset at the doctor's midnight, not
// the server's: the VPS runs Europe/Berlin, so `setHours(0,0,0,0)` rolled the
// day over at 04:00 (03:00 in winter) Dhaka time and kept a late clinic's
// patients in yesterday's queue. Bangladesh is UTC+6 with no DST, so a fixed
// offset is exact.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDhakaDay(now: Date = new Date()): Date {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  return new Date(local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - DHAKA_OFFSET_MS);
}

// The Dhaka calendar day an OPD visit is queued for, as `yyyy-mm-dd`
// (`OpdVisit.queueDate`, `OpdDaySetting.day`). A plain string, not a Date: it
// names a day, not an instant, so no clock or time zone can move it, and two of
// them compare in order as text — a day before today is `< dhakaDayKey()`.
export function dhakaDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

// Dhaka midnight at the start of a named day (`yyyy-mm-dd`), as a UTC instant —
// the lower bound of "created on that day". The caller has checked `isDayKey`.
export function dhakaDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DHAKA_OFFSET_MS);
}

// Whether `text` is a real calendar day written `yyyy-mm-dd`. `2026-02-30` is
// not one — it would roll over to 2 March if read as a date, and a queue must
// never be filed under a day the doctor did not mean.
export function isDayKey(text: unknown): text is string {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}
