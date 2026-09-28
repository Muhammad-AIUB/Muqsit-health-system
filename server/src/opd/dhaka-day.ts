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
