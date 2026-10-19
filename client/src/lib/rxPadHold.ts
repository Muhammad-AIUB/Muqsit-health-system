// ⚕️ The OPD ℞ pad's lines that cannot be written, HELD beside `rxItems`.
//
// A line with a dose, food or duration and no medicine name, and a >>> line
// with no named medicine directly above it (`unwritableRows`, lib/rxRows.ts),
// are never in `rxItems`: the printed sheet reads a nameless line as a >>> line,
// and every reader of `rxItems` stays safe because it holds only what can be
// written. Until 19/10/2026 such a line lived in the pad's rows only, so any
// redraw of the pad from `rxItems` — another tab, a desktop ↔ phone switch, a
// reload, a mirrored device, a change made elsewhere — drew it without it, and
// nothing said so.
//
// Now, while the pad holds such a line, the editor state holds the pad's ROWS
// as they stood (`rxPadHeld` in MuqsitContext), carried with the visit in the
// draft, `incompleteRx` and the device mirror. They are drawn again only while
// they still fit the `rxItems` they were taken with (`drawPad`): exactly those,
// or those with medicines appended after them (a template, Add Bulk Medicine,
// Move to Rx). Anything else and they are not put back — a red line is never
// laid over a prescription it was not written beside — and the pad says what
// went (`droppedLines`).

import { emptyRow, type Row } from "@/components/prescription/MedicinePad";
import type { RxItem } from "@/types";
import { rxRowsIn } from "./rxLanguage";
import { rowsFromRxItems, rxItemsFromRows, unwritableRows, writableItems } from "./rxRows";

/** The pad's rows while any line cannot be written; `null` when every line can. */
export function padHoldOf(rows: Row[]): Row[] | null {
  return unwritableRows(rows).length > 0 ? rows : null;
}

// Beyond any pad a doctor writes; a longer list is not a pad.
const MAX_ROWS = 500;

/**
 * A hold read back from a draft or another device — `unknown`, because it
 * reaches the editor as JSON. Anything that is not a list of pad rows gives
 * `null`, never a throw: this runs inside the prescription editor. Only the
 * fields a row carries are kept.
 */
export function readPadHold(x: unknown): Row[] | null {
  if (!Array.isArray(x) || x.length === 0 || x.length > MAX_ROWS) return null;
  const rows: Row[] = [];
  for (const v of x) {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    // A field a row may go without, written `null`, is absent — not a reason
    // to lose the whole hold.
    const opt = (k: string) => (o[k] === null ? undefined : o[k]);
    const { drug, dose, food, duration, isMedicine, continuation } = o;
    const [checked, sf, generic, fromHabit] = [opt("checked"), opt("sf"), opt("generic"), opt("fromHabit")];
    if (typeof drug !== "string" || typeof dose !== "string" || typeof food !== "string" || typeof duration !== "string") return null;
    if (typeof isMedicine !== "boolean" || typeof continuation !== "boolean") return null;
    if (checked !== undefined && typeof checked !== "boolean") return null;
    if ((sf !== undefined && typeof sf !== "string") || (generic !== undefined && typeof generic !== "string")) return null;
    if (fromHabit !== undefined && typeof fromHabit !== "boolean") return null;
    const r: Row = { drug, dose, food, duration, checked: checked ?? true, isMedicine, continuation };
    if (sf !== undefined) r.sf = sf;
    if (generic !== undefined) r.generic = generic;
    if (fromHabit !== undefined) r.fromHabit = fromHabit;
    rows.push(r);
  }
  return padHoldOf(rows);
}

// `rxItems` as the pad writes them — the same medicines, whatever key order or
// leftovers they arrived with.
const key = (items: RxItem[]) => JSON.stringify(rxItemsFromRows(rowsFromRxItems(items)));

const filled = (r: Row) => !!(r.drug.trim() || r.dose.trim() || r.food.trim() || r.duration.trim());

