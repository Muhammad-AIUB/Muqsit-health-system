// Converts between the saved prescription model (RxItem[]) and the editable
// notebook rows (Row[]) used by MedicinePad. Shared by the main ℞ editor and
// the prescription-template editor so both round-trip notes and tapering lines
// the same way.
//
// A tapering line is stored as an RxItem with an EMPTY drug (it belongs to the
// line above). A free-typed note is stored with isNote = true.

import type { RxItem } from "@/types";
import { emptyRow, type Row } from "@/components/prescription/MedicinePad";

export function rowsFromRxItems(items: RxItem[]): Row[] {
  const rows: Row[] = items.map((it, i) => {
    if (it.isNote) return { drug: it.drug, dose: "", food: "", duration: "", checked: true, isMedicine: false, continuation: false };
    const isCont = it.drug.trim() === "" && i > 0;
    return { drug: it.drug, dose: it.dose, food: it.instruction, duration: it.duration, checked: true, isMedicine: true, continuation: isCont };
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
      if (r.dose.trim() || r.duration.trim()) out.push({ drug: "", dose: r.dose, duration: r.duration, instruction: r.food });
    } else if (r.drug.trim()) {
      out.push({ drug: r.drug.trim(), dose: r.dose, duration: r.duration, instruction: r.food });
    }
  }
  return out;
}
