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
export function usePadSync(
  rxItems: RxItem[],
  setRxItems: Dispatch<SetStateAction<RxItem[]>>,
): [Row[], Dispatch<SetStateAction<Row[]>>] {
  const [rows, setRows] = useState<Row[]>(() => fromRxItems(rxItems));
  // What the pad and `rxItems` last agreed on.
  const lastSync = useRef<string>(JSON.stringify(toRxItems(fromRxItems(rxItems))));
  const seenRows = useRef(rows);

  useEffect(() => {
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
  }, [rows, rxItems, setRxItems]);

  return [rows, setRows];
}
