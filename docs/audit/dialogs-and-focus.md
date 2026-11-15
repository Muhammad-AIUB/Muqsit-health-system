# Popups, focus, keyboard, accessibility — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/dialogs-and-focus.md`](../rules/dialogs-and-focus.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Left open by the 2026-10-12 review** — Engineering: `WorkstationSwitcher.tsx` not on `useDialog`, popup-on-top, 46 unnamed boxes, `DEFECT-INV-GROUPED`, failed-save focus; wide-screen chart name cut waits for the physician.

**Closed — kept as the record of what was done or decided**

- **Left open by the 2026-10-05/06 design pass — all closed 2026-10-12** — Four older popups on `useDialog`, calendar one Tab stop, caption focus, chart keeps its size on a narrow screen; admin `confirm()` / `alert()` gone.
- **DEFECT-E2 — the patient gate stopped the mouse, not the keyboard** — Fixed 2026-10-06 (`PatientGate` is `inert`); `Lock` leaving a section inert until reload fixed in the same commit (`client/src/lib/inert.ts`).
- **From the keyboard, every row was a Tab stop** — The list is one Tab stop with arrow keys; the veil closes the box only while nothing is ticked.
- **Escape threw the ticks away** — With medicines ticked, Escape and the veil say how to close; Add, Cancel and the × leave the box.
- **End and the Page keys could leave the row they landed on out of sight** — Row asked into view on each of the next four frames; journey runs with scroll anchoring off; not run in Safari itself.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [x] **Left open by the 2026-10-05/06 design pass — all closed 2026-10-12.** The
  four older popups (image viewer, print sheet, special advice, personal note)
  are on `useDialog`; the Investigation calendar is one Tab stop with arrow
  keys; pressing a caption puts the cursor in its box (`lib/captionFocus.ts`);
  the health-trend chart keeps its size on a narrow screen instead of
  shrinking to 5px text. (The admin console was looked at from the inside on
  2026-10-09 and its browser `confirm()` / `alert()` boxes are gone —
  `admin/CLAUDE.md`.)

- [ ] **Left open by the 2026-10-12 review** (engineering, none urgent):
  the "Your workstations" drawer and the wall a secondary account sees
  (`WorkstationSwitcher.tsx`) are not on `useDialog` — Tab walks out of them
  and the drawer does not close on Escape; `useDialog` takes "the popup on
  top" to be the last one in the document, which is not the one in front
  when another device opens a popup through device mirroring while the
  print sheet or the image viewer is up; on a WIDE screen the health-trend
  chart still cuts a name at 20 characters, so a long dosage form hides the
  brand (`Capsule (Enteric Co…`) and the cut can fall inside a number
  (`Tablet. Metformin 5…` for 500 mg) — the phone's two-line rule would fix
  both and changes the look of the chart, so it waits for the physician; with the
  keyboard inside the print sheet nothing is drawn to say so; 46 boxes
  in 18 files have no name a screen reader can say (20 not even a
  placeholder: the calculators' inputs, most of Profile settings, the
  sign-in page; the Investigation popup's result boxes are not among them —
  they have names now);
  **DEFECT-INV-GROUPED** — in a test with several boxes a number typed
  with its groups (`WBC:12,000`) is still set apart at its commas in the
  "Added results" panel (`findingParts.test.ts`, `it.fails`; the record,
  the sidebar and the print are right) — closing it needs the parts
  stored apart; after a FAILED Save & print the keyboard's place is not
  put back on the button (it ends on the page, as it does today in
  production); and the phone layout's print sheet takes the same
  `afterSave` but has not been run on a phone-sized browser.

- [x] **DEFECT-E2 — the patient gate stopped the mouse, not the keyboard.** Fixed
  2026-10-06 (`PatientGate` is `inert`); the Playwright test that pinned it is
  an ordinary regression test now. Fixing it exposed that `Lock` could leave a
  just-unlocked section inert until a reload; fixed in the same commit
  (`client/src/lib/inert.ts`).

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

- [x] From the keyboard, every row was a Tab stop (two hundred presses between
  the search and Add), and a press beside the box threw every tick away. The
  list is one Tab stop with arrow keys; the veil closes the box only while
  nothing is ticked.

- [x] **Escape threw the ticks away**, as a press beside the box had: it is
  also the key that clears the search, and one press too many emptied the box.
  With medicines ticked, Escape and the veil say how to close; Add, Cancel and
  the × leave the box.

- [x] **End and the Page keys could leave the row they landed on out of
  sight** — where Space ticks it unseen. A row is drawn a frame after it
  comes near, taller than the space kept for it, and pushes the rows below
  it down. Chromium holds the page still through that; a browser that does
  not (Safari is documented as having no scroll anchoring) does not. Reasoned in the second
  pass, answered with one ask a frame later, shown by the third pass to come
  too early — and then SEEN: with anchoring switched off and rows with two
  tapering lines, End left the last row below the edge. The row is asked
  into view on each of the next four frames; the journey runs with anchoring
  off. **Not run in Safari itself.**
