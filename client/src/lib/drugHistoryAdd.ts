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
