# Investigations — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/investigation.md`](../rules/investigation.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Two names stand twice in the investigation catalog (2026-10-12)** — Physician to pick which to keep or rename: `Beta-HCG` and `ECG`; in ECG / Drug, Enter or Add on ECG files nothing until the popup closes.
- **⚕️ Fibrinogen's second unit does not agree with its factor** — Physician to settle: Fibrinogen `g/L`/`mg/L` with factor 100 records `300mg/L`; unit should read `mg/dL` or factor be 1000 (+ whether two decimal places suffice).

**To do — engineering work that is known and not done**

- **On-examination vitals (OE popup, `OeData`)** — Folded into investigation text, not stored structured.

**Known limits and defects, recorded on purpose**

- **⚕️ Two-unit box results before this release may be wrong or missing** — Before the fix, comma/power/remark values were stored as a wrong conversion (`1,2` → `88.42umol/L`) or not recorded; nothing marks them, so no scripted repair; check against paper.

**Closed — kept as the record of what was done or decided**

- **Investigation findings log to the activity feed** — Findings added via the popup log to the activity feed (Notification section) on every add path, including closing the popup.
- **Lab test names stay as the catalog writes them (settled 2026-10-12)** — Closed the safe way: names stay as written (`eGFR` vs `EGFR`); a name wanted in capitals is written so in `client/src/data/investigations.ts`.
- **…and a fifth time, 2026-10-12 — two-unit box recorded a wrong number** — Two-unit conversion read only the start (`1,20,000` → `HBV DNA: 0.18IU/mL`); now only whole plain numbers converted; `>2,000` no longer drawn as 0; note button inert while open.

---

# The threads, in full

## 1. Not persisted (in-memory only — "save & reload = gone")

- [ ] **On-examination vitals** (OE popup, `OeData`) — folded into investigation text, not stored structured.

## 3. By design (not a bug)

- Investigation findings added via the popup now log to the activity feed (Notification section) on every
  add path — including closing the popup, not just the per-test "Add" button.

## Open threads — decisions owed, not bugs (2026-07-27)

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

- [ ] **Two names stand twice in the investigation catalog** (found
  2026-10-12): `Beta-HCG` (Tumor Markers and Reproductive) and `ECG`
  (Imaging, field "Report"; ECG / Drug, field "Result"). `client/CLAUDE.md`
  says names are unique. Stored and shown correctly either way, but in the
  ECG / Drug category Enter or Add on ECG files nothing until the popup
  closes — the lookup finds the Imaging one first. Which to keep, or what
  to call the second, is the physician's.

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
