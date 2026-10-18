# Muqsit Health System — Functional Audit & TODO

Audit of what works, what doesn't persist, and what's a stub. Updated as items are fixed.

## 0. Operational
- [ ] **Restart API server** — stop it, run `npx prisma generate` in `server/`, then `npm run dev`.
      New columns (`hmSelectedDrugs`, `familyMembers`, `favouriteInvestigations`, `IpdAdmission.clinical`)
      are live in Postgres but the running NestJS process still uses the old Prisma client.
      All saves silently succeed in Postgres but new columns won't be read back until after restart.

## 1. Not persisted (in-memory only — "save & reload = gone")
- [x] **Family tree** (`familyMembers`) — now saved to `Patient.familyMembers` (JSONB). Loaded on patient open.
- [x] **Health-monitoring drug selections** (`hmDrugs`) — now saved to `Patient.hmSelectedDrugs` (TEXT[]). Loaded on patient open.
- [ ] **Supervising doctor list** — hardcoded mock; add/edit/delete not wired.
- [ ] **Investigation / report images** (base64 `invImages` pool) — findings *text* persists; uploaded **images**
      are session-only. (Bigger fix: upload to the VPS `/uploads`, store URLs.)
- [ ] **On-examination vitals** (OE popup, `OeData`) — folded into investigation text, not stored structured.

## 2. Stub buttons / placeholder views
- [ ] **Message** tab — placeholder, no messaging.
- [ ] **Research companion → Compare / Export** — no click handlers.
- [x] **Health monitoring → "Export Patient's Data"** card — was decorative; **removed** (2026-07) rather than left as a button that does nothing on a clinical screen.
- [ ] **Patient Settings → Data security level** — disabled placeholder.
- [x] **Settings → Badges / Supervisors & role models** — intentionally disabled ("Coming soon").

## 3. By design (not a bug)
- ~~Prescription draft saves only on **Save & print**~~ — **now auto-saved server-side.** The whole editor
  (header + clinical sections + investigation findings + medicines + advice) is debounced-saved to
  `PrescriptionDraft` (one row per doctor) and re-hydrated on reload, so a refresh no longer loses work.
  Save & print still creates the permanent prescription record.
- Investigation findings added via the popup now log to the activity feed (Notification section) on every
  add path — including closing the popup, not just the per-test "Add" button.

## Fix order (this pass)
1. Health-monitoring drug selections — persist on the patient.
2. Family tree — persist on the patient.
3. Supervising doctor list — real add/edit/delete on the patient.
4. Research Export — client-side CSV.
5. Investigation/report image persistence (VPS upload) — larger, separate.

## Open threads — decisions owed, not bugs (2026-07-27)

These came out of the health-trend-chart work and its review. Each one is a
**product decision**, deliberately not taken unilaterally. Read the linked
CLAUDE.md section before picking one up.

- [ ] **Unowned patients are retained but unreachable.** Deleting a doctor no
  longer deletes their patients (`Patient.doctorId` → `SetNull`), which is the
  owner's stated model: a patient is not the property of the account that
  registered them. But `accessibleWhere()` matches owner-or-supervisor, so a
  patient with `doctorId = null` cannot be found by the next doctor's mobile
  lookup. The owner described the intended path as "mobile number **and security
  access**" — what that second half means is the open question. Widening the
  lookup to unowned patients exposes PII across practices, so it needs its own
  design: does an unowned patient appear to every doctor or must they be claimed;
  does claiming expose the prior history or only new visits; is patient consent
  (OTP?) required. See `server/CLAUDE.md` → Rule 2.
- [ ] **RPI maturation bands** (`lib/calculators/corrected-reticulocyte.ts`) are
  set to the standard published table (36-45 → 1.0, 26-35 → 1.5, 16-25 → 2.0,
  ≤15 → 2.5) after two earlier versions disagreed with it. The table is written
  into the comment. If the practice follows a different source, change it there
  and say which — do not re-band from memory.
- [ ] **The "Symptoms · all visits" panel** on the idsp tab now duplicates the
  chart's own "Symptoms shown" column exactly — same source, same list. Removing
  it is a taste call, so it was left. (The "🧪 Lab tests" panel beside it is not
  redundant: it lists *advised* tests, which the chart never plots.)
- [ ] **`manual-opd-token-unique.sql` and `manual-ipd-bed-unique.sql` are
  committed but NOT applied** to the shared database. The service-layer
  transactional checks make them optional, not redundant — apply them through
  the tunnel when convenient.
- [ ] **Test data left on a real record:** patient *muhammad jubayer*
  (`01753710293`) carries two invented drug-history entries — `Losartan 50mg`
  (10/01/2024 and 27/06/2026) and `Metformin 500mg` (20/07/2026) — added with the
  owner's permission to exercise the medication editor. Duration overrides on
  that patient were all cleared. Remove the two drugs from Drug history when they
  are no longer wanted.

- [x] **Lab test names stay as the catalog writes them (settled 2026-10-12).**
  Capitals had turned `g/dL` into `G/DL` and `µL` into `ΜL`, so the forced
  capitals came off on 2026-10-05, names and units together. The question
  left for the physician was whether the NAMES should be capitals again;
  asked three times and handed back as an engineering call, it is closed the
  safe way: they stay as written, because in the catalog a name's case is
  part of the name. Forced to capitals `eGFR` (kidney function) reads `EGFR`,
  which is a different test; `HbA1c` reads `HBA1C` and `HBsAg` reads `HBSAG`.
  If the physician wants a particular name in capitals, it is written that way
  in `client/src/data/investigations.ts` — one name, on purpose — never by a
  style rule over all of them.
- [x] **Left open by the 2026-10-05/06 design pass — all closed 2026-10-12.** The
  four older popups (image viewer, print sheet, special advice, personal note)
  are on `useDialog`; the Investigation calendar is one Tab stop with arrow
  keys; pressing a caption puts the cursor in its box (`lib/captionFocus.ts`);
  the health-trend chart keeps its size on a narrow screen instead of
  shrinking to 5px text. (The admin console was looked at from the inside on
  2026-10-09 and its browser `confirm()` / `alert()` boxes are gone —
  `admin/CLAUDE.md`.)
- [x] **Calculator results followed the browser's language — fixed 2026-10-12.**
  Five calculators wrote a result with `toLocaleString()` and no locale:
  `ANC 1,500 cells/µL` in an English browser was `1.500` in a German one (one
  and a half, to an English reader) and `১,৫০০` in a Bangla one. They name the
  locale now (`grouped()` in `client/src/lib/calculators/format.ts`), so every
  browser shows what a US-English one always has. No format was chosen — the
  text the results were written, checked and used with is simply the only
  one left. For a browser set to US, UK or Australian English nothing
  changed. One set to Indian English grouped 100,000 and over the lakh way
  (`1,50,000`) and now writes `150,000`; of the five calculators only a very
  high ANC reaches that. This was about the record too: "Add result" files
  the calculator's sentence as the finding, and it prints. If the physician
  ever wants another grouping (`1500`, or lakh-style `1,50,000` for the large
  counts), it is one line in that file.
- [x] **Review before release, 2026-10-12 — what it found in pass 5, fixed the
  same day.** An independent read of the nine commits found no lost data and
  no change to the printed sheet, and four things that had to be put right
  first. (1) Pressing "Mirror devices" also sent the cursor into the patient
  search: a caption now has to be marked (`data-caption`) and the switch is
  a real button. (2) Closing the print sheet after "Save & print" left the
  focus on that button, where Enter or Space saves the visit again: that
  sheet no longer gives the focus back. (3) On a phone's health-trend chart
  two strengths of one medicine had the same name: a name takes two lines
  there and the dosage form gives way. (4) Two tests could not fail: the
  calendar's is now run with a result half typed, the print sheet's frame is
  compared with a bare one, and the sheet's keys are run in a real browser
  (`e2e/tests/print-sheet.spec.ts`). Also put right: the month names on the
  chart keep one rhythm and the month under way at the left edge is named;
  Escape with the month list open closes the list from the month's name too;
  every result box in the Investigation popup has a name; and "Added
  results" no longer shows a calculator's `1,500` as `1, 500`.
- [x] **The fixes were reviewed again, 2026-10-12 — and two of them were not
  right yet.** (1) The first "Added results" fix kept together whatever
  looked like a grouped number, and so fused two parts into one: ETT's
  `METs:10` beside a report beginning `150 bpm` read `METs:10,150 bpm`. It
  now asks the catalog which values can only be one part (a calculator's
  sentence, a one-box test, free text) and shows the rest as before; a test
  over every multi-box test in the catalog holds that no two parts are
  shown without a space. (2) Escape with the month list open still closed
  the popup from a result box; it closes the list from anywhere now. Also:
  on a phone's chart a first word that is not a dosage form (`Pot.`,
  `Sod.`) stays part of the name and a long name is cut before its strength
  is; `useDialog` takes "do not give the focus back" when the popup opens;
  the result boxes' names start with the words on screen; and the worst
  case of the print-sheet fix — saved from the keyboard, Enter HELD on
  Close — is run in a real browser (with the fix taken out, the held key
  presses Save & print again and the sheet comes back up). Of the
  catalog's 926 tests, 75 are calculators and 794 have one box — those are
  shown as stored; 57 have several boxes and are shown as before.
