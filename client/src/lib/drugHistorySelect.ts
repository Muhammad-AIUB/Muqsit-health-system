// ⚕️ Turns the rows of ONE Drug-history list into the selectable blocks the
// modal ticks, and a ticked selection into the lines that reach the ℞ pad.
//
// Physician's decision (2026-09-21): the per-row "↻ Rx" button is replaced by
// checkboxes, Select all and one "Move to Rx". Four rules came with it, and each
// is held down by a test in `drugHistorySelect.test.ts`:
//
//  1. **Nothing is invented.** A stored entry with no dose, food or duration
//     reaches the pad with those cells BLANK. The button this replaces filled
//     them with `1+0+1` / `After meal` / `Continue`; one press of Select all
//     would have written a dose the doctor never wrote onto a dozen medicines.
//  2. **No dedupe between ticked rows.** The same medicine ticked on two visit
//     dates goes to the pad twice, in tick order. Which of two doses is the
//     right one is a clinical judgement, and it is the doctor's.
//  3. **A taper travels with its medicine.** A `(cont)` row belongs to the
//     medicine above it, so it has no tick of its own and is carried by the
//     block. A block is ALL-OR-NOTHING: a taper must never reach the ℞ without
//     the medicine it qualifies.
//  4. **Only a line that is already on the pad is skipped.** Four fields must
//     match — drug, dose, instruction, duration — not the three the old button
//     compared. Two lines differing only in the food instruction are two
//     different instructions, and both are kept. The DRUG is compared as the
//     app compares medicines everywhere else (`sameMedicine`): how a label is
//     spaced or capitalised, and `Tab` for `Tablet.`, is how it was typed and
//     not what it says. Compared letter for letter, a medicine typed by hand
//     at an earlier visit went on the pad beside the same one picked from the
//     list today, at the same dose (in production until the release that carried
//     this). A label typed WITHOUT its form is the same medicine as one with
//     it, at the same name and strength (physician's decision, 2026-10-14).
//     A strength, a form or a brand of its own is another medicine, as ever —
//     and what reaches the pad is the entry as the history has it. The dose,
//     food and duration are compared with their capitals and spaces set aside
//     (`instructionKey`, same decision), and a NOTE on the pad that reads as
//     the medicine is a line of it with nothing in those three.
//
// Like `lib/rxDrugHistory.ts`, this deliberately does NOT import the modal's
// parser: it takes rows that are already split into kind + body, so the entry
// format is read in exactly one place and this file stays a pure string-to-
// RxItem mapping that a test can drive directly.

import type { RxItem } from "@/types";
import { instructionsKey, MedicineMap } from "@/lib/medicineKey";

/** The three row kinds of the stored format, as `DrugHistoryField` parses them. */
export type HistoryKind = "med" | "note" | "cont";

/** One parsed drug-history row: the date stamp is already stripped off. */
export interface HistoryRow {
  kind: HistoryKind;
  /** The part after `dd/mm/yyyy:` — `Drug — dose — food — duration`. */
  body: string;
}

/** A head medicine and the tapering lines under it: one tick, one ℞ block. */
export interface HistoryBlock {
  /** Stable within a list; what the modal stores in its selection set. */
  key: string;
  /** The medicine name, for the modal's own labelling. */
  drug: string;
  /** Head first, then each taper, ready to append to `rxItems`. */
  items: RxItem[];
  /** Indexes into the rows this block covers — head first. Lets the modal show
   *  a taper as dim-ticked when its medicine is ticked. */
  rows: number[];
}

// The same separator `lib/rxDrugHistory.ts` writes. Blank cells stay blank:
// `"Napa — — — "` is a medicine with no dose recorded, not a parse failure.
const SEP = " — ";
const cells = (body: string): string[] => body.split(SEP).map((x) => x.trim());

