# Patient chat, notes, activity feed — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/chat-and-notes.md`](../rules/chat-and-notes.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Message tab** — Placeholder, no messaging.

**Closed — kept as the record of what was done or decided**

- **A test that failed one run in four was right (2026-10-12)** — Personal note reached its `draft` one render late, so an instant Print printed an empty note; Print reads the note as it stands; `draft` removed in the fourth review.
- **…and a fourth time, 2026-10-12 — three were production defects** — Personal note no longer follows the editor's patient; only what was SENT is marked saved; `1,200/cmm` no longer drawn as 1; chart names laid out together; Print tested.

---

# The threads, in full

## 2. Stub buttons / placeholder views

- [ ] **Message** tab — placeholder, no messaging.

## Open threads — decisions owed, not bugs (2026-07-27)

- [x] **A test that failed one run in four was right (2026-10-12).** The
  flaky-test detector (`scripts/test-repeat.mjs`, the whole client suite four
  times) named three tests of the personal note's print question. The cause
  was in the note, not the tests: a note that has just loaded reaches its
  `draft` one render late, and Print pressed in that instant printed an
  empty note and skipped the sensitive-text question. Nothing could leak —
  the draft was empty — and no hand is that fast. Print read the note as it
  stood (25 runs of those tests, none failed; 3 of 12 before) — and the
  `draft` itself went the same day, in the fourth review below.

- [x] **…and a fourth time, 2026-10-12 — three of its findings were defects
  already in production** (the two in the personal note, and `1,200/cmm`).
  (1) **The personal note followed the editor's patient while
  it stood open.** When another device picked the next patient from the
  search box (device mirroring), or a patient chosen from the OPD queue
  finished loading after the note was opened, words typed for one patient
  were saved into the NEXT patient's private note, under that patient's
  details, and a print question asked about one note printed the other.
  Reproduced with two browsers before it was fixed: the open box read
  "Patient Name: Note Patient Beta" over the words typed for Alpha
  (`e2e/tests/personal-note.spec.ts`, which now holds it). The note is
  opened FOR a patient and is theirs until it is closed. **Seen by the
  user: an open note no longer follows the editor to the next patient** — it
  is closed and opened again. (2) **What was typed while a save was on its way was marked
  saved with the rest** — thrown away when the answer came, or left on the
  screen looking saved and lost on Close without a question. Also in
  production; only what was SENT is saved now, and the rest stays, open and
  unsaved. (3) **`1,200/cmm` was still drawn as 1** on the chart (and
  `2,5 (target 2-3)` as an INR of 2): the guard above only knew a bare
  number after the comma. A digit after the comma is the rest of the number
  now, whatever follows it; ETT's METs, whose next box writes no name of its
  own, keeps the narrower rule. (4) **"Two different medicines are never
  drawn under one name" was not true**, and three documents said it. On a
  phone a tablet and an injection of one medicine and strength had one
  name, so had two salts of calcium, two amlodipine combinations at the
  same strengths, and four parameters of Hb electrophoresis (four lanes all
  `Hb / Electrophores…`). No rule for one name can promise it; the names of
  a chart are laid out together now and any that come out the same are
  written again from where they differ. Held for any TWO names (20,000
  look-alike pairs a run); not promised for more than two that agree for
  longer than two lines can show, in different places. (5) Nothing tested
  what Print prints: the note's tests now press the real buttons and read
  the print frame, and the round's tests were checked by breaking the code:
  34 deliberate breaks across its five files, 32 caught. The two that were
  not change nothing that can be seen — one was a condition that could
  never matter, and was taken out; the other swaps a line for one that
  cannot differ from it.
  Also: a known dosage form is no longer left off where it fits beside the
  brand (`Syrup. Napa` over `120 mg/5 ml`); the month list's "closed from
  another device" test could not fail and now can; the sign-in helper of
  the browser tests waits for the page's script and for the page
  separately. (Three of these were not right yet — the fifth review.)