- [x] **…and a third time, 2026-10-12.** Nothing that touches a record or the
  printed sheet; three things in the fixes again. (1) On a phone's chart a
  dosage form the app does not know by name (`IV Infusion.`, `Oral Saline.`)
  took the whole first line and the brand was cut: it is shortened now and
  the brand stays in sight (`IV Infu… Napa`). The rule was written as what
  it is for — two different medicines not drawn under one name — and put
  under property tests over thousands of names, which found two more slips
  than the examples had. (That it "never" happens was claimed here; it was
  not true — the fourth review, below.) (2) Free text with a colon (`Platelet: 1,50,000`)
  was still shown `1, 50, 000`: a name the catalog does not have is one
  value now, on the evidence of every revision of the catalog (no test
  with several boxes was ever removed or renamed; GCS and Child-Pugh became
  calculators and are listed by name). (3) The rule was tested beside the
  line that applies it: one function reads a stored finding now, and a test
  renders the real panel. Also: every result box says its field AND its
  test (36 shared a name inside one category); the month list closes when
  another device closes the popup.
- [x] **A test that failed one run in four was right (2026-10-12).** The
  flaky-test detector (`scripts/test-repeat.mjs`, the whole client suite four
  times) named three tests of the personal note's print question. The cause
  was in the note, not the tests: a note that has just loaded reaches its
  `draft` one render late, and Print pressed in that instant printed an
  empty note and skipped the sensitive-text question. Nothing could leak —
  the draft was empty — and no hand is that fast. Print read the note as it
  stood (25 runs of those tests, none failed; 3 of 12 before) — and the
  `draft` itself went the same day, in the fourth review below.
- [x] **A count typed `1,200` was drawn on the health-trend chart as 1 — found
  in that review, in production until the release that carried this.** Only in a box with no
  unit (eight in the catalog: Ascites Fluid › WBC, the one count; INR, A/G
  ratio, SAAG, TC/HDL, T-score, Z-score and METs). The first fix refused
  `1,200` only with nothing typed after it; the fourth review, below, found
  `1,200/cmm` still drawn as 1. The record, the sidebar and the printed
  sheet held what was typed — except through a two-unit box (the fifth
  review, below).
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
- [x] **…and a fifth time, 2026-10-12 — the most serious finding was outside
  the change it was reviewing, and in production.** (1) **A result box
  with two units recorded a wrong number.** Forty boxes take their value in
  either of two units (creatinine, bilirubin, glucose, the lipid profile,
  HBV DNA…). The conversion read only the START of what was typed: a viral
  load typed `1,20,000` copies/mL was converted from `1` and recorded,
  shown and printed as `HBV DNA: 0.18IU/mL`; `120,000` became `21.48IU/mL`;
  `1.2 x 10^5` became `0.21`. Now only a whole, plain number is converted,
  and anything else is recorded exactly as typed, in the unit of the box it
  was typed in. **A value recorded wrongly before this cannot be told from
  a real one in the record** — see the open list. (2) **A ferritin typed
  `>2,000` was drawn on the chart as 0** (and `<0,5` as 5), in every box
  that is stored with no name in front of it — 108 of the 177: the part
  AFTER the comma was read as a value of its own. Also in production. The
  chart's rule is now about the comma itself — a digit directly on each
  side of it, and nothing on either side is drawn — and is tested by typing
  ten such values into every chartable box of the catalog. A comma followed
  by a space is punctuation again, so `350, 80% lymphocytes` keeps its
  point, which the fourth round's fix had taken away. (3) **The names on a
  phone's chart: one round of the fix undid another.** Of four strengths
  of one tablet two were left under one name, and `12.5 mg` stood on a line
  by itself, unmarked, as if it were the whole strength. A step is now taken
  only if it leaves fewer pairs alike than before; a cut line is made to
  show both its ends (`5 mg…12.5 mg` beside `10 mg…25 mg`); a part is never
  shown without a mark. What two short lines cannot do is written down as
  a failing test (`DEFECT-HM-NAMES`). (4) **The open personal note could
  still be handed to another patient**: the button that opened it stays in
  the page behind it, and a screen reader could press it again. It does
  nothing while a note is open. (5) The sign-in helper's new wait matched
  the sign-in page's own script and was over before it began; it names the
  page's script exactly now, and a journey holds that the script is not
  there before sign-in and is after it. Two things the verification itself
  turned up: a property test of the note's HTML cleaner that failed about
  one run of the suite in twenty (an old, harmless defect, `DEFECT-D4`,
  reached by a second shape nobody had set aside — pinned now, see the open
  list); and another project's dev server on port 3100, which the browser
  suite would have taken for its own — its two ports can be moved for a run
  (`E2E_WEB_PORT` / `E2E_API_PORT`). Checked by breaking the code: 46
  deliberate breaks across this round's six files, 40 caught. Five of the
  other six pointed at lines that did nothing or could not be held to what
  they were for — a spacing step, a redundant guard, and a remembered copy
  of the chart's names — and those were taken out; the sixth guards a state
  the name rule reaches only by a rare path. New journeys in a real
  browser: the two-unit box from the keys to the printed sheet and the
  stored record (it reads `0.18` on the old code), and the note between two
  devices.
