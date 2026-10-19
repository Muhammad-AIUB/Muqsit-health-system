"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Row } from "@/components/prescription/MedicinePad";
import { rowsFromRxItems as fromRxItems, rxItemsFromRows as toRxItems } from "@/lib/rxRows";
import { drawPad, droppedLines, padHoldOf } from "@/lib/rxPadHold";
import type { RxItem } from "@/types";

/**
 * ⚕️ What the pad holds beside `rxItems` (lib/rxPadHold.ts): its rows while a
 * line on it cannot be written — editor state, so that it travels with the
 * visit — and what to do when a redraw takes such a line off.
 */
export interface PadHold {
  held: Row[] | null;
  setHeld: Dispatch<SetStateAction<Row[] | null>>;
  onDropped?: (lost: Row[]) => void;
}

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
//
// ⚕️ THE HOLD (19/10/2026). A line the pad cannot write is never copied into
// `rxItems`, so a pad drawn from `rxItems` alone was drawn without it — after
// another tab, the phone layout, a reload, a mirrored device, a change made
// elsewhere — and nothing said so. With `hold`, the same effect also copies the
// pad's rows into `held` while such a line is on it (`padHoldOf`), and every
// redraw — this pad's first, a new visit, a change made elsewhere — is drawn
// from both (`drawPad`): the held rows come back while they still fit the
// `rxItems` they were taken with. A hold that changed elsewhere (a mirrored
// device, a draft, the BAN/EN switch) is a change made elsewhere too. Drawn
// from a hold, `rxItems` are made what the drawn rows write, so the pad and
// every other reader of `rxItems` read the same lines (the first version left
// rxItems as they came when the pad was first drawn and at a new visit:
// independent review, 19/10/2026). What a redraw takes off the pad that could
// not be written is handed to `onDropped`: what this pad showed, when only
// `rxItems` changed; when a hold arrived from elsewhere, only what of THAT hold
// could not be drawn — the other device's state is its word on its lines, and
// a line put right or taken off there is not "taken off" here (the same
// review: a red line deleted on one device was announced on the other as lost,
// with "write it again"). Never the last visit's lines at a new visit, whose
// pad is another patient's.
export function usePadSync(
  rxItems: RxItem[],
  setRxItems: Dispatch<SetStateAction<RxItem[]>>,
  epoch = 0,
  hold?: PadHold,
): [Row[], Dispatch<SetStateAction<Row[]>>] {
  const held = hold?.held ?? null;
  const setHeld = hold?.setHeld;
  const onDropped = hold?.onDropped;
  const [rows, setRows] = useState<Row[]>(() => drawPad(rxItems, held));
  // What the pad and `rxItems` last agreed on.
  const lastSync = useRef<string>(JSON.stringify(toRxItems(fromRxItems(rxItems))));
  const seenRows = useRef(rows);
  const seenEpoch = useRef(epoch);
  // The hold the pad last drew from or wrote. Any other is a change made elsewhere.
  const seenHeld = useRef(held);
  const drawn = useRef(false);

  useEffect(() => {
    // The hold for the rows the pad now shows.
    const keep = (next: Row[]) => {
      if (!setHeld) return;
      const h = padHoldOf(next);
      seenHeld.current = h;
      if (h !== held) setHeld(h);
    };
    // `rxItems` become what these rows write.
    const write = (from: Row[]) => {
      const items = toRxItems(from);
      const sig = JSON.stringify(items);
      lastSync.current = sig;
      setRxItems((prev) => (JSON.stringify(prev) === sig ? prev : items));
    };
    const say = (before: Row[] | null, after: Row[]) => {
      const lost = onDropped && before ? droppedLines(before, after) : [];
      if (lost.length) onDropped?.(lost);
    };
    if (!drawn.current) {
      drawn.current = true;
      if (held) {
        // This pad's first drawing was from the hold: what did not fit was
        // not put back.
        say(held, rows);
        write(rows);
        keep(rows);
        return;
      }
    }
    if (epoch !== seenEpoch.current) {
      seenEpoch.current = epoch;
      const next = drawPad(rxItems, held);
      // The new visit's own lines that did not fit, never the last visit's.
      say(held, next);
      if (held) write(next);
      else lastSync.current = JSON.stringify(toRxItems(next));
      seenRows.current = next;
      keep(next);
      setRows(next);
      return;
    }
    if (rows !== seenRows.current) {
      seenRows.current = rows;
      write(rows);
      keep(rows);
      return;
    }
    const heldSeen = held === seenHeld.current;
    const sig = JSON.stringify(rxItems);
    if (sig !== lastSync.current || !heldSeen) {
      lastSync.current = sig;
      seenHeld.current = held;
      const next = drawPad(rxItems, held);
      say(heldSeen ? rows : held, next);
      // The very lines already on the pad are not drawn again: a name being
      // retyped is put back only onto the rows it came from (MedicinePad).
      if (JSON.stringify(next) === JSON.stringify(rows)) keep(rows);
      else setRows(next);
    }
  }, [rows, rxItems, setRxItems, epoch, held, setHeld, onDropped]);

  return [rows, setRows];
}
