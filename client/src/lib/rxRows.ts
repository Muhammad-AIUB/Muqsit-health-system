// Converts between the saved prescription model (RxItem[]) and the editable
// notebook rows (Row[]) used by MedicinePad. Shared by the main ℞ editor and
// the prescription-template editor so both round-trip notes and tapering lines
// the same way.
//
// A tapering line is marked `isCont` and (in drafts and templates) carries an
// EMPTY drug, because it belongs to the line above. A free-typed note is stored
// with isNote = true.
//
// ⚠️ `isCont` and "blank drug" are NOT the same test, and both are needed.
// `MuqsitContext.savePrescription` fills the medicine's name back into every
// continuation before sending it to the server, so a stored PrescriptionItem is
// self-contained for printing — which means a taper read back from the server
// has a FILLED drug and is only identifiable by `isCont`. Rows written before
// 2026-08-17 have no `isCont` at all, so the blank-drug fallback stays.

import type { RxItem } from "@/types";
import { emptyRow, type Row } from "@/components/prescription/MedicinePad";

export function rowsFromRxItems(items: RxItem[]): Row[] {
  const rows: Row[] = items.map((it, i) => {
    if (it.isNote) return { drug: it.drug, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false };
    // Prefer the recorded flag; fall back to the blank drug for anything saved
    // before the flag existed. `?? ` and not `||` — `isCont: false` is a real
    // answer ("this is a head"), not a missing one.
    const isCont = it.isCont ?? (it.drug.trim() === "" && i > 0);
    return { drug: isCont ? "" : it.drug, dose: it.dose, food: it.instruction, duration: it.duration, checked: true, isMedicine: true, continuation: isCont, sf: it.sf, generic: it.generic, fromHabit: it.fromHabit };
  });
  rows.push(emptyRow());
  return rows;
}

/**
 * For each pad row, its index into the `rxDrugs` array the prescribing-alert
 * matcher is given (`rxItems` minus the notes) — or `null` for a row that
 * contributes nothing.
 *
 * ⚕️ It lives here, beside `rxItemsFromRows`, because it MUST use the same
 * predicate. It is what puts a contraindication warning against the right
 * medicine, and an off-by-one would draw a pregnancy contraindication against
 * the drug on the line below it. Pinned in `rxRows.test.ts`.
 */
export function rxDrugIndexByRow(rows: Row[]): (number | null)[] {
  let n = 0;
  let headOk = false; // the line a >>> line belongs to is a named medicine
  return (rows ?? []).map((r) => {
    if (!r.isMedicine) {
      // A note becomes an RxItem but is filtered out of `rxDrugs`, so it takes
      // no index — and must not consume one either.
      headOk = false;
      return null;
    }
    if (r.continuation) {
      // Kept only when something was filled under a named medicine — the same
      // test as rxItemsFromRows.
      if (headOk && filled(r)) return n++;
      return null;
    }
    headOk = !!r.drug.trim();
    if (headOk) return n++;
    return null;
  });
}

/** Something is typed in the dose, food or duration cell. */
const filled = (r: Row) => !!(r.dose.trim() || r.duration.trim() || r.food.trim());

/**
 * ⚕️ The rows the pad cannot write as they stand — by index:
 *  • a `>>>` line with something in it and no named medicine DIRECTLY above it
 *    (its medicine's name cleared, under a note, at the top of the pad);
 *  • a medicine line with a dose, food or duration and no name.
 * `rxItemsFromRows` leaves both out — never hands a `>>>` line to the medicine
 * before — so Save & print refuses while any is on the pad (and the IPD sheet's
 * Save, the template editor's, "+ Add medicine"), and the pad marks each one.
 * Before 18/10/2026 such a `>>>` line was saved and PRINTED under the medicine
 * before it: a dose for the wrong drug (physician: "dangerous bug").
 */
export function unwritableRows(rows: Row[]): number[] {
  const out: number[] = [];
  let headOk = false;
  (rows ?? []).forEach((r, i) => {
    if (r.isMedicine && r.continuation) {
      if (filled(r) && !headOk) out.push(i);
      return;
    }
    // A note is no medicine to hang a >>> line on. A line with no text and
    // something in its cells cannot be written either way.
    headOk = r.isMedicine && !!r.drug.trim();
    if (!r.drug.trim() && filled(r)) out.push(i);
  });
  return out;
}

export function rxItemsFromRows(rows: Row[]): RxItem[] {
  const out: RxItem[] = [];
  // ⚕️ A >>> line belongs to the line DIRECTLY above it, and is written only
  // when that line is a named medicine. Kept after a cleared name or a note, it
  // stood under the medicine before: saved with that medicine's name filled in
  // and printed under it (`unwritableRows`, above; 18/10/2026).
  let headOk = false;
  for (const r of rows) {
    if (!r.isMedicine) {
      headOk = false;
      // A free-typed instruction line — keep it so it reaches the printed sheet.
      if (r.drug.trim()) out.push({ drug: r.drug.trim(), dose: "", duration: "", instruction: "", isNote: true });
      continue;
    }
    if (r.continuation) {
      // Keep the continuation line when ANY of dose, duration, or the
      // food/instruction was filled — a tapering step that only changes the
      // instruction (dose/duration blank) must still print and persist.
      if (headOk && filled(r)) out.push({ drug: "", dose: r.dose, duration: r.duration, instruction: r.food, isCont: true, fromHabit: r.fromHabit });
    } else {
      headOk = !!r.drug.trim();
      if (headOk) out.push({ drug: r.drug.trim(), dose: r.dose, duration: r.duration, instruction: r.food, sf: r.sf, generic: r.generic, isCont: false, fromHabit: r.fromHabit });
    }
  }
  return out;
}

/**
 * Items from ELSEWHERE — an old template, an old draft, a peer device — read the
 * pad's way: a `>>>` line with no named medicine directly above it is left out
 * and counted, never handed to the medicine before it; so is a medicine line
 * with something in it and no name. `dropped` > 0 is what the save refuses on
 * and what a template insert reports (18/10/2026).
 */
export function writableItems(items: RxItem[]): { items: RxItem[]; dropped: number } {
  const out: RxItem[] = [];
  let dropped = 0;
  let headOk = false;
  (items ?? []).forEach((it, i) => {
    if (it.isNote) { headOk = false; out.push(it); return; }
    const isCont = it.isCont ?? (it.drug.trim() === "" && i > 0);
    if (isCont) {
      if (headOk) out.push(it);
      else dropped++;
      return;
    }
    headOk = !!it.drug.trim();
    if (headOk) out.push(it);
    else if (it.dose.trim() || it.duration.trim() || it.instruction.trim()) dropped++;
  });
  return { items: out, dropped };
}