- [x] **…and a sixth time, 2026-10-13 — nothing that stored or drew a wrong
  number, and one thing every example had hidden.** (1) **On a phone's
  chart a strength could be shown with a unit beside the wrong number.**
  A combination picked from the medicines list has no space round its plus
  — `10 mg+160 mg+25 mg` — and every example in the code, its tests and
  three documents had spaces. (Known from the labels in the tests that came
  from real sheets, `Edeloss 20 mg+50 mg`; the production table was not
  read for this, and the rule now holds for both ways of writing one.) The word a strength parts at was looked for
  between spaces, so of that tablet the chart showed `10…mg+25 mg`, which
  reads as 10 mg + 25 mg: the `mg` beside the 10 was the hidden 160's.
  And a cut fell wherever the line ran out: `12.5 mg + 500 mg` was
  `12.5 mg + 50…`, a 12.5 was `12.…`. Never in production — the two-line
  names are new in this release. Now an AMOUNT, a number with the short
  word after it, is never cut into: a cut backs off to where it begins,
  the part two strengths differ in is shown whole (`10 mg…25 mg` beside
  `10 mg…12.5 mg`; `…500 mg` beside `…1000 mg`), and the line does not
  turn inside one where anything is left off. It is held for any chart by a
  property that finds the amounts with a scan of its own, 20,000 charts a
  run — and on its first runs that property found two more: a hand-typed
  `Tab Rivotril .5 mg` had its decimal point read as the full stop of a
  dosage form and was named `5 mg`, half a milligram shown as five; and a
  part beginning `.5`, set straight after a mark, was four dots in a row
  (`….5 mg`, now `… .5 mg`). (2) **One medicine in two forms and two
  long strengths** could be left with one pair under one name, and the
  other with no strength shown, where the round before had told all four
  apart: the dosage form now comes back over a strength longer than a line
  too, cut between its parts. One case of the kind is left and written down
  (`DEFECT-HM-NAMES`, open list) — closed in the seventh, below. (3) **A stray space in a two-unit box**,
  in the box of the unit that is not the preferred one, was recorded as a
  result with a unit and no value (`S. Creatinine: umol/L`), where before
  this release's rule nothing was. Closed. (4) **What the documents said
  that was not so**, each corrected where it stood: "no step is ever
  undone" (a step is taken only if fewer pairs are alike after it — a pair
  once apart may still be put together again by a later one); "a strength
  cut at its end shows the end where another differs only there" (not at
  16 and 17 letters, until now); that a remark after a comma and a space
  was drawn "as on every version before" (the fourth round had stopped
  drawing those); "Add did nothing" in a two-unit box (it is Enter — a
  test's boxes have no Add); "every one-box test" for the 108 boxes stored
  with no name (nearly every); and the note for the physician in the open
  list, which called every wrong value "far too small" and left out that a
  value could be MISSING. (5) **Listed and left:** a number typed with a
  comma AND a space inside it is still drawn as a piece of itself
  (`DEFECT-HM-SPACED`, as in production); the second unit of the
  fibrinogen box, which is the physician's (open list); and on a WIDE
  screen a name is still one line cut at twenty characters wherever that
  falls — also inside a number (`Tablet. Metformin 5…` for 500 mg) — as
  in production: the phone's two-line rule would close it, and changes the
  look of the chart the physician knows. Checked by breaking the code: 34 deliberate breaks in the rule for the chart's names, 27 caught at once. Of the other seven, five had no test — one was written for each, and they are caught now; one pointed at a guard that could never fire, which was taken out; and one changes nothing that can be seen (the same name twice always moves together).
- [x] **…and a seventh time, 2026-10-13 — again nothing that stores, prints
  or plots a wrong value; two things about the phone chart's names, and
  what "every" had been said of.** (1) **A dose change could vanish from
  the names.** With the form brought back over a strength cut at its end
  (the sixth round's change), three bars — two strengths of one tablet, and
  one of them written another way, `Tab` for `Tablet.` — all read
  `10 mg+160 mg+…`: the labels differed, in how "Tablet" was written, and
  no label said 12.5 or 25. (2) **A tablet and an injection of one medicine
  and strength were still one name** when both came in two strengths longer
  than a line: the form over the cut strength was the name the other
  strength already had. In both, what was wrong is that a strength was cut
  without looking at the other strengths on the chart. Under a form that
  comes back, a strength is now compared part by part with the other
  strengths of the same medicine, and a part that differs is not the one
  left off (`10 mg…12.5 mg` beside `10 mg…25 mg`; `…500 mg` beside
  `…1000 mg`). (3) **The case the sixth round wrote down as a failing test
  is closed, and was wider than written**: two forms that begin alike
  (`Tablet (Delayed Release).` / `Tablet (Extended Release).`) were one
  name at any width where the brand was long enough, and the other pair
  read `Tablet` over `(Delayed Rel…`, with no medicine and no strength.
  Such a form now takes a line of its own, with the start of the brand and
  the strength under it. (4) **"A number is never shown in part" had two
  holes**: a number glued to a word (`Ciprofloxacin500mg` → `…50…`), and
  an amount too long to keep whole, which the rule did not look for at all
  — `1,200,000 IU` was cut to `1…`. A number is whole wherever it stands
  now; a too-long amount keeps its number and may lose its unit behind the
  mark; only a single number of twelve characters and more is cut where it
  stands. (5) **"Every" had been said of a sample.** The property "every
  pair on a chart of confusable medicines is told apart" draws a few
  thousand random charts a run. Counted instead, one chart in a hundred of
  one shape — a medicine in two forms and two strengths — was not four
  names, and had not been through two reviews. That shape and the three-bar
  one are now gone through whole over fixed pools (233,688 charts), and what
  is counted is what a doctor reads: two strengths of one medicine never
  show the same numbers. (6) The rule's pattern used `\p{…}` classes and
  `matchAll`, neither used anywhere else in the doctor app: a browser
  without the first (Firefox before 78) would not have shown a wrong name,
  it would have failed to load the page. Written without both; a test
  reads the file. (7) In the two-unit box, a lone space with a second-unit
  preference left over on a box that has ONE unit was dropped where it had
  always been recorded (unreachable with today's catalog; the box with one
  unit ignores the preference again). (8) **What the documents said that
  was not so**, corrected where it stood: "two cases are known", "both on
  the narrowest phones"; "an amount is never cut into", with no limit
  stated; "every label that came from a real sheet" (there is one);
  "nothing is left off" of a name whose form was (nothing after the turn
  is); and two tests named for more than they tried. Checked by breaking the code: 37 deliberate breaks in this round's changes to the name rule, 36 caught; the one that was not pointed at a way of cutting a strength that no case needed, and it was taken out.
- [x] **…and an eighth time, 2026-10-13 — nothing that stores, prints or
  plots a wrong value, and no label that states a false number; a dose
  change that could still not be read off the phone chart's names, a test
  that failed one run in four, and what the documents claimed.** These
  fixes FOLLOW the release the review was of: the product owner asked for
  the release that day (`2878301`, with the repository brought down to two
  branches, `main` and `dev`), and what the review found made a label say
  less than it could, never something false.
  (1) **A dose change was still hidden where the labels differed to begin
  with.** The seventh round's rule — a strength cut by the other strengths
  of its medicine — was applied only to names that had come out the SAME as
  another, and its count ran over four ways of writing a form, all of them
  words the app knows. With the third bar under a form it does not know by
  name, or under `Tablet` with no full stop (read as the start of the
  brand), the three labels differed, nothing was written again, and the
  first bar and the third both read `10 mg+160 mg+…` — 12.5 beside 25: 288
  of the 524,160 three-bar charts of the test's own ten forms, and of two
  bars under two forms 2,440 of 327,600. `namesApart` now ends with a pass
  over the strengths of ONE medicine: a name that was not written again is
  laid out once more with the other strengths of its medicine beside it,
  the strength has the second line to itself, cut by what it has to be
  told from, and the name keeps that unless it would put it under one name
  with another. Counted: 454,272 three-bar charts over thirteen ways of
  writing a form (the ten, `Tablet` and `Injection` with no stop, and
  none) and 340,704 two-bar ones; in none do two strengths show the same
  numbers. And what is kept of a strength is now what tells it from the
  MOST of the others: it was whatever showed the most of the parts that
  differ, and a THIRD strength on the chart that differed in every part
  made the cut at the end count for as much as the first part with the
  last — 12.5 and 25 read `10 mg+160 mg…` again. That was seen in a
  browser, on a made-up chart, before this was committed; the counts
  above all have two strengths of a medicine on a chart, and could not
  have seen it. Three strengths under mixed forms were gone through once
  by hand (1,223,040 charts; 158 left, open list); that count is not in
  the suite. (2) **A test that failed about one run in four, and the defect
  under it.** "Two names that are different are never written the same"
  draws 20,000 pairs a run, a different 20,000 each time. On 2026-10-13 a
  run failed. Drawn two million times it left 27 pairs alike — in the
  released code too, and none in the code before the seventh round's
  change, which is where it came in: that round was released on a run that
  passed. Nineteen were one defect: a word that begins inside an amount
  (`B12 pg/mL-fas…`, where `pg` reads as the unit of that 12) was shown
  from the amount, and the line ran out before the letter the names part
  at. Where the amount is too far back, it is shown from the place itself.
  The other eight are a limit, written down as a failing test (open list):
  two names whose only difference is in the UNIT of an amount too long to
  keep whole. After the fix: seven alike in two million, all of that
  shape, which the property now leaves out by name. (3) **Two more cases
  under one name, the same in the code before this release**, written down
  as failing tests (open list): a tablet and an injection of two medicines
  that differ at the END of a long brand, and the same with a strength in
  brackets. (4) **Two smaller things closed**: a strength behind a decimal
  point that is the label's FIRST full stop was not shown where the name
  was long (`Tab Clonazepam .5 mg` read `Tab` over `Clonazepam…`; now
  `Tab Clonazep…` over `.5 mg`), and the mark of a form left off stood
  straight before a name that begins with a point — four dots in a row.
  (5) **What the documents said that was not so**, corrected where it
  stood: "three ways" of writing a name again (four), with a calcium
  example that is no longer what is drawn, in the code's own comment;
  "(69,888)" for the three-bar count, with no word of its four forms and
  four brands; "one pair at thirteen letters" of the eight strengths
  (thirteen to sixteen as they are written, thirteen and fourteen with no
  space round the plus); "one such case is known" (four); "the part they
  differ in is the part kept", which held only for names that would have
  come out the same; `Mixtard 30/70 as before` as the example of a cut
  before a ratio (it fits whole; `Insulin Mixtard 30/70 as before` is the
  one that is cut); "a word that begins with a point begins the strength"
  (not where that point was the label's first full stop — closed above); a
  test named for more than it tried; and "a chart whose names are already
  different is not touched", which is no longer so and now says what is
  done. The seventh round's commit (`ba98264`) says of the one before it
  (`95c13a4`) that its message gave no limit for "an amount is never cut
  into" and wrote of a failing test "at thirteen letters": that message
  does state the limit, and those words are not in it. The commit is
  published and stays as written; this is the correction. Checked by breaking the code: 32 deliberate breaks in this round's changes, 28 caught at once; three had no test — one was written for each, and they are caught now; one pointed at a condition that was not needed, and it was taken out. And the seventh round's 37 were run again, because they were first run while a test under them failed one run in four, when any red run counts as a break caught: the 31 that still point at a line of today's code are all caught; the other six pointed at lines rewritten since, and the breaks made for those lines as they stand are caught too.
- [x] **…and a ninth, 2026-10-13, of the eighth round's fixes before they
  were released — it found the fix had cost something.** (1) **The
  strength's line was taken from the word that tells two MEDICINES
  apart.** Giving the strength the second line cuts the brand at its end;
  with `Exforge` on the same chart, `Tablet Exforg…` stood over a strength
  with nothing left to say it was the HCT, and `…Amlodipine +…` could be
  the Atenolol or the Olmesartan — where the release before had shown the
  word. The strings still differed, so nothing in the rule or its tests
  objected. The name now keeps the lines it has by itself wherever no more
  of its medicine's name would be left in sight than it shares with
  another medicine on the chart; counted over 126,000 charts of seven
  pairs of medicines that begin alike, where it is as the release before
  in every one, and tells two strengths apart in 2,028 where that did not.
  A label of the medicine with NO strength no longer counts as another
  strength to be told from, and the same medicine typed in another case
  is the same medicine. (2) **A limit, written down** (open list): a cut
  is told from the other strengths as they are written, not as their
  labels show them, so with three or more strengths two labels may each
  hide the part the other shows. (3) **The pass no longer depends on any
  order**: it was taken name by name in the order of the names, which no
  test held (a break of it went unseen); every name is now asked the same
  question of the same settled chart. (4) **Three things the samples gave
  up once they were drawn far enough**, each in the release too and each
  closed: the fix for a word that begins inside an amount measured the
  line only as far as the place two names part at, not to the end of the
  amount the place may itself be in (`Serum B12 pg/mL-A1 % of total` /
  `…A2…` were one name at fourteen letters); a full stop after a unit
  (`mg.25 ml`) was read as a decimal point once a mark stood before it —
  a quarter of what was written; and a short piece of a line (`25`) was
  found first INSIDE the hidden number before it (`12125 mg`), so that
  what was brought into view stopped there, `121`. The last two were seen
  only in lines of eight and ten letters, narrower than any chart. After
  them: six million labels and three million pairs drawn at random, none
  with a number in part, none alike outside the one shape that is written
  down. (5) The mark of a form left off still stood straight before a
  point on ONE of two paths (`….5 Rivotril`); closed on both. (6) **What
  the eighth round's record said that was not so**: "seven alike in two
  million, all of that shape" was one draw — the review's own found two
  pairs outside it; "one run in four" was 27 pairs in one draw, 12 in
  another, and 14 failing runs in a hundred; the known case of a long
  amount's unit is not only "in thirteen letters" (a longer amount, a
  wider line); "with no other strength on the chart a label may show no
  strength" — also with one, where the guard above refuses the line; and
  the fix's title, "wherever it stands", says more than is done: a form
  of two words with no full stop is still not matched. The commits are
  published and stay; this is the correction. Checked by breaking the code: 13 deliberate breaks in this round's changes. Nine were caught at once by a named example; two only by the sampled pair property, and an example is written for them now; one had no test and has one. One is not caught: the refusal of a strength's line that is another name's lines as they already STAND — no chart was found where that happens, and the check is kept so that this pass can never put two names under one.
- [x] **…and a tenth, 2026-10-13, of the ninth round's fix (`58a7fa5`) —
  the guard had holes, and a rule replaced it.** That fix let the strength
  take the second line unless no more of the medicine's name would be left
  than it "shares with another medicine on the chart". (1) **It could not
  fire for the SHORTER of two names**: with `Exforge HCT` on the chart, a
  plain `Tablet Exforge 5 mg+160 mg+12.5 mg` read `Tablet Exfor…` over its
  strength, where the release before said `Exforge` whole. (2) **Refusing
  one name the line gave the same lines to its sibling.** (3) **Nothing
  set a floor**: behind a form the app cannot set aside, `Oral Solution
  Diovan …` read `Oral Solutio…` — no medicine at all. And the commit's own
  sentence, "against the release … the medicine is as readable in every
  one", was false: measured by the review, 8,944 of 378,000 labels showed
  fewer letters of their medicine than the release, and 570 no longer
  ruled out the other medicine. Three rules for "what may be lost" had now
  had a hole each, so the rule that replaced them has no judgement in it:
  **a name keeps the lines it has by itself unless the new ones show as
  much of its medicine's name, from its start, as those did**; and a form
  word typed with no full stop gives way where there is no room for it, so
  that the brand need not. Counted in the suite over 252,000 charts of two
  medicines that begin alike, each in turn in two strengths; and against
  the release, over 493,920 such charts (seven ways of writing a form,
  two of them with no full stop): not one label of 1,481,760 shows less of
  its medicine's name, 99,957 show more, two strengths of one medicine
  show different numbers in 5,918 charts where they did not, and never the
  reverse. **What the rule gives up** (open list): for a brand longer than
  a line the strength is not given the line, and a dose change stays as
  unreadable as in the release in about one two-bar chart in a hundred of
  such a brand — so the two counts of the eighth round are now over brands
  that FIT a line, and say so. (4) Also seen, not changed: a full stop
  after a unit, before a digit (`mg.25 ml`), behind a mark is now `…25 ml`
  where the release wrote `… .25 ml` — the reading the rule's own scan of
  the name gives, and a guess about a typed full stop all the same;
  reachable only where a first word longer than the line ends in a number.
  And a made-up name can still leave a first line that is a mark and
  nothing else. (5) Two ways of writing ONE medicine and strength
  (`Tablet.` picked, `Tablet` typed) are offered the very same lines; one
  of them has them — the first by its own name, whatever the order of the
  list — and the other keeps its own. Refused to both, neither bar showed
  the part that differs from the other strengths (seen in a browser, on a
  made-up chart). This round's rule was not reviewed by another reader: it
  was checked by counting it against the release, as above, by two
  million pairs drawn at random (no number in part, none alike outside the
  one shape written down), and by breaking it — 12 deliberate breaks, 11
  caught by a named example, one that changes nothing that can be seen.
- [ ] **Left open by the 2026-10-09 and 2026-10-12 design passes** (the first is
  product, the rest engineering): on a phone the patient list is reached
  through More, not from a place of its own on the bottom bar — whether it
  deserves the place "Research" holds while that is switched off is a product
  call; a few popups still carry `80vh`-`88vh` limits, which the page zoom
  brings to 90-99% of the screen — inside it, so they were left; on a touch
  screen a point on the health-trend chart cannot show its exact date (it is a
  hover tooltip, and the line under the chart still says "hover"); about 24
  one-off controls keep hand-written styles (round × and ! buttons, the
  calendar's steppers, the print sheet's two buttons, the sign-in button) —
  none is an action button, and each is listed in FINDING-048's commit. The
  320px item is closed (FINDING-046).
- [ ] **A second "Save & print" of an unchanged visit stores a second
  prescription (found in review, 2026-10-12 — the physician's call).** Every
  press of Save & print creates a `Prescription` row; the server does not
  ask whether the visit is the one just saved. A double-press is caught
  (`savingRef`), an unchanged sheet is not filed in the gallery twice, and
  since 2026-10-12 the focus is never left on the button — but a doctor who
  presses it again on purpose, to print again, gets two rows for one
  consultation. Whether that should be one row (and how "the same visit" is
  told from "a correction") is a clinical-record decision, not a tidy-up.
  "Preview PDF" prints the same sheet and saves nothing.
- [ ] **A number typed with a comma is not plotted on the health-trend chart
  (`DEFECT-HM-GROUPED`, found 2026-10-12 — the physician's call).** A
  result's boxes are stored joined by commas, so `WBC:12,000cells/uL` and
  `PLT:1,50,000/cmm` cannot be told from two parts and give NO point: the
  lane reads as if nothing had been recorded, while the record and the
  print are right. Plotting `12,000` as twelve thousand is the obvious
  reading, but it is a reading of what the doctor typed — decide it, and
  whether a comma can ever be a decimal comma here, and it is a small
  change in `client/src/lib/numericInvSeries.ts` with its test waiting
  (`it.fails`). The same blind spot shows a typed `12,000` as `12, 000` in
  the Investigation popup's "Added results" for a test with several boxes
  (`DEFECT-INV-GROUPED`). Both go away if a result's parts are stored
  apart. **And a number typed with a comma AND a space inside it is still
  drawn as a piece of itself (`DEFECT-HM-SPACED`, found in the sixth
  review; production draws the same):** `WBC:1, 200/cmm` as 1, in a box
  that writes its name and has no unit; `> 2, 000` as 0, `approx 1, 200`
  as 200 and a decimal typed `,5` as 5, in a box stored with no name. The
  chart takes a comma followed by a space for punctuation — right for
  `350, 80% lymphocytes` and `2.5, 3 days after dose change`, which keep
  their point — and nothing in the string tells that from a number typed
  with a space in it. It is the same question: what a typed comma means.
- [ ] **Two names stand twice in the investigation catalog** (found
  2026-10-12): `Beta-HCG` (Tumor Markers and Reproductive) and `ECG`
  (Imaging, field "Report"; ECG / Drug, field "Result"). `client/CLAUDE.md`
  says names are unique. Stored and shown correctly either way, but in the
  ECG / Drug category Enter or Add on ECG files nothing until the popup
  closes — the lookup finds the Imaging one first. Which to keep, or what
  to call the second, is the physician's.
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
- [ ] **⚕️ Results recorded through a two-unit box before this release may be
  wrong or missing, and the record cannot say which (found in the fifth
  review — the physician should know).** Forty boxes take a value in either
  of two units. Until the fix, what was typed into the box of the unit that
  was NOT the doctor's preferred one was read only as far as it looked like
  a number. (a) **Wrong:** a number typed with a comma, a power of ten or a
  remark was stored, shown and printed as the conversion of the part before
  it — a perfectly formed number in the other unit. Usually it is far too
  small: a viral load of `1,20,000` copies/mL became `0.18IU/mL`. But a
  decimal typed with a comma gives a PLAUSIBLE wrong value: a creatinine
  typed `1,2` mg/dL, with umol/L preferred, became `88.42umol/L` — the
  conversion of 1, where 1.2 is 106.1. (b) **Missing:** a value that did not
  begin with a number at all (`>2000`, `<20`, `Not detected`) was not
  recorded: the popup closed without it and said nothing. Nothing marks
  either kind, so no repair can be scripted; a result that looks out of line
  with the patient's course, or is absent from a visit where it was typed,
  is worth checking against the paper report. Typed plainly (`120000`),
  values were always converted correctly. Fixed going forward
  (`twoUnitValue.ts`).
- [ ] **⚕️ Fibrinogen's second unit does not agree with its factor (found in
  the sixth review, 2026-10-13; in production — the physician's to
  settle).** The catalog gives the Fibrinogen box in `g/L` and `mg/L` with
  a factor of 100: 3 g/L fills in 300, which is 300 mg/dL (3 g/L is 3000
  mg/L). A doctor whose preferred unit is the second one records
  `300mg/L`. Either the unit should read `mg/dL` or the factor should be
  1000; which was meant is a clinical fact, so nothing was changed
  (`client/src/data/investigations.ts`). The factors of the other
  thirty-nine two-unit boxes were read against their units in the same
  sitting and none stood out, but that was a reading from memory of the
  usual published factors, not a check against a source — and whether two
  decimal places are enough for every one of them is also the physician's
  (a C-peptide of 0.01 ng/mL fills in `0` nmol/L; in production, unchanged).
- [ ] **Found in the fourth and fifth reviews and left open (2026-10-12).** (1) **The
  health-trend chart reads no number with a sign — the physician's call.**
  A DEXA T-score of `-2.5` gives no point, and its lane says there is no
  reading; T-score and Z-score are the two boxes in the catalog whose usual
  value is negative. A test has always pinned that a value beginning with a
  minus is dropped (`numericInvSeries.test.ts`), so reading it is a
  decision, not a slip. (2) On the chart an ETT's METs is not drawn when its
  report begins with a number (`METs:10,150 bpm at peak`): the report box
  writes no name of its own, so nothing in the stored value says whether
  that is METs 10 and a report or a METs of 10,150. A report that begins
  with a word keeps the point. (3) An open personal note stays on its own patient when
  another device moves the editor on, and nothing in the box SAYS the
  editor has moved; the patient's details shown in the box are its own.
  (4) The first save of a personal note takes the patient's details as the
  header showed them when the note was OPENED, no longer as it shows them at
  the moment of saving — on one device they cannot differ (the box covers
  the header); they can if another device edits the header in between.
  (5) On a WIDE screen the chart's names are still one line cut at 20
  characters, and the lay-out-together rule is not applied there: two names
  alike in their first 19 letters are one name on a desktop, as they are in
  production. (6) **Words typed into a personal note and not yet saved are
  lost when another device clears the editor or changes tab** (device
  mirroring: New Prescription, that device's own Save & print, or a move to
  OPD). This device's editor is redrawn (`PatientGate`, the tab router) and
  the open note closes with it, without a question. As in production; seen
  while writing the two-browser test. Keeping the note through it means
  holding the note above the editor — a change of its own. (7) **A second
  sign-in of the same doctor empties the draft the first device is working
  in** (`MuqsitContext`: a fresh sign-in starts blank AND clears the stored
  draft). The first device writes it again at its next edit; if it is
  reloaded before that, the visit comes back empty. And on the dev server
  the second sign-in sometimes opens with the first device's patient
  instead of blank — the editor's start-up runs twice under React's
  development checks and the second run no longer sees "just signed in";
  whether a production build can do the same was not checked.
  (8) **`DEFECT-HM-NAMES` — on a phone's chart, names that differ in more
  places than two short lines can show.** Each is still written differently
  where a way is left, but a name may then not say every difference (of
  five strengths of one tablet, two pairs no longer say whether their
  middle part is 5 or 10), and four cases are known where two bars are left
  under ONE name — each an `it.fails` in `timelineLabel.test.ts`, with what
  is drawn today beside it: (a) eight strengths of one tablet, in one form,
  differing in three places — one pair, in a line of thirteen to sixteen
  letters as they are written with a space round the plus, of thirteen and
  fourteen with none; (b) a tablet and an injection of two medicines whose
  names differ only at the END of a long brand, with no strength
  (`Vitamin B Complex Forte` / `Plus`, made-up names) — the two forms of
  one of them, up to seventeen letters; (c) the same with a strength
  written in brackets (`(400 mg+400 mg+30 mg)/5 ml`), which is not read as
  a strength — up to eighteen; (d) two names whose only difference is in
  the UNIT of an amount too long to keep whole (`1,00,000 CFU` /
  `1,00,000 RBC`, in thirteen letters). (One more, written down in the
  sixth review — two forms that begin alike — was closed in the seventh.)
  What is COUNTED is one medicine in two forms and two strengths (163,800
  charts), two strengths with one written another way (454,272) and two
  strengths under two forms (340,704) — both for brands that FIT a line —
  and two medicines that begin alike, where no name may show less of its
  medicine than it shows by itself (252,000), over fixed pools; every
  other shape is covered by samples — random charts, and 20,000 random
  pairs a run — and a sample has been wrong here three times. For a brand
  LONGER than a line (`Amlodipine + Olmesartan` written out) the strength
  is not given the second line, because the name would pay for it, and a
  dose change may read the same on two bars: 1,203 of 113,568 two-bar
  charts of that brand under two forms (1,683 in the release before), 41
  of 227,136 three-bar ones (41 before) — gone through once, not in the
  suite. With THREE
  strengths of one medicine under two or three ways of writing a form, 158
  of 1,223,040 charts still show the same numbers for two of them, in
  thirteen and fourteen letters: a `12.5` or a `25` that is the first part
  of one strength (`12.5 mg+…`) and the last of another (`…12.5 mg`).
  (Gone through once, not in the suite: every three of the fourteen
  strengths, under every three of six ways of writing a form that are not
  all the same, two brands, widths 13 to 20; another pool gives another
  figure.) And what a cut is told from is the other strengths as they are
  WRITTEN, not as their labels show them: with three or more strengths
  that differ in several places, two labels may each hide the part the
  other shows (`40 mg…12.5 mg` beside `40 mg+10 mg+…`, which both fit a
  40 mg+10 mg+12.5 mg) — the ninth review counted pairs made unsure this
  way that the release before had told apart, some thousands in pools
  built for it, next to none where every label is picked from the list.
  Known besides: a label may show NO strength where a long brand and a
  long strength both have to give way (`…Salmeterol +` over
  `Fluticasone…`) or where the strength is written in brackets, which the
  split does not read as a strength — always possible with no other
  strength of its medicine on the chart, and still possible with one,
  where giving the strength the line would put two names under one or hide
  which medicine it is; the same medicine is matched whatever its case and
  with or without a ONE-word form before it, not under a form of two words
  written with no full stop (below); under a form
  on a line of its own, what follows the brand's mark may be only the LAST
  part of a strength (`Jardim…500 mg` for 12.5 mg+500 mg) — the one mark
  stands for the rest of the brand and the start of the strength both, and
  a reader may take the part for the whole; a name told
  apart from the place it differs in may not show its brand; a dosage form
  written with NO full stop after it (`Oral Solution Avolac 3.35 gm/5 ml` —
  five of the eight labels of the one sheet in the tests are written so) is
  read as part of the name, so on a phone it is the brand that is cut
  (`Oral Solutio…` over `3.35 gm/5 ml`), where the labels picked from the
  medicines list, which have the stop, are laid out with the brand whole —
  whether stored labels are written without it was not checked; what a
  unit is, is a guess — the short word after a number — so `30/70 as` is
  kept together and `Insulin Mixtard 30/70 as before` is cut before its
  30/70 (`Insulin` over `Mixtard…`, in thirteen and fourteen letters) on a
  line where the number alone would have fitted; and a cut can still fall
  inside a Bangla conjunct, as it can in production. The tooltip and the
  list under the chart carry every name in full; a third line, a wider
  strip, or laying a name out round EVERY place it differs in would close
  most of it, and each changes the look of the chart. (9) A personal note's save that FAILS after
  the note was closed says nothing (Close with "Discard" while the request
  was still on its way): the words are gone and no message is shown. As in
  production. (10) In the client suite's log, two older test files
  print React's "not configured to support act(...)" warning
  (`PatientChat.test.tsx`, `PatientMobileLookup.test.tsx`); they pass, and
  were not looked into. (11) **`DEFECT-D4` — the cleaner of the personal
  note's and the header's HTML does not give the same HTML on a second
  cleaning, for three shapes** (`safeHtml.prop.test.ts`, four `it.fails`): a
  block inside a pasted table or a button inside a paragraph, and — found
  2026-10-12 — a heading left directly inside a heading when the tag
  between them is taken away (`<h1>a<a><h1>b</h1></a>c</h1>`), and — found
  18/10/2026 in a release review, the property failing once — a list item
  left inside a list item (`<li>a<form><li>b</li></form>c</li>`). The
  property now sets aside every tree HTML cannot write, by the parser's own
  rules, instead of one pattern per shape. Layout only:
  no word is lost and nothing unsafe comes out; the second cleaning is
  stable. Cleaning until nothing changes would close it; it is a change to
  the sanitiser and was not made in a release it did not belong to.
  (12) **A result box that holds only a space is recorded as a result**
  with its unit and no value (`S. Creatinine: mg/dL`), and prints — in the
  preferred box of a two-unit pair and in every box with one unit. As in
  production (the sixth review closed it only for the box this release had
  newly opened it in). One `trim()` where a test's boxes are gathered
  closes it for all. (13) **The Investigation popup's boxes are not emptied
  when the editor is** (`resetEditor` leaves `invFormData`): in production,
  a value typed in the second box of a two-unit pair and not recorded
  stayed in that box for the next patient. Since this release a value typed
  in either box of a pair is filed when the popup closes or its date
  changes, and the boxes of a test that was filed are emptied, so it no
  longer comes about on one device (a lone space, which is not filed, stays
  in its box); a device still on the older build can mirror such a state in.
  Emptying the converted box of a two-unit pair empties the one that was
  typed in, as it always has — visible, and nothing is then recorded. And
  Enter in the SECOND unit's box of a pair files nothing, as in production:
  the value is filed when the popup closes.
- [x] **DEFECT-E2 — the patient gate stopped the mouse, not the keyboard.** Fixed
  2026-10-06 (`PatientGate` is `inert`); the Playwright test that pinned it is
  an ordinary regression test now. Fixing it exposed that `Lock` could leave a
  just-unlocked section inert until a reload; fixed in the same commit
  (`client/src/lib/inert.ts`).

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
- [ ] **An assistant without `rx.medicines` can still READ the list** through
  the API, as they can "Your usual" (`GET /rx-habits?q=`). The key is enforced
  where it matters — the pad is locked and the + greyed — and the list holds no
  patient. Refusing the read as well is a one-line guard if wanted.
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
- [x] Offline, an answer that was not the list, and a failed refresh were each
  drawn as "No medicines yet"; a failed generic lookup returned the list with
  its warnings switched off; the same medicine written with another space was
  added twice; a medicine the server could not read was left out uncounted; the
  line beside the + was in the brand's blue; Enter held on Add reopened the
  box. All fixed and pinned (`client/CLAUDE.md`, `server/CLAUDE.md`). The
  second review of those fixes found two states more — a list whose every row
  was unreadable drawn as "No medicines yet" under its own notice, and Add
  still acting on the ticks while the list was being asked for again or had
  failed — and both are closed.

Checked by breaking the code, and where that was done: until this review the
breaks were made in the working checkout, which the dev servers watch — and the
dev database is production. They are made in a copy of the sources now (root
`CLAUDE.md`, the last pattern but one).

Found on 2026-10-14 by MEASURING, after three reviews and a green suite:

- [x] **Opening the box took seconds to a minute on a catalogue of real size.**
  Every test of the generic lookup ran against the six medicines of the test
  catalogue. Against a made-up one of 35,000, a doctor with 200 medicines
  waited 5 to 7 s for the box and one with 2,000 over a minute (one `ILIKE`
  pattern per brand, each tried against every row). The lookup is one pass
  now — the service call alone takes 0.08 s and 0.32 s on the same data — and
  it is the same lookup "Your
  usual" uses, which got cheaper with it. **Not measured: the production
  catalogue itself**, which was not read. If the box is slow there, the first
  thing to look at is the API log's timing for `GET /rx-habits/all`; an index
  on the expression the lookup compares would make it instant, and is a
  manual, additive migration that was not written for this.

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
- [x] From the keyboard, every row was a Tab stop (two hundred presses between
  the search and Add), and a press beside the box threw every tick away. The
  list is one Tab stop with arrow keys; the veil closes the box only while
  nothing is ticked.
- [x] **"Move to Rx" in Drug history compared medicines letter for letter**,
  so `Tablet. Napa 500mg` from the history went on the pad beside
  `Tablet. Napa 500 mg` at the same dose. Closed on 2026-10-14 (below).
- [ ] **The documents for this feature are long for its size**, and several
  comments told the story of its reviews instead of the rule. The client guide's
  section was rewritten shorter; the root `CLAUDE.md` patterns were kept, since
  each is a lesson that applies beyond this feature.

Timed in a browser on 2026-10-14 — Chromium, a PRODUCTION build of the client,
the test API, made-up lists against a made-up catalogue of 35,000. Every figure
is the middle one of several readings:

- [x] **A long list was slow to draw and to re-order.** With 2,000 medicines
  — the most the server sends — the box took 1.9 s from the press on + to its
  rows, 1.3 s of that drawing them, and Popular / Alphabetical about a second.
  A row out of sight is no longer laid out or painted until it is scrolled to,
  and the On ℞ marks are worked out when the list or the pad changes instead
  of at every tick: 1.2 s to open, of which the page waits 0.55–0.6 s for the
  request, and 0.2–0.3 s to re-order. With 300 medicines: 0.33 s to open
  (0.19 s of it the request) and 0.1 s to re-order. A tick is 0.02–0.06 s at
  either size. The list is not windowed: every row is in the page, and a
  journey holds that the keyboard reaches a row that was never drawn.
- [ ] **The request by itself** — asked for directly, not through the page —
  takes 0.5 s for 2,000 medicines and 0.17 s for 300, in the browser suite's
  database, with tapering lines on one medicine in nine. (The 0.08 s and
  0.32 s further up are the service call alone, without HTTP, for 200 and
  2,000 medicines with no tapering lines, in the load-test database: another
  list, and less of the work.) Where in the request the time goes was not
  taken apart; the box reads "Loading the medicine list…" meanwhile.
- [ ] **Not timed, and not known:** how many medicines a real doctor's list
  holds (it was not read — the dev database is production); the production
  catalogue; a phone or an old tablet, where drawing costs several times a
  laptop's; Firefox and Safari; and whether the VPS compresses the answer —
  2,000 medicines are 550 KB of JSON, the API does not compress by itself,
  and on a hospital's Wi-Fi that matters more than any of the above. **For
  the operator:** check that nginx gzips `application/json`.

From the second pass of the independent review (2026-10-14, before release) —
nothing in it was held to block a release; what was done, and what is left:

- [x] **The search could be a moment behind the keyboard.** Its rows are drawn
  after the key press, so that a long list does not hold up typing — and
  `napa`, Tab, Space on a slow machine ticked the first row of the list as it
  stood before the search. The rows are brought up to what is typed before Tab
  lands on them.
- [x] **Escape threw the ticks away**, as a press beside the box had: it is
  also the key that clears the search, and one press too many emptied the box.
  With medicines ticked, Escape and the veil say how to close; Add, Cancel and
  the × leave the box.
- [x] **The result did not say WHICH medicine is now on ℞ more than once.** It
  names it (two at most; a count beyond that): `3 added · “Tablet. Napa 500
  mg” is now on ℞ more than once`.
- [x] **The quiet retry had been taken from every answer below 500** — for one
  round of this work, never released — and the framework's words shown for
  them ("Unauthorized", "Cannot GET /api/…"). A 401 is what the page gets
  when its session could not be renewed just then, and the retry is what gets
  the list. Only a 403 — the one refusal worded for a person — is shown as
  written and not asked for again.
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

### Drug history — "Move to Rx" (2026-10-14)

- [x] **A line was written twice when its medicine was typed another way.**
  "Only a line already on the pad is skipped" compared the medicine's label
  letter for letter: `tab napa 500mg`, typed by hand at an earlier visit, went
  on the pad beside `Tablet. Napa 500 mg` picked from the list today, at the
  same dose, food and duration. In production until the release that carried
  this. The medicine is compared with how its label was TYPED set aside —
  capitals; spaces round a plus, a stroke or a bracket and after a number;
  `Tab` / `Cap` / `Inj` / `Syp` / `Syr` / `Susp`, or the form written out with
  no full stop, for the form with one; a decimal typed `.5`; a trailing
  `N/A` or full stop. It does not convert a unit (`1 gm` and `1 g` are two
  medicines here), does not guess a missing form, and keeps the strength,
  the form, its qualifier and the brand. It is the comparison the "Add Bulk
  Medicine" box uses, as one function now (`lib/medicineKey.ts`).
  Nothing is rewritten: what reaches the pad is the entry as the history has
  it. A browser journey (`e2e/tests/drug-history.spec.ts`) fails on the
  released rule and passes on this one.
- [x] **A note on the pad that reads as a medicine.** The fix above first
  made a note "not a medicine's line": with `Napa` written as a note and a
  history entry `Napa` with no dose, food or duration, the medicine line was
  added and the printed sheet carried the name twice. **The physician's
  answer (2026-10-14): no.** A note that reads as the medicine is a line of
  it with nothing in its cells, on both screens: that entry is skipped, an
  entry WITH a dose is still added beside it, the box marks the row On ℞
  and says the medicine is now on ℞ more than once. A note that only
  mentions a medicine (`Napa if fever`) is not it. That rule was on `dev`
  and in one release (the one that carried the fix above).
- [x] **From the review of this fix, before release:** the key the box and
  Move to Rx share read the point of `.5 mg` as the full stop that ends a
  dosage form, so `Tab Rivotril .5 mg` and `Tab Rivotril. 5 mg` were one
  medicine — ticked at the same dose, the second was reported `already on ℞`
  and left off; and the commoner case, `Tab Rivotril .5 mg` typed and
  `Tablet. Rivotril 0.5 mg` picked, was still written twice. A decimal with
  no 0 in front of it, after a space, a plus, a stroke or a bracket, is read
  as one now. Also from that review: spaces round a plus or a stroke,
  `Tablet Napa` with no full stop and a full stop at the end were still
  "another medicine"; and a tapering line on the pad that carries its
  medicine's name (as one read back from the server does) would have counted
  as that medicine's first line. Closed and pinned. Its re-check found the
  first form of the `Tablet Napa` rule giving a SECOND full stop to a form
  that has one after its qualifier — `Capsule (Enteric Coated). Sergel` no
  longer matched `Cap (enteric coated). Sergel`; it follows the key's own
  reading of a form now, and five such pairs are pinned.
- [ ] **Two limits of the decimal rule stay:** a point glued to a letter
  (`Rivotril.5 mg`) is still read as the full stop that ends a form — so
  that label and `Rivotril. 5 mg` are one key — because `Inj.5-FU` is a form
  and a name; and a decimal in Bangla digits (`.৫`) is not read as one.
- [ ] **Capitals are set aside, and in one place that is not typography:**
  `3 MIU` and `3 mIU` (mega and milli) are one key. No such pair is known in
  a medicine list here; the production table was not read for this.
- [x] **The dose, the food and the duration were compared as written**
  (less their outer spaces): `After meal` on the pad and `after meal` in the
  history were two lines. **Decided by the physician (2026-10-14):** their
  capitals and spaces are set aside (`instructionKey`) — `1 + 0 + 1` is
  `1+0+1`, `5 days` is `5days` — on both screens, tapering lines included in
  the box. Nothing else is: `1-0-1`, `101`, `0.5` for `1/2` or a full stop
  at the end are other ways of writing, and what they mean is the doctor's.
  The same caution as the medicine's: `3 MIU` and `3 mIU` are one.
- [x] **A line typed without its dosage form was another medicine here too**
  — decided with the box, above.
- [x] **From the independent review, before release:** a note now stands
  for a line with nothing in it AND no tapering lines. With a note
  `Tablet. Prednisolone 5 mg` on the pad, a history entry of it with a
  blank first line and its doses in two tapering lines was skipped — "1
  already on ℞" — and the regimen never reached the pad. It is added now,
  in both screens.
- [ ] **For the physician: a label without its form matches EVERY form.**
  Through it, one form can stand for another: with `Napa 500 mg` (meant as
  the tablet) in the history and `Suppository. Napa 500 mg` on the pad at
  the same dose, food and duration, Move to Rx skips the history's line as
  "already on ℞". And with several lines ticked the order can matter:
  [`Napa 500 mg`, `Tablet. Napa 500 mg`, `Suppository. Napa 500 mg`] at one
  instruction adds one line, the same three in the other order two. The
  "Add Bulk Medicine" box does the same (the On ℞ mark and the skip). It
  needs the same dose, food and duration on two forms to happen. Say if a
  form-less label should match only when one form of it is in question.
- [ ] **A skipped medicine's tapering lines are not compared.** If the pad has
  the medicine's first line and the history's entry has tapering lines under
  it that the pad does not, they are not added and `1 already on ℞` does not
  say so. The box says it (`— its tapering lines differ there`); Move to Rx
  does not yet.
- [ ] Small: the line that says what Move to Rx did is in the brand's blue and
  is not a status region; the box's is green and is one.

### The legacy drug picker and the static templates — removed (2026-10-14)

- [x] **Unreachable code that wrote what no doctor wrote.** The drug picker
  (`DrugPicker.tsx`, `addDrug`) put any medicine of an 18-item list kept in the
  app on the pad with `1+0+1 · After meal · 5 days` beside it; the static
  "templates" (`templateRx`, `loadTemplate`) put whole regimens there — four of
  them, `Cap. Amoxicillin 500mg` 1+1+1 for 7 days among them. No screen opened
  either; the picker's open flag rode the device mirror, so a snapshot from
  another device carrying `showDrugPicker: true` was the one way left. Both are
  gone, with two pad helpers nothing called (`removeDrug`, `updateRx`) and a
  template state nothing read (`activeTemplate`, which the OPD queue still
  cleared); an
  older build may still send `showDrugPicker` and `drugSearch`, and nothing
  reads them.
- [x] **"Total monthly approximate cost" read only that 18-item list**, by the
  exact name, so for a real prescription it showed `৳0.0`. **Decided by the
  physician (2026-10-14): price it from the medicine chart — "but remember
  like Sergel 20 and Sergel 40 mg is not same".** Done; the list is gone.
  See "Monthly cost from the medicine chart" below.

### Monthly cost from the medicine chart (2026-10-14)

- [x] **Priced from the `medicines` table** (`lib/monthlyCost.ts`,
  `POST /medicines/by-brand`): a line's medicine is the chart's row by
  `sameMedicine`, form and strength included — two strengths, two prices;
  only a `Unit Price: ৳ N` of a tablet, capsule or suppository is used, read
  whole; the dose as counts (`1+0+1`), the duration in days, weeks or months
  or Continue; a month is 30 days, tapering lines in order. Every medicine
  not priced is counted beside the total and named, with why, on a press.
  A browser journey (`e2e/tests/monthly-cost.spec.ts`) holds 20 mg and 40 mg
  at their own prices against the real route.
- [x] **From the independent review, before release:** (1) the food cell
  was not read, so `1+0+0` with `After meal, once a week` was priced as
  thirty tablets a month, not four — a food cell that says more than when,
  beside a meal, now leaves the medicine not priced; (2) a brand's second
  pack, which the chart's import stores with no form and no strength, could
  carry another unit price unseen (five such medicines in the source, Sugar
  Free Gold among them) — a bare pack of the brand at another unit price
  now leaves the medicine not priced (also when it is the pack of another
  strength of the brand: which one it belongs to cannot be told); (3) a
  form of five words (`Dry Powder Inhalation Capsule (DPI).`, 147 rows in
  the source) was never asked for by its brand, and read "not found in the
  medicine chart" — the word after the label's first full stop is asked
  for too. All three pinned in `monthlyCost.test.ts` / `medicineKey.test.ts`.
- [ ] **For the physician — what the box does NOT price, by choice:** a
  syrup, a suspension, an injection, a cream, an inhaler or drops (the chart
  prices the bottle, vial, tube or device, and what one dose of it costs —
  `2 tsf` of a 100 ml bottle — is not something the app should guess); a
  medicine the chart has at two unit prices (18 of the 15,073 medicines with
  a form and a strength in the source workbooks — mostly several companies'
  products sold under the generic's name); a label
  typed without its form where the chart has that strength in two forms; a
  dose like `1 if fever`, a duration like `until review` or `চলবে`, or a
  food cell other than the ones the pad's shorthand writes (`Before meal`,
  `After meal`, `With food`, `2 hr before meal`, `2 hr before or after
  meal`, or blank). Each is shown as "not priced" and named. Whether any
  should be priced, and how, is yours to say.
- [ ] **For the physician — food instructions that mean every day but are
  not read as it (the second review's list).** A doctor who writes the food
  cell in Bangla — `খাবার পরে`, `খাবার পর`, `খাবারের আগে` — gets nearly every
  medicine with an instruction shown as not priced; so does `Empty stomach`,
  `Before breakfast`, `At night`, `At bedtime`, `30 min before meal`, `1/2
  hr before meal`, `After meals`, `After food`, `Before food`, `With meal`,
  `Take after meal`, `After meal.`. None of them says how often, and each
  could be read as every day; the list was kept to what the shorthand
  writes so that nothing is guessed. Doctors who use the shorthand (`am`,
  `bm`, `2bm`, `wf`) see little of this. Which of these — and which Bangla
  spellings — should count as every day is yours to say.
- [ ] **Known limit: an instruction written on a line of its own is not
  read.** `Tab X 70 mg — 1+0+0 — — 8 weeks` with a note under it `once a
  week on Friday` is priced as every day: thirty tablets. A note between
  medicines is most often about something else (`bed rest`), and which
  medicine a note qualifies is not something to guess. The box's own
  explanation says the price is per dose, every day.
- [ ] **The 30-day month is the app's reading of "monthly"**: a 5-day
  course is priced for 5 days, a 3-month course and Continue for 30, and a
  half tablet as half a tablet's price. Say if "monthly" should mean
  something else.
- [ ] **The price format was read from the source, not from production.**
  The workbooks the chart was imported from ("A To Z complete trade", 27,346
  rows) write every unit price as `Unit Price: ৳ N (…)`; rows the table held
  before that import were not read. A price in another shape is simply "not
  priced", never misread. The production table's `price` column (the first
  ৳ number of the text, a bottle's price for a syrup) is not used.

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
- [ ] **Shorthand does not work in BAN** (`bm`, `am`, `7d`, `c`): the letters
  are Bangla as they are typed. Unchanged since 2026-09-23 — switch to EN to
  use it. Digits are unaffected (`101` still becomes `১+০+১`).
- [ ] **A round trip writes the app's own English**: `2 weeks` → `২ সপ্তাহ`
  → `2 week`, `before meal` → `খাবারের আগে` → `Before meal`. Same meaning;
  the exact English spelling typed is not kept.
- [ ] **Only the physician's table is translated.** Anything else typed in
  the three cells (`after food`, `2.5 ml`, `1m`) is left exactly as written,
  in either mode. Each phrase to add is the physician's wording, added to
  `lib/rxLanguage.ts` and its test.
- [x] **Typing in BAN could stop the ℞ screen** (fixed 2026-10-15, before
  release). In the browser pass, `b`, `m` typed in a food cell in BAN made
  "This screen stopped working". Two key presses landed in one render, and the
  pad's two sync effects took the pad's own older copy for a change made
  elsewhere. Each effect kept putting back what the other had written until
  React stopped. The sync code is unchanged since September and the BAN
  keyboard handler since 2026-09-23, so production very likely has it too;
  the old build was not run to confirm. Now one effect, `lib/usePadSync.ts`:
  in a render where the pad moved, the pad's edit wins. Pinned by
  `usePadSync.test.tsx`, red on the old logic.

### Night mode — ☀ / ☾ (2026-10-15)

Shipped: the doctor app's whole palette as CSS variables, a dark-grey night palette (AA contrast held by a test), the switch beside BAN / EN and in the mobile header, set before the first paint. Light mode is unchanged.

Looked at in the browser, in night mode (sandbox, Chromium):
- prescription screen, OPD, IPD, Patients, Supervised, Research, Settings;
- prescription settings with the header editor (paper);
- On examination, Investigation, Preview PDF (paper stays white);
- health-trend chart, records view, personal note;
- sign-in page, mobile layout, reload (no flash; no hydration warning).

- [ ] **Not looked at in night mode:**
  - every IPD admission screen and order sheet;
  - Patient Settings;
  - the template editor;
  - the image viewer with a real photo;
  - every alert banner state;
  - the signup page.

  The colour scan test covers their literals, but nobody has looked at them.
- [ ] **Safari / Firefox not run.** `var()` inside SVG presentation attributes (`fill={C.…}`) was confirmed in Chromium only.
- [ ] **The print preview's grey surround** comes from the print document's own HTML (`prescriptionDoc.ts`, untouched by rule). At night the preview is a bright page in a dark app. That is accepted: it is the paper.
- [ ] **The admin console (:3001) has no night mode.** It is out of scope by the physician's choice.

### Dependency advisories and the deploy script (2026-10-16)

Fixed on `siam` (before release):
- **The deploy restarted production onto a failed build and reported success.** `set -e` ignores a failure inside an `&&` chain. Each build now runs in a subshell, the API first, and a failure stops the script before `pm2 restart all` (`deploy.yml`; the workflow's own script was run with stubbed commands for each failure, before and after).
- **The image optimizer is off in both Next apps** (`images.unoptimized`). It closes GHSA-2xp9-vwfh-vxw4 (critical, remote code execution when an AVIF file is optimized), GHSA-h64f-5h5j-jqjh and GHSA-3x4c-7xq6-9pq8 on an endpoint nothing used.
- **multer 2.4 under Nest 10** (`overrides`), for the eight DoS advisories on the public upload route. The route now takes one file and no text field, and a malformed request gets a 4xx, not a 500.
- **The server build fails on a `.ts` outside `src/`** (`rootDir`) instead of moving its output and 502ing.

Open — each needs its own upgrade and its own verification pass:
- [ ] **Next.js 14 → 15.5.24+, both apps.** On 14.2.35, `npm audit` lists advisories with no 14.x fix. Two matter most:
  - Unauthenticated remote code execution on **Windows-hosted** servers (GHSA-p293-qw3h-jr36, critical, "no known workaround"). Production runs on Linux, but a Windows development machine whose `next dev` port the network can reach is exposed.
  - Denial of service through React Server Components (GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, high), which apply to any App Router app.

  Next 15 brings React 19 and async request APIs: a major upgrade of the screen doctors prescribe through.
- [ ] **Nest 10 → 12:** `@nestjs/core` (an injection advisory, moderate), `body-parser` (low), and `lodash` through `@nestjs/config` (`_.template` and `_.unset` / `_.omit`; this app hands `@nestjs/config` env-var names, not request data). The multer override is a stopgap that comes out with this upgrade.
- [ ] **nodemailer 6.10.1 → 10.1.2+.** Seventeen advisories. The high ones are DoS in its address parser, plus file read / SSRF through `raw` messages and OAuth2 TLS validation (neither is used here). Every address that reaches it has passed `@IsEmail()` first (register / verify-OTP DTOs), which turns away the crafted address lists the DoS needs. Exposure is low, but it is a major version, and it needs a real SMTP send to verify.
- [ ] **Non-breaking fixes, not applied:** `qs` (request-parsing DoS, moderate); `proxy-addr` (critical, but only with a trusted SUBNET — `trust proxy 1` is a hop count and does not reach that code); `file-type` (only `@nestjs/common`'s file validators use it, and this app has its own check); `nanoid` and `source-map-js` (build time). `npm audit fix` without `--force` takes them: one lockfile change per app, with its own verification.
- **`xlsx` 0.18.5 is not exposed; recorded so it is not looked at again.** npm has no fix. Both advisories (prototype pollution, ReDoS) are in READING a sheet, and the app only writes one (`InvestigationDownload.tsx`: `aoa_to_sheet`, `writeFile`). A feature that reads an uploaded spreadsheet in the browser would change that.
- [ ] **The public upload route can fill the disk:** 100 requests a minute per address × 8 MB, and every accepted image is kept for ever. Bounding it — a quota, a cap per address, or authentication once an account exists — is a product decision.

### A `>>>` dose under the wrong medicine — closed at the source (18/10/2026)

The physician's report: a medicine's name cleared on the ℞ pad with its `>>>` line kept, and that dose was saved, printed and written into Drug history under the medicine ABOVE it. Closed in three rounds of review (`client/CLAUDE.md`, Drug history, "A taper never leaves its medicine"): a medicine with `>>>` lines keeps its name, no edit puts a `>>>` line under another medicine, and what cannot be written is refused at Save & print, Preview PDF and Save to complete later. Open:
- [ ] **A line the pad cannot write is lost without a word when the pad is drawn again.** A line with a dose and no medicine name (a medicine without `>>>` lines whose name was cleared), a nameless medicine with `>>>` lines whose name could not be put back, or a `>>>` line from data saved before the fix, lives in the pad's rows only, not in `rxItems`, the draft or the device mirror. So does a medicine with `>>>` lines for as long as its name box is empty and not yet left: a change from another device in that moment, or the auto-save, takes the pad without it. Another tab, a reload, another patient, or a change made from elsewhere (a template, Add Bulk Medicine, BAN/EN, Move to Rx, another device) draws the pad without it. It is never saved, printed or put under another medicine. Before the fix Save dropped the first kind without a word. Keeping such a line through a redraw means holding the pad's rows in the editor state, the draft and the mirror, and is a change of its own.
- [ ] **What was saved before the fix cannot be told apart.** A prescription, draft, IPD order or template saved with a cleared medicine under another medicine holds the dose under that medicine, exactly like a real `>>>` line. Nothing here can find them; the physician may want to look at recent tapering prescriptions by eye.
- [ ] **The refusal is one device's.** Such a line is not mirrored: a second device shows the prescription without it, and can Save & print what it shows.
- [ ] **An IPD admission saved before the fix with such a line refuses "Save follow up"** (the vitals) until the Prescription line is put right — also in a view where the Prescription pane is not shown. The physician should know before a ward round meets it.
- [ ] **"Your usual" in place of a medicine with `>>>` lines** puts the habit's own `>>>` lines first and keeps the old ones after them (insertion never overwrites). It is on the screen to see. Whether a pick should replace the old `>>>` lines is the physician's to say.

