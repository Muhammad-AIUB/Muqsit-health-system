# "Your usual", learned phrases, Add Bulk Medicine, drug advice — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/habits-and-phrases.md`](../rules/habits-and-phrases.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **A medicine only saved with no dose, timing or duration is not listed** — Product decision: list such medicines sooner? That means reading medicines from the prescriptions themselves with a distinct-patient count apart from the habit table.
- **"Popular" counts the patients given the instruction SHOWN** — Product decision: count patients per medicine rather than per instruction; needs the same work as the item above (adding counts would double-count a patient).
- **A medicine already on ℞ is never changed from the box** — Physician to say whether the box should put the tapering lines under the line already on the pad (Deltasone example); it would be the first change rather than add.
- **One medicine under two generics in the catalogue** — Physician to choose: attach the first generic, carry BOTH for warnings, or neither; operator to read the real `medicines` table on the VPS first (API log names each case).
- **A hand-typed line stays without its generic when the box skips it** — Physician to decide whether the box may lend its generic to a hand-typed line already on the pad (`tab barcavir 0.5mg`, no warning fires).
- **The same medicine can be added at a second dose** — Physician: should the box refuse a medicine already on the prescription at ANY dose, instead of marking it **On ℞**?
- **A row with no generic says so only by not showing one** — Physician to decide whether the row should say in words that its prescribing warnings will not fire, and in which words.
- **"Your usual" in place of a medicine with `>>>` lines** — Physician to say whether a pick should replace the old `>>>` lines; now the habit's own `>>>` lines go first and the old ones are kept after them.

**To do — engineering work that is known and not done**

- **The documents for this feature are long for its size** — The client guide's section was rewritten shorter; root `CLAUDE.md` patterns kept since each applies beyond this feature.

**Known limits and defects, recorded on purpose**

- **Add Bulk Medicine — also not done, deliberately** — Not on the IPD order sheet; lines not counted in `N of M ℞ lines inserted from "Your usual"`, so box use is not measured; result line stays until next press or patient.
- **The name in the result line is the label as written, at any length** — Two long labels make a long line (it wraps); a label with a quotation mark is quoted inside quotation marks. Cosmetic.
- **Add Bulk Medicine — left as they are** — Try again takes the focus; no test holds that the pad hands the box its patient's id; the guides are long for this feature's size.

**Closed — kept as the record of what was done or decided**

- **One dose per medicine in the box** — Decided (one row per medicine); other doses reached by typing; noted because the first doctor who writes a medicine at two usual doses will ask.
- **A brand of one letter was never looked up** — Closed 2026-10-14: the catalogue is asked by an equality on the brand's first word instead of a prefix (`e%`).
- **A row showed how many patients and not WHEN** — The date is beside the count, as in "Your usual" (`lib/lastUsed.ts`, one function for both).
- **A medicine with no generic looked like any other** — The generic is shown under the name; a row without one shows none.
- **The search could be a moment behind the keyboard** — The rows are brought up to what is typed before Tab lands on them (`napa`, Tab, Space no longer ticks a stale row).
- **The result did not say WHICH medicine is now on ℞ more than once** — It names it (two at most; a count beyond that).
- **Row height, amber line, arrow hint and "2,000" — closed** — Undrawn row 18px taller, amber line not read by screen readers, no arrow-key hint, "2,000" written on both sides: all closed.
- **A line typed without its dosage form was not the same medicine** — Decided by the physician (2026-10-14): a label with no form is the same medicine as any form of that name and strength (`sameMedicine`); both screens.
- **"Your usual" learned a Bangla and an English instruction as two habits** — `signatureOf` reads Bangla as English, `ALGO_VERSION` 2; rebuild done on the VPS 2026-10-15 (297 → 297 rows); fold only tested on the test DB, not real Bangla data.
- **A folded habit is stored in the first / newest wording** — Since 2026-10-15 the three columns are SHOWN in the current language everywhere; display only; past prescriptions shown as saved.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

The + beside the ℞ mark lists the doctor's own medicines from the same learned
rows "Your usual" reads (`client/CLAUDE.md`, the "Add Bulk Medicine" bullet).
Three limits follow from that, each a product decision and none taken here:

- [ ] **A medicine only ever saved with no dose, timing or duration is not in
  the list.** The request was "all other medicines the doctor has prescribed".
  But an empty line is not learned as a habit — the rule that stops a blank
  suggestion ranking above the real dose (`blocksFrom`, found in production on
  Tycil). Such a medicine appears once it has been saved with any instruction
  beside it. Listing it sooner means reading medicines from the prescriptions
  themselves, with a distinct-patient count worked out apart from the habit
  table — its own piece of work.
- [ ] **"Popular" counts the patients given the instruction SHOWN.** A medicine
  written at three doses for ten patients each stands below one written at one
  dose for eleven. The record holds a distinct-patient count per instruction,
  not per medicine, and adding the three counts would count a patient whose
  dose was changed twice. Counting patients per medicine needs the same work as
  the item above.
- [ ] **One dose per medicine in the box.** Decided (one row per medicine); the
  other doses are reached by typing, as before. Noted here because the first
  doctor who writes a medicine at two usual doses will ask.

Also not done, deliberately: the box is not on the IPD order sheet (ward doses
are not outpatient habits); a line added from it is not counted in the
`N of M ℞ lines inserted from "Your usual"` activity line (it was not inserted
from "Your usual"), so how much the box is used is not measured anywhere; and
the line beside the + that says what was added stays until the next press or
the next patient, also after the lines it speaks of have been edited.

Found in its first review (2026-10-13, before release), fixed, and what is left
of each for the physician or the operator to decide:

- [ ] **A medicine already on ℞ is never changed from the box.** With Deltasone
  on the pad at 2+0+0 and no tapering lines, ticking the box's Deltasone (which
  has them) adds nothing — a line that is on the pad is not written twice — and the line beside
  the + reads `… 1 already on ℞ — its tapering lines differ there`. It used to
  say "with the same instruction". Whether the box should instead put the
  tapering lines under the line that is there is the physician's to say; it
  would be the first thing the box changes on the pad rather than adds.
- [ ] **One medicine under two generics in the catalogue.** Where the
  `medicines` table lists the same form, brand and strength under two different
  generics, "Your usual" and the box both attach the first — the first in a
  stated order since this change (brand, form, strength, then generic),
  whichever row came back first before it. A wrong generic
  is a warning on the wrong medicine or none on the right one. The API log now
  names each such medicine and the generics it met, once per start of the API
  (`the catalogue lists "…" under more than one generic (A | B)`): catalogue
  data, no patient and no doctor, so the answer can be read off the log. A
  third way to put to the physician with it: carry BOTH generics for the
  warnings, which errs towards a warning rather than silence. Attaching neither is the stricter rule, but it would
  also take warnings away wherever the two spellings are one drug written two
  ways, so it needs a look at the real table first — by the operator, on the
  VPS; it was not read for this.

- [ ] **A line typed by hand stays without its generic when the box skips the
  same medicine.** With `tab barcavir 0.5mg` typed on the pad (no generic, so no
  warning — the known gap of a hand-typed brand), ticking Barcavir in the box
  adds nothing: it is the same medicine and line. Before the first review it
  went on as a second Barcavir line, which is wrong, but that line carried the
  generic and its warning fired. The box could lend its generic to the line that
  is there — the medicine is proved the same by the key the app uses everywhere
  — but that is the box changing a line, and the physician's to decide.
- [x] **A brand of one letter was never looked up** in the catalogue, because
  the lookup was a prefix and `e%` is every brand beginning with E. Closed on
  2026-10-14: the catalogue is asked by an equality on the brand's first word,
  which a one-letter word can be like any other.

From a second, independent review of the whole feature (2026-10-14), and what
was done with it:

- [ ] **The same medicine can be added at a second dose.** A LINE is not
  written twice; a medicine can be — Napa is on the pad for 3 days, the box's
  Napa is for 5, and ticking it adds a second Napa line. That is the approved
  rule (which dose is right is the doctor's judgement, as in "Move to Rx"), and
  five sentences of this repository said the opposite. What changed: the row
  carries an **On ℞** mark before it is ticked, the line beside the + says
  `… is now on ℞ more than once`, and the pad scrolls to what was added.
  **For the physician:** should the box refuse a medicine that is already on
  the prescription at ANY dose, instead of marking it?
- [x] A row showed how many patients and not WHEN; a dose given to twelve
  patients two years ago read like last week's. The date is beside the count,
  as in "Your usual" (`lib/lastUsed.ts`, one function for both).
- [x] A medicine with no generic — one the catalogue does not list — looked
  like any other, though its prescribing warnings will not fire. The generic
  is shown under the name; a row without one shows none.

- [ ] **The documents for this feature are long for its size**, and several
  comments told the story of its reviews instead of the rule. The client guide's
  section was rewritten shorter; the root `CLAUDE.md` patterns were kept, since
  each is a lesson that applies beyond this feature.

From the second pass of the independent review (2026-10-14, before release) —
nothing in it was held to block a release; what was done, and what is left:

- [x] **The search could be a moment behind the keyboard.** Its rows are drawn
  after the key press, so that a long list does not hold up typing — and
  `napa`, Tab, Space on a slow machine ticked the first row of the list as it
  stood before the search. The rows are brought up to what is typed before Tab
  lands on them.

- [x] **The result did not say WHICH medicine is now on ℞ more than once.** It
  names it (two at most; a count beyond that): `3 added · “Tablet. Napa 500
  mg” is now on ℞ more than once`.

- [x] A row not yet drawn stood 18px taller than a drawn one without
  tapering lines (the number given is what a row holds; its padding is
  added); the amber line was put on the page with its words in it, which a
  screen reader often does not read out; nothing said that the arrows move
  along the list; and "2,000" was written out on this side as well as the
  server's. All closed.
- [ ] **The name in the result line is the label as written, at any length.**
  Two long labels make a long line (it wraps), and a label with a quotation
  mark in it is quoted inside quotation marks. Cosmetic.
- [x] **A line typed on the pad without its dosage form was not known to be
  the same medicine.** With `Napa 500 mg` typed by hand and `Tablet. Napa 500
  mg` ticked in the box, there was no On ℞ mark, the result read `1 added`,
  and the pad had two Napa lines. **Decided by the physician (2026-10-14):**
  a label with no form is the same medicine as any form of that name and
  strength — never another strength ("Sergel 20 and Sergel 40 mg are not the
  same"), and never two forms for one (`sameMedicine`). Both screens.
- [ ] **A row with no generic says so only by not showing one.** Its
  prescribing warnings will not fire. Whether the row should say that in
  words, and in which, is the physician's.
- [ ] Left as they are: Try again takes the focus with it when it is pressed
  (the next Tab brings it back into the box); no test holds that the pad
  hands the box its patient's id — the rule itself is held, in
  `BulkMedicineButton.test.tsx`; and what is written about this feature in
  the guides is long for its size.

### BAN writes the ℞ dose / food / duration in Bangla (2026-10-14)

- [x] **"Your usual" learned a Bangla and an English instruction as two
  habits** (code fixed 2026-10-15; **needs the deploy, then one run of the
  rebuild**). A prescription saved in BAN carries `খাবারের আগে`, `১+০+১`; the
  habit key folded typography only, so the same dose was learned twice and its
  distinct-patient count split between two rows. `signatureOf` now reads a
  Bangla cell as its English (`server/src/rx-habits/rxLanguage.ts`, the
  physician's table, pinned against the client copy by one literal table),
  `ALGO_VERSION` is 2, and the rebuild keeps a `hidden`/`pinned` flag set on any
  wording that folds in. **Still to do on the VPS, after the deploy:**
  `cd /root/muqsit/server && node scripts/rebuild-rx-habits.js --dry-run`, read
  it, then without `--dry-run`. **Done 2026-10-15 on the VPS** (`algoVersion = 2`,
  297 rows → 297 rows, 218 prescriptions scanned, flags 1 of 1): no Bangla and
  English pair existed yet, so nothing folded; every row is now stamped version
  2. The fold itself has therefore only been run against the test database
  (`server/test/rx-habits-bangla.int-spec.ts`), not against real Bangla
  prescriptions in production.
- [x] **A folded habit is stored in the wording written first on the live path,
  and the newest after a rebuild** — Bangla or English. Since 2026-10-15 it does
  not show: the three columns are SHOWN in the current language wherever they
  appear — "Your usual" (and its hidden list and Undo bar), Add Bulk Medicine,
  and Drug history's Current / Distant past rows — and inserted in it. Display
  only; the stored text is untouched. Not covered: a past prescription opened
  from "Patient's Prescriptions and reports" is shown as it was saved — it is
  the record of that visit.

### A `>>>` dose under the wrong medicine — closed at the source (18/10/2026)

- [ ] **"Your usual" in place of a medicine with `>>>` lines** puts the habit's own `>>>` lines first and keeps the old ones after them (insertion never overwrites). It is on the screen to see. Whether a pick should replace the old `>>>` lines is the physician's to say.