// A >>> line, read as `rowsFromRxItems` reads one that is not the first item.
const continues = (it: RxItem) => !it.isNote && (it.isCont ?? it.drug.trim() === "");

/**
 * The rows to draw the pad from. With nothing held, `rowsFromRxItems(items)` as
 * always. With rows held:
 *  • `items` are exactly what the held rows write → the held rows, red lines
 *    where they stood;
 *  • `items` are those with more APPENDED, beginning with a medicine or a note
 *    (a template, Add Bulk Medicine, Move to Rx) → the held rows, then the
 *    appended lines;
 *  • anything else → `rowsFromRxItems(items)`: the hold is stale, and is not
 *    put back over a prescription it was not taken with.
 * Two things are never a fit (independent review, 19/10/2026, second and third
 * passes): items that hold a line they cannot write themselves
 * (`writableItems`; only data a build from before 18/10/2026 wrote) — compared
 * as the pad writes them, such a line was set aside unseen and nobody's to
 * draw — and an append that BEGINS with a >>> line, which any device on a
 * build without the hold sends, most often a >>> line its doctor added under
 * the last medicine. Drawn after the held lines as a line of its own, that one
 * stayed in rxItems under the medicine above, and each new snapshot from that
 * device drew it once more. The pad then shows the items as they read — as the
 * printed sheet and every other reader of rxItems reads them, the >>> line
 * under the medicine before it — and says the held lines went.
 */
export function drawPad(items: RxItem[], held: Row[] | null): Row[] {
  if (!held || unwritableRows(held).length === 0) return rowsFromRxItems(items);
  if (writableItems(items).dropped > 0) return rowsFromRxItems(items);
  const written = rxItemsFromRows(held);
  const mine = key(written);
  if (key(items) === mine) {
    // With the line the doctor types the next medicine on.
    const last = held[held.length - 1];
    return last && !last.continuation && !filled(last) ? held : [...held, emptyRow()];
  }
  const rest = items.slice(written.length);
  if (rest.length > 0 && !continues(rest[0]) && key(items.slice(0, written.length)) === mine) {
    let end = held.length;
    while (end > 0 && !held[end - 1].continuation && !filled(held[end - 1])) end--;
    return [...held.slice(0, end), ...rowsFromRxItems(rest)];
  }
  return rowsFromRxItems(items);
}

const lineKey = (r: Row) => JSON.stringify([r.drug, r.isMedicine, r.continuation, r.dose, r.food, r.duration]);
// The line as written, and as the BAN / EN switch would write it.
const keysOf = (r: Row) => new Set([r, ...rxRowsIn([r], "bn"), ...rxRowsIn([r], "en")].map(lineKey));

/**
 * The lines of `before` that could not be written and are not on `after` —
 * what a redraw took off the pad, to be said. A line is still there only when
 * `after` holds it as a line that cannot be written (in either language: the
 * BAN / EN switch writes the held lines too); each line of `after` answers for
 * one line of `before`. Nothing else is taken for it: "the same dose at the
 * same place" was once — and hid a real loss behind a common dose (independent
 * review, 19/10/2026). A line put right or taken off on ANOTHER device is not
 * this function's to tell from a loss: `usePadSync` takes that device's hold as
 * its word, and asks only about what of that hold could not be drawn.
 */
export function droppedLines(before: Row[], after: Row[]): Row[] {
  const left = unwritableRows(after).map((i) => after[i]);
  const used = new Set<Row>();
  const out: Row[] = [];
  for (const i of unwritableRows(before)) {
    const r = before[i];
    const keys = keysOf(r);
    const same = left.find((s) => !used.has(s) && keys.has(lineKey(s)));
    if (same) used.add(same);
    else out.push(r);
  }
  return out;
}

/** A line the pad could not write, as the doctor wrote it — for saying it went. */
export function lineText(r: Row): string {
  const cells = [r.drug, r.dose, r.food, r.duration].map((s) => s.trim()).filter(Boolean).join(" · ");
  return `${r.continuation ? ">>> " : ""}${cells}`;
}
