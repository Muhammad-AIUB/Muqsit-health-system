# Add medicine (Drug history) — design

- Date: 2026-10-14
- Asked for by the physician (product owner); design approved in chat the same day.
- Status: approved, not yet built.

## What it is

A **"+ Add medicine"** row at the top of each Drug history tab — **Current
medications** and **Distant past medication** alike. Pressing it opens one
inline row: the medicine name (typed, with the same database-backed
suggestions the ℞ pad's medicine box offers), then **Dose**, **Food** and
**Duration**, then **Add**.

Pressing Add writes one new, date-stamped line straight into the patient's
drug history — the same stored list `DrugHistoryField` already reads, in the
exact format `rxDrugHistory.ts` already writes (`dd/mm/yyyy: Drug — dose —
food — duration`). A Current-tab add is stamped with today's visit date; a
Distant-past add carries no date at all and files under the existing "Earlier
(no date)" group (physician's decision — no date box is offered).

It is a **new line, never a correction**. Neither tab becomes editable: an
existing row still cannot be changed or removed from this modal, exactly as
`client/CLAUDE.md`'s standing rule requires ("Do not re-add an editor here
without asking"). This closes the gap that rule's own text names as open —
"there is still no way in the app to hand-record a medication the patient
takes that is not on today's ℞" — with the "deliberate add... affordance" it
asks for, not a re-editable pad.

A medicine added this way reaches today's ℞ only if the doctor afterwards
ticks it and presses the existing **Move to Rx** — exactly as any other
history row does today. Nothing here writes to `rxItems` directly.

## Decisions (physician, 2026-10-14)

1. **Both tabs get it.** Current medications and Distant past medication each
   get their own "+ Add medicine" row; what is added stays in that tab until
   moved.
2. **It is additive, not a replacement.** The existing automatic paths are
   unchanged: the ℞ pad still mirrors into Current medications live
   (`rxDrugHistory.ts`), and a visit's medicines still roll over into Distant
   past on the next visit. Typing is a third way to add a line, alongside
   those two.
3. **Added-to stays added-to; "Move to Rx" is the only bridge to the
   prescription.** A typed addition never appears on today's ℞ or the printed
   sheet by itself.
4. **No date field.** A Distant-past addition is undated — "Earlier (no
   date)", the group that already exists for entries with no readable date.
5. **Dose, food and duration are all collected at add-time**, not just the
   medicine name — matching what a stored entry already carries.

## Decisions taken from rules the app already has

- **Nothing is invented.** A cell left blank at add-time is stored blank —
  the same rule `drugHistorySelect.ts` already holds for Move to Rx, and the
  reason the old auto-filling "↻ Rx" button was removed in the first place.
- **The medicine is compared the way the app compares medicines everywhere
  else** (`sameMedicine` / `instructionKey` in `lib/medicineKey.ts`): spacing,
  capitals and `Tab` for `Tablet.` are typing, not meaning; a different
  strength, form or brand is a different medicine.
- **Only an exact duplicate (same medicine *and* same dose/food/duration) in
  the SAME tab is refused** — matching "Add Bulk Medicine"'s "already on ℞"
  rule, adapted to "already in Current medications" / "already in Distant
  past". The same medicine at a different dose is always a new line; which
  dose is right is the doctor's judgement, never the app's to decide for
  them.
- **A taper is not offered here.** Add-medicine writes one `med` line, no
  `(cont)` continuation — a taper is still only ever written by the ℞ pad
  mirror or Move to Rx, which already carry that rule correctly. Recording a
  historical taper is out of scope; flagged under "what it does not do".
- **Permission:** gated exactly as the rest of the field already is
  (`rx.drugHistory`, via the `Lock` wrapping `DrugHistoryField` in
  `LeftColumn.tsx`). No new permission key — this does not touch `rxItems`,
  so `rx.medicines` is not required.

## The row

```
┌ Drug history ──────────────────────────────────────── × ┐
│ [ Current medications (9) ] [ Distant past medication ] │
│                                                          │
│ + Add medicine                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ [ Medicine name…        ]  [dose] [food] [duration] ✕ ││
│ │   ▾ Tablet. Napa 500 mg            (suggestions)      ││
│ │   ▾ Tablet. Napa Extra 500+65 mg                       ││
│ └──────────────────────────────────────────── [ Add ] ──┘│
│                                                          │
│ ☐ 1. Capsule (Enteric Coated). Maxpro 20 mg  1+0+1 ...  │
│ ☐ 2. Capsule (Enteric Coated). Sergel 20 mg  1+0+1 ...  │
│ …                                                        │
│                                      [Select all] [Move to Rx] [Close] │
└──────────────────────────────────────────────────────────┘
```

