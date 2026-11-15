# Drug history — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/drug-history.md`](../rules/drug-history.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **For the physician: a label without its form matches EVERY form** — Physician to say if a form-less label should match only when one form of it is in question (`Napa 500 mg` vs `Suppository. Napa 500 mg`; result depends on order).
- **A Drug history line added after printing ("+ Add medicine")** — Physician to confirm the supervising doctor's refusal after Save & print (decided in their stead); whole-list last-writer-wins can still drop the line.
- **Assumed: "drug history" means the modal and the Records page section** — Chart bars, ℞ pad, "+ Add medicine", H/O drug hypersensitivity and the monthly-cost list still show the brand.
- **Assumed: name shown is `<dosage form> <generic> <strength>`** — Brand shown nowhere in the list, not even a tooltip; while the chart is asked the entries are shown as stored.
- **Does "Continue" count as Current medication?** — Physician to confirm: built so; a Continue written years ago is listed as Current until changed; no readable End is NOT Current.
- **End = Start + the days of the course** — As the sheet's example (day after last dose); week 7, month 30; tapers run in sequence; End/Total blank if any line's duration cannot be read.
- **Total = units a day × days** — From a dose of counts joined by `+`; a dash for other doses (`5 ml tds`) or a food cell saying how often; half tablet counted as a half.
- **The name in the table is the generic with the brand in brackets** — `Paracetamol (Tablet. Napa 500 mg)`; the modal shows the generic alone; physician to confirm the two may differ.
- **Edit is the first change to a stored drug-history line** — Changes start date and durations only, never name, dose or food; no delete; a dose mistake is still a new line.

**To do — engineering work that is known and not done**

- **Test data left on a real record** — Patient muhammad jubayer (`01753710293`) carries invented `Losartan 50mg` and `Metformin 500mg` entries; remove them from Drug history when no longer wanted.
- **A skipped medicine's tapering lines are not compared** — Move to Rx does not add or report differing tapering lines under a skipped medicine; the box says it (`— its tapering lines differ there`), Move to Rx does not yet.
- **Not verified against the production medicine chart** — The test chart has six medicines; how many stored entries find exactly one generic is not known.

**Known limits and defects, recorded on purpose**

- **Two limits of the decimal rule stay** — A point glued to a letter (`Rivotril.5 mg`) is still read as a form's full stop (because of `Inj.5-FU`); a decimal in Bangla digits (`.৫`) is not read as one.
- **Capitals are set aside — `3 MIU` and `3 mIU` are one key** — Mega and milli become one key; no such pair known in a medicine list here; the production table was not read for this.
- **A medicine the chart lists under two generics is shown as stored** — Marked "more than one generic in the medicine chart"; "Your usual" uses the first such generic; the two differ on purpose until the catalogue is looked at.
- **A label the chart cannot match is marked "generic not found"** — Hand-typed medicines, a strength the chart lacks, a form written another way.
- **A Save & print from an older list can write the old date back** — Older last-writer-wins of a whole-list write; the edit itself never overwrites a line another device changed (409).
- **A line on today's ℞ cannot be edited there** — The ℞ mirror owns it; after a Save & print that visit's lines stay locked until the next visit is opened.

**Closed — kept as the record of what was done or decided**

- **"Move to Rx" in Drug history compared medicines letter for letter** — `Tablet. Napa 500mg` went on the pad beside `Tablet. Napa 500 mg`; closed on 2026-10-14.
- **A line was written twice when its medicine was typed another way** — `tab napa 500mg` beside `Tablet. Napa 500 mg`: medicine now compared with typing set aside, one function with the box (`lib/medicineKey.ts`); no unit conversion.
- **A note on the pad that reads as a medicine** — Physician's answer (2026-10-14): a note that reads as the medicine is a line of it with nothing in its cells, on both screens; `Napa if fever` is not it.
- **From the review of this fix, before release — decimal `.5 mg`** — `.5 mg` no longer read as a form's full stop; spaces round plus/stroke, `Tablet Napa`, trailing stop, tapers carrying the name, double stop after qualifier: closed and pinned.
- **The dose, the food and the duration were compared as written** — Decided by the physician (2026-10-14): capitals and spaces set aside (`instructionKey`), both screens; `1-0-1`, `101`, `0.5` for `1/2` stay different.
- **A line typed without its dosage form was another medicine here too** — Decided with the box, above.
- **Independent review — a note stands for a line with no tapering lines** — An entry with a blank first line and doses in tapering lines was skipped against a note; it is added now, in both screens.
- **Closed in review, before release (review of 409be0b)** — "+ Add medicine" now appended by the server; taper take-back, audit lines, print day, BAN cell rewrite and OPD `1.5` age refusal closed.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Test data left on a real record:** patient *muhammad jubayer*
  (`01753710293`) carries two invented drug-history entries — `Losartan 50mg`
  (10/01/2024 and 27/06/2026) and `Metformin 500mg` (20/07/2026) — added with the
  owner's permission to exercise the medication editor. Duration overrides on
  that patient were all cleared. Remove the two drugs from Drug history when they
  are no longer wanted.

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

