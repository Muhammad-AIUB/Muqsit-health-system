// ⚕️ The order investigation findings are READ in — newest visit first.
//
// Physician's report, 2026-09-21: a printed sheet carried 29 findings whose
// dates ran `08/09/2026 → 19/06/2026 → 24/01/2025 → 08/09/2026 …`, because the
// list had never been ordered at all — it printed in the order the findings had
// been typed in, across many visits. A doctor scanning a year of labs cannot
// hold a random order in their head, and neither can whoever the sheet is
// handed to.
//
// Two rules, and the second matters as much as the first:
//  1. **Newest date first**, and every finding from the same date together.
//  2. **Inside a date, the doctor's own order is kept.** `Hb`, then `WBC`, then
//     `PLT` is how a blood count is read; re-sorting within a visit would shuffle
//     a panel into nonsense. The sort is made stable explicitly rather than
//     relying on the engine's, because this is a clinical ordering.
//
// Ordering changes nothing else: no finding is added, dropped, merged or
// reworded, and each line still carries its own date, so a reordered sheet can
// never state something the record does not.

import { ddmmyyyyMs } from "@/lib/dateInput";

/** `dd/mm/yyyy:Test:Value` — the stored shape of a dated finding. */
const DATE_PREFIX = /^(\d{2}\/\d{2}\/\d{4}):/;

/**
 * A finding's date in epoch milliseconds. 0 when the entry carries no date.
 *
 * ⚕️ The conversion itself is `ddmmyyyyMs` in `lib/dateInput.ts` — the ONE copy
 * in the app (consolidated 2026-09-21 from eight hand-written ones). Two screens
 * disagreeing about which of two findings is newer is a real hazard here, and
 * that is exactly what several slightly different parsers produce.
 */
export function findingDateMs(item: unknown): number {
  if (typeof item !== "string") return 0;
  const m = item.match(DATE_PREFIX);
  return m ? ddmmyyyyMs(m[1]) : 0;
}

/**
 * Findings ordered newest date first, the doctor's order kept inside each date.
 *
 * An entry with no date sorts LAST, after every dated one, in the order it was
 * written. It cannot be placed in time, and putting it at the top would give it
 * a recency it was never claimed to have.
 */
export function sortFindingsByDate(items: string[]): string[] {
  return (items ?? [])
    .map((item, i) => ({ item, key: findingDateMs(item), i }))
    .sort((a, b) => (b.key - a.key) || (a.i - b.i))
    .map((x) => x.item);
}

/**
 * The same order, for a list already grouped by date (the sidebar builds those).
 * Groups with no date keep their place at the end.
 */
export function sortDateGroups<T extends { date: string }>(groups: T[]): T[] {
  return (groups ?? [])
    .map((g, i) => ({ g, key: ddmmyyyyMs(g?.date), i }))
    .sort((a, b) => (b.key - a.key) || (a.i - b.i))
    .map((x) => x.g);
}
