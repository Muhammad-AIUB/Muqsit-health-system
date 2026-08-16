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

export function rxItemsFromRows(rows: Row[]): RxItem[] {
  const out: RxItem[] = [];
  for (const r of rows) {
    if (!r.isMedicine) {
      // A free-typed instruction line — keep it so it reaches the printed sheet.
      if (r.drug.trim()) out.push({ drug: r.drug.trim(), dose: "", duration: "", instruction: "", isNote: true });
      continue;
    }
    if (r.continuation) {
      // Keep the continuation line when ANY of dose, duration, or the
      // food/instruction was filled — a tapering step that only changes the
      // instruction (dose/duration blank) must still print and persist.
      if (r.dose.trim() || r.duration.trim() || r.food.trim()) out.push({ drug: "", dose: r.dose, duration: r.duration, instruction: r.food, isCont: true, fromHabit: r.fromHabit });
    } else if (r.drug.trim()) {
      out.push({ drug: r.drug.trim(), dose: r.dose, duration: r.duration, instruction: r.food, sf: r.sf, generic: r.generic, isCont: false, fromHabit: r.fromHabit });
    }
  }
  return out;
}
