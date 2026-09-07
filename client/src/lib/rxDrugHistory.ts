// ⚕️ Mirrors the medicines on TODAY'S ℞ pad into the patient's date-stamped
// Drug history, so a drug prescribed on this visit shows up in "Current
// medications" the moment it is written — and is still there, as Distant past,
// on the next visit.
//
// Physician's decision (2026-09-07): the sync is LIVE, on every change, not
// deferred to "Save & print". The ℞ pad is therefore the OWNER of the entries
// it produces: a line deleted from the pad is withdrawn from the history block
// again, so a mistyped medicine does not become a permanent clinical record.
// That is the whole reason `syncRxDrugHistory` needs to be told what the pad
// contributed LAST time — see the reconciliation rules on it.
//
// Everything here is a pure string transformation over the entry format
// documented in `DrugHistoryField.tsx` and `client/CLAUDE.md`:
//   "dd/mm/yyyy: Drug — dose — food — duration"   (medicine)
//   "dd/mm/yyyy(cont): dose — food — duration"    (tapering line)
// It deliberately does NOT import from `DrugHistoryField.tsx` (that parser is
// entangled with the modal's editing semantics), the same independence
// `lib/drugHistorySummary.ts` and `lib/prescriptionDoc.ts` already keep. The
// formats are pinned side by side in `rxDrugHistory.test.ts`.

import type { RxItem } from "@/types";
import { rowsFromRxItems } from "@/lib/rxRows";

/** dd/mm/yyyy, structurally — the stamp that decides Current vs Distant past. */
const VISIT_DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;

const SEP = " — ";

/**
 * The drug-history entries today's ℞ contributes, in pad order.
 *
 * ⚕️ Every character is echoed from what the doctor typed. Nothing is inferred,
 * defaulted or completed: a medicine with no dose yet is recorded with no dose,
 * because "1+0+1" that the doctor never wrote would be an invented instruction.
 *
 * Skipped, on purpose:
 *  • free-typed ℞ notes — a note is not a medication, and the printed Drug
 *    history block renders every entry as a drug name;
 *  • lines with no medicine name and no tapering content — nothing to record;
 *  • everything, when `visitDate` is not a real dd/mm/yyyy stamp. An entry
 *    stamped with a malformed date can never be matched back out again, so it
 *    would be unremovable junk in a patient record.
 */
export function rxDrugHistoryEntries(rxItems: RxItem[], visitDate: string): string[] {
  if (!VISIT_DATE_RE.test(visitDate)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // `rowsFromRxItems` owns the head/continuation/note classification (including
  // the pre-2026-08-17 blank-drug fallback for `isCont`); duplicating that test
  // here is how a taper silently turns into a second unrelated medicine.
  for (const r of rowsFromRxItems(rxItems ?? [])) {
    if (!r.isMedicine) continue; // note, or the trailing blank row
    let entry: string;
    if (r.continuation) {
      if (!r.dose.trim() && !r.food.trim() && !r.duration.trim()) continue;
      entry = `${visitDate}(cont): ${r.dose.trim()}${SEP}${r.food.trim()}${SEP}${r.duration.trim()}`;
    } else {
      if (!r.drug.trim()) continue;
      entry = `${visitDate}: ${r.drug.trim()}${SEP}${r.dose.trim()}${SEP}${r.food.trim()}${SEP}${r.duration.trim()}`;
    }
    if (seen.has(entry)) continue; // two identical lines carry one fact
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

/**
 * Fold the ℞'s contribution into the stored drug history.
 *
 * Three rules, and each exists to protect something:
 *  1. **Only ever withdraw what the ℞ itself put there.** An entry is removed
 *     only if it was in `prevDerived` AND is no longer on the ℞. Anything the
 *     doctor typed into the Drug-history modal by hand is untouchable — this
 *     function can never delete a medication it did not write.
 *  2. **Additive and order-stable.** New entries are appended; entries already
 *     present are left where they are, so an existing list is not reshuffled
 *     under the doctor mid-visit.
 *  3. **Idempotent.** Re-running with the same inputs returns an equal array,
 *     which is what lets the caller skip the write (and the re-render) when
 *     nothing actually changed.
 *
 * `prevDerived` empty is always SAFE: nothing is withdrawn, the ℞'s entries are
 * merged in, and the next call reconciles normally. That is what makes a page
 * reload and a patient switch (where the caller has no memory of the previous
 * pad) harmless rather than destructive.
 */
export function syncRxDrugHistory(stored: string[], prevDerived: string[], nextDerived: string[]): string[] {
  const next = new Set(nextDerived);
  const withdrawn = new Set((prevDerived ?? []).filter((e) => !next.has(e)));
  const kept = (stored ?? []).filter((e) => !withdrawn.has(e));
  const present = new Set(kept);
  const merged = [...kept];
  for (const e of nextDerived) {
    if (present.has(e)) continue;
    present.add(e);
    merged.push(e);
  }
  return merged;
}

/** True when both arrays hold the same entries in the same order. */
export function sameEntries(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
