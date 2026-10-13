// "last 15 Aug", or "last 15 Aug 2024" once it is not this year.
//
// ⚕️ THE YEAR IS NOT DECORATION. The count and the date are shown together
// precisely so a routine dose and a one-off can be told apart (design §8 rule
// 7) — and without a year, an instruction last written two years ago reads
// exactly like one written last week. A stale habit that looks current is the
// same failure as a wrong count.
//
// `lastUsedAt` is an ISO timestamp from the server, so a plain Date parse is
// correct here — unlike the app's stored dd/mm/yyyy strings, which must never
// go through `new Date(str)` (see client/CLAUDE.md).
//
// Shared by "Your usual" in the ℞ pad and the "Add Bulk Medicine" box, so a
// habit's date reads the same on both.
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function lastUsedLabel(iso: unknown, now: Date = new Date()): string {
  if (typeof iso !== "string") return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const year = d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `last ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}${year}`;
}