- [x] **"Move to Rx" in Drug history compared medicines letter for letter**,
  so `Tablet. Napa 500mg` from the history went on the pad beside
  `Tablet. Napa 500 mg` at the same dose. Closed on 2026-10-14 (below).

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

### Nothing lost on a reload, nothing filed twice (19/10/2026)

- [ ] **A Drug history line added after printing ("+ Add medicine") goes to the patient's record at once**, appended by the server to whatever the record holds — parking does not carry it, and it was lost with the next patient. **A supervising doctor after Save & print is refused — decided in the physician's stead, to confirm:** a supervising doctor cannot write the owner's record, so the line would be kept nowhere; before Save & print it is kept on the prescription. Not covered — the older last-writer-wins of a whole-list write: a later Save & print from an editor whose list was read before the line landed writes its list without it — another user of the practice, a device without the mirror or whose mirror connection dropped, or another device printing in the same moment. And before the patient's record has loaded, a line already on it is not recognised as a repeat.

- [x] **Closed in review, before release (review of 409be0b):** "+ Add medicine" after printing built the list on the device — one device's copy erased what another device had just printed, and a write queued across a patient switch wrote one patient's list into another's record (now appended by the server); a failed line was taken back line by line and could take another medicine's identical taper; a corrected re-print whose answer was lost wrote no audit lines; the day of the print was read off the visit's date; BAN rewrote a cell only passed through once the visit had changed; an OPD status write with a typed `1.5` age was refused.

### Drug history shown by its generic names (02/11/2026) - open for the physician

- [ ] **Assumed:** "drug history" means the Drug history modal (Current medications and Distant past) and the Records page's Drug history section. The Health-trend chart's medicine bars, the ℞ pad, "+ Add medicine", H/O drug hypersensitivity and the monthly-cost list still show the brand.
- [ ] **Assumed:** the name shown is `<dosage form as stored> <generic> <strength as stored>`; the brand is shown nowhere in the list, not even in a tooltip. While the chart is being asked (a moment after the list opens) the entries are shown as stored.
- [ ] **A medicine the chart lists under two different generics is shown as stored**, marked "more than one generic in the medicine chart" — never one of them. "Your usual" uses the first such generic (older rule, `server/CLAUDE.md`); the two differ on purpose until the catalogue is looked at.
- [ ] **A label the chart cannot match is shown as stored, marked "generic not found"** — hand-typed medicines, a strength the chart does not have, a form written another way the app does not know.
- [ ] **Not verified against the production medicine chart** (the test chart has six medicines): how many stored entries find exactly one generic is not known.

### Drug history table, Edit and Add on the records page (07/11/2026) - open for the physician

- [ ] **Does "Continue" count as Current medication?** Built so: a medicine whose duration says Continue goes on, so it is listed first; a medicine with no readable End (no unit, no duration, no date) is NOT Current. "Current = End date today or later" was the physician's answer; Continue has no End to compare. A Continue written years ago is listed as Current until someone changes it.
- [ ] **End = Start + the days of the course** (a 7-day course from 06/11 ends 13/11), **as the sheet's own example writes it**: the day after the last dose. Weeks are 7 days and a month is 30, as the monthly-cost box counts them. A tapering regimen runs its lines one after the other (the monthly-cost box's rule); End and Total of the regimen are blank when any line's duration cannot be read (`5` with no unit, as in the Prednisolone example of the Drug history screenshot).
- [ ] **Total = units a day × days**, from a dose written as counts joined by `+`. Not worked out (a dash): a dose written any other way (`5 ml tds`), and a food cell that says how often (`once a week`). A half tablet is counted as a half; a total that is not a whole number is shown to two places.

- [ ] **The name in the table is the generic with the brand in brackets** (`Paracetamol (Tablet. Napa 500 mg)`), the physician's sheet of 07/11/2026; the Drug history MODAL still shows the generic alone (02/11/2026). Confirm that the two may differ.
- [ ] **Edit is the first change to a stored drug-history line.** It changes the start date (of the whole block, tapers included) and the durations, never the name, dose or food; there is still no delete, and no way to change a dose. A mistake in a dose is still a new line.
- [ ] **A change reaches the record at once, but a Save & print from a device whose copy of the list was read earlier writes its whole list** (the older last-writer-wins of a whole-list write, `server/CLAUDE.md`): it can write the old date back. The edit itself never overwrites a line another device changed (409).
- [ ] **A line on today's ℞ cannot be edited there** (the ℞ mirror owns it); it is changed on the pad. After a Save & print the lines of that visit stay locked until the next visit is opened.
