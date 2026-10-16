// ⚕️ Builds and checks ONE new, typed-in Drug-history entry — the
// "+ Add medicine" row on either tab of DrugHistoryField (physician's
// decision, 2026-10-14). This is an ADD, never a correction: it never reads
// or rewrites an existing stored line, so the ℞ mirror's own "withdraws
// only what it added" rule (lib/rxDrugHistory.ts#syncRxDrugHistory) keeps
// protecting it exactly as it already protects a doctor's hand-typed note
// — pinned by rxDrugHistory.test.ts's "never removes a medicine the doctor
// typed into Drug history by hand", which this function's output matches
// byte-for-byte.
//
// Deliberately does not import DrugHistoryField's own parser — the same
// independence lib/rxDrugHistory.ts and lib/drugHistorySummary.ts already
// keep, so the entry format is read in exactly one place.

import { SEP } from "@/lib/rxDrugHistory";
import { MedicineMap, instructionsKey } from "@/lib/medicineKey";
import { rxItemsFromRows } from "@/lib/rxRows";
import type { Row } from "@/components/prescription/MedicinePad";

export interface DrugHistoryAddInput {
  drug: string;
  dose: string;
  food: string;
  duration: string;
}

/** The marker DrugHistoryField groups under "Earlier (no date)". */
export const NO_DATE = "01/01/2000";

/**
 * "dd/mm/yyyy: Drug — dose — food — duration" — nothing invented. A cell
 * left blank at add-time is stored blank, exactly like a stored entry with
 * no dose that `drugHistorySelect.ts` already carries unchanged.
 */
export function buildDrugHistoryEntry(date: string, input: DrugHistoryAddInput): string {
  return `${date}: ${input.drug.trim()}${SEP}${input.dose.trim()}${SEP}${input.food.trim()}${SEP}${input.duration.trim()}`;
}

/**
 * True only when `existing` already holds the SAME medicine (`MedicineMap`'s
 * own matching — spacing, capitals and `Tab` for `Tablet.` are typing, not
 * meaning) at the SAME dose, food and duration (`instructionsKey`,
 * capitals/spacing set aside). A different dose of the same medicine is
 * always a new line — which dose is right is the doctor's judgement, never
 * this function's.
 */
export function isDuplicateDrugHistoryEntry(input: DrugHistoryAddInput, existing: DrugHistoryAddInput[]): boolean {
  const map = new MedicineMap<true>();
  for (const e of existing) map.add(e.drug, true, instructionsKey(e.dose, e.food, e.duration));
  return map.has(input.drug, instructionsKey(input.dose, input.food, input.duration));
}

/**
 * How many lines of the pad Drug history cannot write: a dose, food or
 * duration with no medicine name, and a >>> line with something in it and no
 * medicine above it (at the top, or under a note). `rxItemsFromRows` drops
 * such a line, so "+ Add medicine" refuses to add while one is on the pad —
 * found in the independent review before release (17/10/2026): Add used to
 * clear the pad with those typed cells in it, and say nothing.
 */
export function unwritableLines(rows: Row[]): number {
  const filled = (r: Row) => !!(r.dose.trim() || r.food.trim() || r.duration.trim());
  let n = 0;
  let head: Row | null = null; // the line a >>> line belongs to
  for (const r of rows) {
    if (r.continuation) {
      if (filled(r) && !(head && head.isMedicine && head.drug.trim())) n++;
      continue;
    }
    head = r;
    if (!r.drug.trim() && filled(r)) n++;
  }
  return n;
}

/**
 * What the doctor typed into "+ Add medicine" — the ℞ pad's own rows since the
 * physician's sheet of 15/10/2026 ("add medicine er philosophy prescription er
 * idea follow korbe") — as Drug-history entries stamped with `date`.
 *
 * Read through `rxItemsFromRows`, the ℞ pad's own reading of its rows, and
 * written in the format the ℞ → Drug-history mirror writes: a medicine
 * `date: drug — dose — food — duration`, each >>> tapering line under it
 * `date(cont): dose — food — duration`, a note `date(note): text`. Every
 * character as typed; a blank cell stays blank.
 *
 * A medicine whose first line repeats one the tab already holds — or one
 * written earlier in the same go — is skipped and named in `skipped`, by the
 * rule above. A medicine WITH tapering lines is never skipped: its regimen is
 * more than its first line, and losing a typed taper is worse than a line
 * shown twice.
 */
export function drugHistoryEntriesFromPad(
  rows: Row[],
  date: string,
  existing: DrugHistoryAddInput[],
): { entries: string[]; skipped: string[] } {
  const items = rxItemsFromRows(rows);
  const seen = [...existing];
  const entries: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.isNote) {
      entries.push(`${date}(note): ${it.drug.trim()}`);
      continue;
    }
    if (it.isCont) continue; // written with its medicine below; one with none above has nothing to qualify
    const tapers = [];
    while (items[i + 1]?.isCont) tapers.push(items[++i]);
    const head: DrugHistoryAddInput = { drug: it.drug, dose: it.dose, food: it.instruction, duration: it.duration };
    if (!tapers.length && isDuplicateDrugHistoryEntry(head, seen)) {
      skipped.push(it.drug.trim());
      continue;
    }
    seen.push(head);
    entries.push(buildDrugHistoryEntry(date, head));
    for (const t of tapers) entries.push(`${date}(cont): ${t.dose.trim()}${SEP}${t.instruction.trim()}${SEP}${t.duration.trim()}`);
  }
  return { entries, skipped };
}
