# Drug history — multi-select and "Move to Rx"

Date: 2026-09-21
Status: approved by the product owner (physician) on 2026-09-21

## What changes

The Drug history modal's per-row `↻ Rx` button is replaced by row selection.
Both tabs — **Current medications** and **Distant past medication** — get a
checkbox on every medicine row, a **Select all** button and a **Move to Rx (N)**
button in the footer. Pressing Move to Rx appends the selected medicines to
today's ℞ pad.

## Why this reverses a recorded decision

On 2026-09-07 the physician decided this modal must be READ-ONLY: "no input, no
checkbox and no Add to main Rx". That decision is written into the header
comment of `DrugHistoryField.tsx`, into `DrugHistoryField.test.tsx`
("has no 'Add to main Rx' button and no Select all") and into
`client/CLAUDE.md`.

The decision it protected is unchanged: **the ℞ pad still owns the list.**
Nothing here edits a drug-history entry, and the mirror in `lib/rxDrugHistory.ts`
is still the only writer of `Patient.drugHistory`. The checkboxes select; the
only write is into `rxItems`, the pad's own state, which is exactly what the
`↻ Rx` button already did one row at a time. So this adds a second *reading*
surface onto the pad, not a second *writable* surface over the history.

The three files above are updated in the same commit, as rule 7 of the root
CLAUDE.md requires.

## Decisions taken (physician, 2026-09-21)

1. **Both tabs get the same UI.** Current medications is a mirror of today's ℞,
   so most of its rows are already on the pad and will report as such. It still
   earns the control for pre-2026-09-07 hand-typed entries that are stamped with
   the current date and are not on the pad.
2. **Nothing is invented.** A stored entry with no dose, food or duration
   reaches the pad with those cells blank. The old `↻ Rx` filled them with
   `1+0+1` / `After meal` / `Continue`; that is removed. One press of Select all
   must never write a dose the doctor did not write.
3. **No dedupe between selected rows.** The same medicine ticked on two dates
   goes to the pad twice, in the order it was ticked.
4. **A taper travels with its medicine.** Ticking a medicine takes its `↳`
   continuation lines too, as one block. A `↳` row has no checkbox of its own;
   it shows a dimmed tick when its medicine is selected.

## Rules the implementation must hold

- **Block = head medicine + the `(cont)` rows that follow it**, bounded by the
  next medicine, a note row, or the end of its date group. A `(cont)` row with
  no medicine above it inside the same group is not selectable and is never sent.
- **All-or-nothing per block.** If the head line is already on the pad, the
  whole block is skipped — a taper must never reach the ℞ without the medicine
  it belongs to.
- **"Already on the pad"** means an existing `RxItem` whose `drug`, `dose`,
  `instruction` and `duration` are all equal after trimming. Four fields, not
  the three the old button compared: two lines that differ only in the food
  instruction are two different instructions and both are kept.
  This one rule also covers ticking two byte-identical rows from different
  dates: the second is identical to the first once added, so it is skipped.
- **Notes** (`(note)` rows) and medicine rows with no drug name are not
  selectable. A note is not a medication.
- **Permission.** The buttons and the checkboxes render only when
  `can("rx.medicines")`. Without it the modal is exactly the read-only view it
  is today. This closes an existing hole: `↻ Rx` is ungated, so an assistant
  who holds `rx.drugHistory` but not `rx.medicines` can write medicines today
  even though the ℞ pad itself is locked for them.
- **Selection is per tab.** The count on the button is always the active tab's,
  so what is ticked in front of the doctor is what moves. Switching tabs keeps
  the other tab's ticks.
- **After a move** the selection for that tab clears, the modal stays open, and
  the footer reports `N added · M already on ℞`.

## Shape of the code

`client/src/lib/drugHistorySelect.ts` — pure, no React:

- `blocksFromRows(rows, keyPrefix)` → `HistoryBlock[]`, each with a stable
  `key`, the `drug` name, the `RxItem[]` it contributes, and the row indexes it
  covers (so the modal can dim-tick the taper rows).
- `appendBlocks(blocks, existing)` → `{ items, added, skipped }`, counted in
  blocks, not lines.

Both are pinned in `client/src/lib/drugHistorySelect.test.ts`. This follows the
house rule — anything that decides what lands on a prescription gets a unit test
— and the existing split in `lib/rxDrugHistory.ts` and `lib/rxRows.ts`, which
keep the clinical string handling out of the components.

`DrugHistoryField.tsx` keeps its own parser and feeds parsed rows in. It renders
checkboxes, the two footer buttons and the result line, and calls `setRxItems`
once per press.

## Verification

- `client/src/lib/drugHistorySelect.test.ts` — blocks, tapers, orphan `(cont)`,
  notes, blank cells preserved, duplicate handling, block-level skip.
- `DrugHistoryField.test.tsx` — the three assertions that pinned the read-only
  modal are rewritten to pin the new surface instead, and the existing
  mirror/parsing tests stay untouched.
- `npx tsc --noEmit` and `npm test` in `client/`.
- The flow exercised by hand at `localhost:3000`.
