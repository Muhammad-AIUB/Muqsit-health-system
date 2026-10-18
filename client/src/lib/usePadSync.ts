"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Row } from "@/components/prescription/MedicinePad";
import { rowsFromRxItems as fromRxItems, rxItemsFromRows as toRxItems } from "@/lib/rxRows";
import type { RxItem } from "@/types";

// ⚕️ The OPD ℞ pad's rows ⇄ the prescription's `rxItems`.
//
// The pad edits its own rows and copies them into `rxItems`; a change made
// elsewhere (a template, the BAN/EN switch, Move to Rx, Add Bulk Medicine, a
// mirrored device) is copied back onto the pad.
//
// One effect, not two. Two edits can land in ONE render before the first one's
// copy has reached `rxItems` — typing "b", "m" in the food cell in BAN did it
// (2026-10-15). With an effect each way, the render that held the second edit
// also held the first one's copy, older than the pad: it was taken for a change
// made elsewhere and put back, the second letter was gone, and the two copies
// went on overwriting each other until React stopped the screen.
//
// So when the pad's rows moved in a render, the pad is the newest edit and its
// copy is what `rxItems` becomes — whatever `rxItems` holds in that same render
// is overwritten by it, as the copy always did. Only a render in which the pad
// did NOT move copies `rxItems` onto the pad.
//
// ⚕️ A NEW VISIT (`epoch`, bumped by `resetEditor`, and by the device mirror
// when it brings another patient) always redraws the pad from `rxItems`. A pad holding only lines it cannot write (a >>> line whose
// medicine name was cleared — `unwritableRows`) copies [] into `rxItems`, the
// same as a reset does: the pad saw no change, kept the lines, and one patient's
// dose stood on the next patient's pad (review, 18/10/2026).
export function usePadSync(
  rxItems: RxItem[],
  setRxItems: Dispatch<SetStateAction<RxItem[]>>,
  epoch = 0,
): [Row[], Dispatch<SetStateAction<Row[]>>] {
  const [rows, setRows] = useState<Row[]>(() => fromRxItems(rxItems));
  // What the pad and `rxItems` last agreed on.
  const lastSync = useRef<string>(JSON.stringify(toRxItems(fromRxItems(rxItems))));
  const seenRows = useRef(rows);
  const seenEpoch = useRef(epoch);

  useEffect(() => {
    if (epoch !== seenEpoch.current) {
      seenEpoch.current = epoch;
      const next = fromRxItems(rxItems);
      lastSync.current = JSON.stringify(toRxItems(next));
      seenRows.current = next;
      setRows(next);
      return;
    }
    if (rows !== seenRows.current) {
      seenRows.current = rows;
      const items = toRxItems(rows);
      const sig = JSON.stringify(items);
      lastSync.current = sig;
      setRxItems((prev) => (JSON.stringify(prev) === sig ? prev : items));
      return;
    }
    const sig = JSON.stringify(rxItems);
    if (sig !== lastSync.current) {
      lastSync.current = sig;
      setRows(fromRxItems(rxItems));
    }
  }, [rows, rxItems, setRxItems, epoch]);

  return [rows, setRows];
}