- The "+ Add medicine" row sits above the existing list, inside the same
  scrolling area, one per tab (so the Current tab's row and the Distant-past
  tab's row are two independent, separately-closed forms).
- The medicine box reuses `useMedicineSearch` + `fmtMedicine` exactly as
  `MedicinePad.tsx` does, so the same catalogue, the same debounce, the same
  formatted label (`Tablet. Napa 500 mg`) a doctor already recognises from the
  ℞ pad.
- Add is disabled until a medicine name is present (dose/food/duration may all
  be blank — "nothing invented" allows an empty instruction, as it does
  everywhere else in this codebase).
- On the duplicate refusal, the row stays open with a short inline note
  ("already in Current medications") instead of silently adding a second
  copy; the doctor can still change the dose and press Add again.
- After a successful Add, the new line appears in the list immediately (it is
  live state, same as every other entry) and the add-row clears, ready for
  another medicine, until ✕ or Close.

## Client

| Unit | Purpose |
|---|---|
| `lib/drugHistoryAdd.ts` *(new)* | pure: build the stored entry string for a date (`cd` or the existing "no date" marker), and the exact-duplicate check against a tab's parsed entries |
| `components/prescription/DrugHistoryField.tsx` | the add-row UI, per tab; calls `setDrugHistory` with the appended entry |

- `drugHistoryAdd.ts` does **not** duplicate `rxDrugHistory.ts`'s `SEP`/format
  constant — it imports it, so the two can never drift the way the file
  header's "pure string transformation" promise depends on.
- The write is a plain `setDrugHistory((prev) => [...prev, entry])` inside
  `MuqsitContext` — `drugHistory` already rides the existing debounced draft
  auto-save and the `Patient.drugHistory` write on Save, so no new
  persistence path, no new API route, no schema change.
- The mirror (`syncRxDrugHistory`) only ever withdraws an entry it added
  itself (`rxDerivedRef`); a typed addition is never in that set, so it is
  safe from the mirror by the mirror's own existing rule — the same rule that
  already protects a doctor's hand-typed note today.

## What it does not do

- Does not edit or remove an existing stored entry (still no editor over the
  list — the standing rule stays in force).
- Does not write to `rxItems` or the printed prescription by itself — only
  Move to Rx does that, unchanged.
- Does not accept a date for a Distant-past addition.
- Does not record a tapering (`(cont)`) line.
- Does not teach "Your usual" / `DoctorRxHabit` anything — this is a history
  record, not a prescribing habit.

## Testing

- **Client unit** (`drugHistoryAdd.test.ts`): entry built with blanks kept
  blank; Current stamps today's date, Distant past stamps the no-date marker;
  exact duplicate (same medicine, same dose/food/duration) in the same tab is
  refused; same medicine at a different dose is allowed; a label typed
  without its dosage form is still recognised as the same medicine as one
  that has it (`sameMedicine`).
- **Client component** (`DrugHistoryField.test.tsx`, jsdom, extending the
  existing file): the add-row appears on both tabs independently; typing
  shows suggestions from the (mocked) medicine search; Add with only a name
  (blank dose/food/duration) succeeds; the new line shows in the right tab
  immediately; a duplicate shows the inline note and is not added twice; an
  assistant without `rx.drugHistory` never sees the add-row (the `Lock`
  wrapper already covers this — a regression test, not new behaviour).
- **Mirror safety** (extend `rxDrugHistory.test.ts` or add alongside):
  a typed addition dated today is never withdrawn by `syncRxDrugHistory` when
  the ℞ pad changes, confirming the existing "withdraws only what it added"
  rule actually holds for this new writer.
- Verified in a real browser on the sandbox (never `localhost:3000`): add a
  medicine to Current, confirm it survives a reload (draft) and a Save; add
  one to Distant past, confirm it appears under "Earlier (no date)"; tick a
  typed addition and Move to Rx it.

## Documents to update with the change

`client/CLAUDE.md` (the Drug-history section — note the modal gained an
ADD-only affordance, and why that does not reopen the "two writable
surfaces" hazard), `docs/DOMAIN.md` if it describes Drug history's
capabilities, `FUNCTIONAL-AUDIT.md` if any open thread there is closed by
this.
