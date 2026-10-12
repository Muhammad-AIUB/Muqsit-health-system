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
  in that review, in production until 2026-10-12.** Only in a box with no
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
  brand (`Capsule (Enteric Co…`) — the phone's two-line rule would fix it and
  changes the look of the chart, so it waits for the physician; with the
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
  middle part is 5 or 10), and of eight strengths differing in three places
  one pair is left under one name at thirteen letters (`it.fails` in
  `timelineLabel.test.ts`). The tooltip and the list under the chart carry
  every name in full; a third line, or a wider strip, would close it and
  changes the look of the chart. (9) A personal note's save that FAILS after
  the note was closed says nothing (Close with "Discard" while the request
  was still on its way): the words are gone and no message is shown. As in
  production. (10) In the client suite's log, two older test files
  print React's "not configured to support act(...)" warning
  (`PatientChat.test.tsx`, `PatientMobileLookup.test.tsx`); they pass, and
  were not looked into. (11) **`DEFECT-D4` — the cleaner of the personal
  note's and the header's HTML does not give the same HTML on a second
  cleaning, for two shapes** (`safeHtml.prop.test.ts`, three `it.fails`): a
  block inside a pasted table or a button inside a paragraph, and — found
  2026-10-12 — a heading left directly inside a heading when the tag
  between them is taken away (`<h1>a<a><h1>b</h1></a>c</h1>`). Layout only:
  no word is lost and nothing unsafe comes out; the second cleaning is
  stable. Cleaning until nothing changes would close it; it is a change to
  the sanitiser and was not made in a release it did not belong to.
- [x] **DEFECT-E2 — the patient gate stopped the mouse, not the keyboard.** Fixed
  2026-10-06 (`PatientGate` is `inert`); the Playwright test that pinned it is
  an ordinary regression test now. Fixing it exposed that `Lock` could leave a
  just-unlocked section inert until a reload; fixed in the same commit
  (`client/src/lib/inert.ts`).
