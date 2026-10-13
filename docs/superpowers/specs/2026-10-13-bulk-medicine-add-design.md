# Add Bulk Medicine — design

- Date: 2026-10-13
- Asked for by the physician (product owner); design approved in chat the same day.
- Status: approved, not built.

## What it is

A **+** button beside the ℞ mark above the OPD prescription pad. Hovering shows
"Add Bulk Medicine". Pressing it opens a box that lists **the medicines this
doctor has prescribed before**, each with the instruction the doctor most often
writes for it — dose, when to take it, duration, and any tapering lines. The
doctor ticks as many as wanted and presses **Add**; every ticked medicine is
appended to the pad with its instruction already filled in.

It is a faster way to reach what "Your usual" already offers one medicine at a
time while typing. It adds no new clinical content and no new stored data.

## Decisions (physician, 2026-10-13)

1. **One row per medicine.** A medicine the doctor writes at several doses
   appears once, with the instruction given to the most patients. Another dose
   is changed on the pad after adding, or reached by typing as today.
2. **Two orders:** *Popular* (most patients first) and *Alphabetical* (A to Z).
   Popular is the order the box opens in.
3. **Personal.** Only the signed-in doctor's own prescribing history. Never a
   combined list.

## Decisions taken from rules the app already has

These follow existing decisions; none is new.

- **"Popular" counts DISTINCT PATIENTS**, the number `DoctorRxHabit.patientCount`
  already holds and "Your usual" already shows ("30 patients", never "30×"). One
  patient returning monthly must not make a one-off dose look routine.
- **Which instruction is "the usual one"** is decided exactly as the typing
  dropdown decides its first suggestion: pinned first, then most patients, then
  most recently used. The two surfaces can never disagree about a medicine's
  usual dose.
- **A dose the doctor hid (✕ in "Your usual") is not offered.** The medicine's
  next visible instruction is shown; a medicine whose instructions are all
  hidden is not listed.
- **Nothing is invented.** A cell the doctor left blank when prescribing is
  added blank. No default dose, food or duration (the rule of Drug history's
  "Move to Rx").
- **A tapering block is one thing.** A medicine whose usual instruction has
  `>>>` lines is shown with them and added with them, in order.
- **A line already on the pad is skipped**, matched on all four of drug, dose,
  instruction and duration, and the box says so: `5 added · 1 already on ℞`.
- **The generic travels with the medicine.** Prescribing-alert rules are written
  against generics while the pad line carries the brand, so every listed
  medicine carries its generic from the server, on the same response. A bulk
  add must raise exactly the warnings typing the same medicines would.
- **OPD pad only.** Not the IPD order sheet, the Drug-history pad or the
  template editor (ward doses are not outpatient habits — design D5 of the
  habits feature).
- **Scope is the workstation doctor.** An assistant working in Dr. X's
  workstation sees Dr. X's list; a supervising doctor sees their own.
- **An assistant needs `rx.medicines`**, the pad's own key. Without it the
  button is disabled with the reason as its tooltip.

## The box

```
┌ Add Bulk Medicine ───────────────────────────────── × ┐
│ [ Popular | Alphabetical ]        [ Search medicines… ] │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ☐ Tablet. Napa 500 mg                   30 patients │ │
│ │   1+1+1 · After meal · 5 days                       │ │
│ │ ☐ Capsule. Sergel 20 mg                 22 patients │ │
│ │   1+0+1 · Before meal · 14 days                     │ │
│ │ ☑ Tablet. Deltasone 5 mg                 6 patients │ │
│ │   2+0+0 · After meal · 5 days                       │ │
│ │   ↳ 1+0+0 · After meal · 5 days                     │ │
│ └─────────────────────────────────────────────────────┘ │
│ 1 selected                          [ Cancel ] [ Add (1) ] │
└─────────────────────────────────────────────────────────┘
```

- Title "Add Bulk Medicine"; `×` is `btnClose`.
- **Order** is a two-button switch (`aria-pressed`), Popular first.
- **Search** narrows the list as typed (case-insensitive, anywhere in the
  name). It filters what is shown; ticks on rows that are filtered out are
  kept, and the footer always counts every tick.
- **A row** is a `<label>` wrapping its checkbox, so the whole row is the
  target. Name on the first line with the brand in bold as on the pad
  (`splitDrugLabel`); instruction on the second; taper lines under it with the
  `↳` glyph the pad uses. A blank cell is simply absent from the line — an
  empty instruction reads "No dose recorded" in the quiet colour, so the row
  never looks broken.
- **Count** at the right: `30 patients` / `1 patient`.
- **Footer:** `N selected`, Cancel (outline), **Add (N)** (the one filled
  button; `btnDisabled` at zero).
- **After Add** the box closes, the lines are on the pad, and the result
  (`5 added · 1 already on ℞`) is shown in a line beside the + button until the
  next press or the pad changes patient. When every ticked line was already on
  the pad the box stays open and says so.
- **Order of the added lines:** the order they stand in the list as sorted when
  Add is pressed, top to bottom.
- **Where they go:** after the last line of the pad, before the empty typing
  line. Nothing on the pad is overwritten or reordered.