/**
 * The blocks of one list, in display order.
 *
 * A block opens on a medicine row that has a name and stays open across the
 * `(cont)` rows under it. It is closed by the next medicine, by a note (a note
 * is not part of a dosing instruction), and by the end of the list — which is
 * why the caller passes ONE date group at a time: a taper can never attach
 * itself to a medicine prescribed on a different visit.
 *
 * Not selectable, and never sent:
 *  • a note row — a note is not a medication;
 *  • a medicine row with no drug name — there is nothing to prescribe;
 *  • a `(cont)` row with no medicine above it in the same list, or one whose
 *    dose, food and duration are all blank — it carries no instruction.
 */
export function blocksFromRows(rows: HistoryRow[], keyPrefix: string): HistoryBlock[] {
  const out: HistoryBlock[] = [];
  let open: HistoryBlock | null = null;

  (rows ?? []).forEach((r, i) => {
    if (!r) return;
    if (r.kind === "note") { open = null; return; }

    if (r.kind === "cont") {
      if (!open) return;
      const [dose, food, duration] = cells(r.body);
      if (!dose && !food && !duration) return;
      open.items.push({ drug: "", dose: dose ?? "", instruction: food ?? "", duration: duration ?? "", isCont: true });
      open.rows.push(i);
      return;
    }

    const [drug, dose, food, duration] = cells(r.body);
    if (!drug) { open = null; return; }
    const block: HistoryBlock = {
      key: `${keyPrefix}#${i}`,
      drug,
      items: [{ drug, dose: dose ?? "", instruction: food ?? "", duration: duration ?? "", isCont: false }],
      rows: [i],
    };
    out.push(block);
    open = block;
  });

  return out;
}

/** What, beside the medicine, makes two ℞ lines the same line: its dose, food and duration, typed however. */
const cellsOf = (it: RxItem): string => instructionsKey(it.dose, it.instruction, it.duration);

// What on the pad stands for a medicine's FIRST line. A medicine's own line.
// A NOTE that reads as the medicine stands for a line of it with no dose, food
// or duration and NO tapering lines — added again from the history, the name
// was printed twice (physician's decision, 2026-10-14; one that only mentions
// the medicine is not it); an entry whose doses are in its tapering lines is a
// regimen, and is added (review, before release). Never a tapering line: on
// the pad it has no name today, but one read back from the server carries its
// medicine's, and would then have stood for that medicine's first line. (The
// "Add Bulk Medicine" box reads the pad to the same rule, in its own `readPad`.)

/**
 * The lines the ticked blocks contribute to a pad that already holds `existing`.
 *
 * `added` and `skipped` count BLOCKS, not lines — a medicine and its taper are
 * one thing to the doctor who ticked it, so the footer reads "3 added" and not
 * "5 added". Only the head line is tested against the pad: if that line is
 * already there the whole block is skipped, which is also what makes ticking
 * the same line on two dates add it once — as the first of the two wrote it.
 */
export function appendBlocks(
  blocks: HistoryBlock[],
  existing: RxItem[],
): { items: RxItem[]; added: number; skipped: number } {
  const seen = new MedicineMap<true>();
  const notes = new MedicineMap<true>();
  for (const it of existing ?? []) {
    if (!it || it.isCont) continue;
    (it.isNote ? notes : seen).add(it.drug, true, cellsOf(it));
  }
  const items: RxItem[] = [];
  let added = 0;
  let skipped = 0;

  for (const b of blocks ?? []) {
    const head = b?.items?.[0];
    if (!head) continue;
    const asNote = b.items.length === 1 && notes.has(head.drug, cellsOf(head));
    if (seen.has(head.drug, cellsOf(head)) || asNote) { skipped++; continue; }
    seen.add(head.drug, true, cellsOf(head));
    items.push(...b.items);
    added++;
  }

  return { items, added, skipped };
}

/** The footer line after a move: honest about what did not go. */
export function moveSummary(added: number, skipped: number): string {
  const parts: string[] = [`${added} added`];
  if (skipped) parts.push(`${skipped} already on ℞`);
  return parts.join(" · ");
}
