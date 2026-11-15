# The ℞ pad and Save & print — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/rx-pad.md`](../rules/rx-pad.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **A second "Save & print" stores a second prescription (2026-10-12)** — Physician to decide whether a re-print of the same visit should be one row, and how "the same visit" is told from "a correction"; every press creates a `Prescription` row.
- **For the physician — what the box does NOT price, by choice** — Physician to say whether and how to price syrups, injections, creams, inhalers, drops, two-price medicines, form-less labels, `1 if fever`, `চলবে`, other food cells.
- **For the physician — food instructions meaning every day, not read so** — Physician to say which (incl. Bangla `খাবার পরে`, `খাবারের আগে`; `Empty stomach`, `At night`…) should count as every day; now shown as not priced.
- **The 30-day month is the app's reading of "monthly"** — Physician to say if "monthly" should mean something else: 5-day course priced for 5 days, 3-month course and Continue for 30, half tablet as half price.
- **No answer to three re-sends, then a change, files the visit twice** — Physician to decide whether the server should keep a visit's copies together so a corrected copy replaces the earlier one.
- **The 30-minute window is a choice, not the physician's** — An identical prescription for the same patient by the same doctor within half an hour is taken for the same one; after that it is a new visit.

**Known limits and defects, recorded on purpose**

- **Known limit: an instruction written on a line of its own is not read** — A note under a medicine (`once a week on Friday`) is ignored, so it is priced as every day; which medicine a note qualifies is not guessed.
- **The price format was read from the source, not from production** — Format `Unit Price: ৳ N (…)` read from the import workbooks; rows held before the import not read; another shape is "not priced"; the `price` column is not used.
- **An assistant without the ℞ pad's key (`rx.medicines`) and a held line** — Can neither put it right nor Save & print; the refusal box tells them to type the medicine's name — refusing is right, the words do not fit them.
- **What was saved before the fix cannot be told apart** — Prescriptions, drafts, IPD orders or templates with a cleared medicine hold the dose under another medicine; nothing finds them; physician may review recent tapers by eye.

**Closed — kept as the record of what was done or decided**

- **The legacy drug picker and the static templates — removed (2026-10-14)** — `DrugPicker.tsx`, `templateRx`/`loadTemplate` and unused helpers removed; monthly cost now priced from the medicine chart (physician's decision 2026-10-14).
- **Priced from the `medicines` table** — `lib/monthlyCost.ts`, `POST /medicines/by-brand`: matched by `sameMedicine`, only `Unit Price: ৳ N` of tablet/capsule/suppository; unpriced medicines counted and named.
- **Monthly cost — from the independent review, before release** — Food cell now read (`After meal, once a week`); a bare pack at another unit price leaves it unpriced; five-word forms asked by brand; pinned in tests.
- **Typing in BAN could stop the ℞ screen (fixed 2026-10-15)** — Two key presses in one render made the pad's two sync effects loop; now one effect, `lib/usePadSync.ts`; production very likely had it, not confirmed.
- **A line the pad cannot write was lost when redrawn — closed 19/10/2026** — The editor HOLDS the pad's rows with the visit (draft, `incompleteRx`, device mirror); refused at Save & print; a mirrored state that never had the line can drop it silently.
- **A save whose answer was lost, pressed again, filed the visit twice** — Server answers the same prescription sent again within 30 minutes with the one on record; an OPD add pressed again keeps the token while waiting.
- **A stored save with a lost answer was told "not saved" (20/10/2026)** — App re-sends the same request after 1, 2 and 4 s; with none, it says it MAY not have been saved (`client/src/lib/sendAgain.ts`, `rxNotSaved`).

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

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

### The legacy drug picker and the static templates — removed (2026-10-14)

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

### A `>>>` dose under the wrong medicine — closed at the source (18/10/2026)

The physician's report: a medicine's name cleared on the ℞ pad with its `>>>` line kept, and that dose was saved, printed and written into Drug history under the medicine ABOVE it. Closed in three rounds of review (`client/CLAUDE.md`, Drug history, "A taper never leaves its medicine"): a medicine with `>>>` lines keeps its name, no edit puts a `>>>` line under another medicine, and what cannot be written is refused at Save & print, Preview PDF and Save to complete later — and, since 19/10/2026, kept with the visit until it is put right. Open:
- [x] **A line the pad cannot write was lost without a word when the pad was drawn again — closed 19/10/2026.** Such a line (a dose with no medicine name; a nameless medicine with `>>>` lines; a `>>>` line from data saved before the fix) still never goes into the prescription's items, but the editor now HOLDS the pad's rows beside them while one is on the pad, and the hold travels with the visit: the draft, the patient's parked prescription (`incompleteRx`) and the device mirror. Another tab, the phone layout, a reload, another patient and back, a mirrored device: the line is back, red, refused at Save & print, Preview PDF and Save to complete later — also with the ℞ column off the screen, where the refusal used to lapse. A template, Add Bulk Medicine or Move to Rx adds after it; the BAN / EN switch writes it too. Only where it no longer fits the prescription it was written beside is it taken off, and the pad says so in a box, naming it — not when the line was put right or taken off on another device, and so not either when another device's state arrives that never had the line (an edit there before the mirror carried it, or a mirror connection that dropped and missed it): the two send the same state and cannot be told apart, and the line goes without a word (`client/CLAUDE.md`). The moment a medicine's name box is empty and not yet left is held the same way. A pad holding nothing but such a line now counts as work, and is parked. (`client/CLAUDE.md`, "A taper never leaves its medicine", (4).)

- [ ] **An assistant without the ℞ pad's key** (`rx.medicines`) who opens a visit parked with such a line can neither put it right nor Save & print, and the refusal box tells them to type the medicine's name. Refusing is right; the words do not fit them.

- [ ] **What was saved before the fix cannot be told apart.** A prescription, draft, IPD order or template saved with a cleared medicine under another medicine holds the dose under that medicine, exactly like a real `>>>` line. Nothing here can find them; the physician may want to look at recent tapering prescriptions by eye.

### Nothing lost on a reload, nothing filed twice (19/10/2026)

- [x] **A save whose answer was lost, pressed again, filed the visit twice.** The server answers the same prescription (every field and line) sent again within 30 minutes with the one on record; an OPD add pressed again keeps the patient's token while they are still waiting.
- [x] **A stored save whose answer was lost was told to the doctor as "The prescription was not saved."** (20/10/2026). The visit stayed "Incomplete" with a prescription on the record, and a word changed before the next press filed it twice. The doctor app now sends the very same request again (after 1, 2 and 4 seconds) while its answer is lost, and the first answer that comes is taken as it is; with none, the box says it MAY not have been saved, and that pressed again unchanged within half an hour it will not be filed twice (`client/src/lib/sendAgain.ts`, `rxNotSaved`).

- [ ] **No answer through all three re-sends, then a change before pressing again (or a press after half an hour), files the visit a second time** — the first stored copy never printed. The client cannot know which earlier copy the corrected one replaces without the server keeping a visit's copies together, which is a change to how the record holds a visit: the physician's to decide. Seven seconds of re-sends cover a dropped connection and most of a deploy's restart.
- [ ] **The 30-minute window is a choice, not the physician's.** An identical prescription for the same patient by the same doctor within half an hour is taken for the same one (a re-print of an unchanged visit no longer adds a row); after that it is a new visit.