- **States** (`ListState.tsx`): `Loading` while the list is fetched;
  `LoadError` with **Try again** when it fails — this is a list the doctor
  asked for, so a failure is said, unlike the silent typing dropdown;
  `EmptyState` when the doctor has no history ("No medicines yet. They appear
  here after you save prescriptions."); a quiet line when a search matches
  nothing.
- **Keyboard and layout:** `useDialog` (Escape, Tab kept inside, focus back to
  the + button — which saves nothing, so returning focus is right). Panel is
  `width: min(640px, 100%)`, `maxHeight: 100%` inside the padded veil; only the
  list scrolls. Works at phone width.
- The ticks, the order and the search are the box's own state and are not
  mirrored to other devices; the lines it adds reach them through `rxItems` as
  any pad edit does.

## Server

One new read-only route in the existing `rx-habits` module. No schema change,
no migration.

`GET /api/rx-habits/all` — `JwtAuthGuard, WorkstationGuard`, doctor from
`@WorkstationDoctorId()`.

Response:

```ts
{
  medicines: {
    id: string;          // the habit row shown
    drugKey: string;
    drugLabel: string;   // as last written; what is added to the pad
    generic?: string;    // from the medicines catalogue; absent if not found
    dose: string;
    food: string;
    duration: string;
    contLines: { dose: string; food: string; duration: string }[];
    patientCount: number;
    lastUsedAt: string;
  }[];
  truncated: boolean;    // true when the doctor has more than the cap
}
```

- One row per `drugKey`: the first non-hidden habit by
  `pinned DESC, patientCount DESC, lastUsedAt DESC, id ASC` (the typing
  dropdown's order). Returned most patients first.
- Capped at 2,000 medicines; `truncated` says when the cap was reached, and the
  box then reads "Showing your 2,000 most used medicines".
- A row whose `contLines` cannot be read is dropped whole, as in the dropdown.
- Generics are attached as the dropdown does it — candidates fetched from the
  raw `medicines` table by brand prefix, matched in code on the same normalised
  key — but in chunks, because this list is hundreds of medicines where the
  dropdown has four. A failed generic lookup never fails the list: the medicine
  then behaves like a hand-typed brand, the documented state.
- **Unlike the dropdown lookup, a failed list THROWS** (500). The dropdown is
  silent on failure by design; a box the doctor opened on purpose must be able
  to say "did not load".
- Route order: `all` is declared before `:id` (they differ in verb today, and
  must not collide if a `GET :id` is ever added).

## Client

| Unit | Purpose |
|---|---|
| `lib/api.ts` — `rxHabitsApi.all()` | the call, typed |
| `lib/bulkMedicines.ts` | pure: read the response (total — anything unreadable is skipped and counted), sort, search, turn ticked medicines into pad lines |
| `hooks/useBulkMedicines.ts` | React Query: fetch when the box opens, keyed by workstation |
| `components/prescription/BulkMedicineModal.tsx` | the box |
| `RightColumn.tsx` | the + button, the result line, appending to `rxItems` |

- `bulkMedicines.ts` builds, per ticked medicine, the same lines "Your usual"
  builds (`habitToRows` shape: head with `generic` and `fromHabit`, then one
  line per taper) and hands them to `appendBlocks` from `drugHistorySelect.ts`,
  which already knows "skip a block whose head line is on the pad" and counts
  blocks, not lines. `moveSummary` writes the result line.
- The response is read defensively: it reaches the pad, and an uncaught render
  error inside the editor unmounts the whole prescription. If any medicine was
  unreadable the box says how many were left out.
- The list is fetched once per opening and cached for the session; after a
  prescription is saved the cache is invalidated so newly learned medicines
  appear.

## What it does not do

- It does not offer medicines the doctor has never prescribed, or another
  doctor's.
- It does not let a dose be edited inside the box, or a second dose of one
  medicine be chosen there.
- It does not remember ticks between openings.
- It does not write to `DoctorRxHabit` (ticking, adding and searching teach
  nothing; only a saved prescription does).
- It does not log to the activity feed; the saved prescription is the record.

## Testing

- **Server unit** (`rx-habits.service.spec.ts`): the list is scoped by the
  doctor id it is given; hidden rows are not returned and do not hide the next
  instruction; the lead row follows the dropdown's order; unreadable
  `contLines` drop the row; generics are attached across chunks and a failed
  generic lookup returns the list without them; a failed list throws.
- **Server integration** (`server/test`, throwaway database): doctor A's list
  never holds doctor B's medicines; an assistant in A's workstation gets A's;
  the route is in the route contract.
- **Client unit** (`bulkMedicines.test.ts`): reading garbage, both sort orders
  (ties broken the same way every time), search, lines built with blanks kept
  blank, taper kept under its medicine, generic carried, a line already on the
  pad skipped, the summary text.
- **Client component** (`BulkMedicineModal.test.tsx`, jsdom):
  `itKeepsTheKeyboard()`; loading, error with Try again, empty; ticking and the
  count; ticks survive a search; Add hands over exactly the ticked medicines in
  the order shown.
- **Alert bridge**: a medicine added through the box raises the same
  prescribing alert as the same medicine typed (extend `rxHabitAlerts.test.ts`).
- **End to end** (sandbox): save a prescription, open a new visit, add the
  medicine through the box, see it on the pad with its dose.
- Verified in a real browser on the sandbox at desktop and phone width before
  it is called done. Never on `localhost:3000`.

## Documents to update with the change

`docs/API.md` (the route), `server/CLAUDE.md` (Rule 2c: the second read path
and why it throws), `client/CLAUDE.md` (the box and its rules),
`docs/DOMAIN.md` (the concept and the physician's decisions).
