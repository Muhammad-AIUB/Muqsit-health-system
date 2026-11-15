# "Your usual", learned phrases, Add Bulk Medicine, drug advice

> **Read this before changing the code it covers.** Named in these rules: `server/src/rx-habits/normalise.ts`, `lib/rxDrugAdvice.ts`, `lib/rxHabitKey.ts`, `lib/rxHabitRows.ts`, `scripts/rebuild-rx-habits.js`, `data/suggestions.ts`, `drug-advice/keys.ts`, `hooks/useRxHabits.ts`, `lib/bulkMedicines.ts`, `lib/medicineKey.ts`, `lib/rxSuggest.ts`, `rx-habits/rxLanguage.ts#cellInEnglish`, `scripts/rebuild-doctor-phrases.js`, `manual-rx-habits.sql`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `client/CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- A habit/phrase `patientCount` is never `increment: 1`: it counts distinct patients, taken from the record.
- A derived-feature write never fails a prescription save: it runs awaited, in try/catch, after `prescription.create`.
- A list that is being TICKED is never replaced under the doctor ("Add Bulk Medicine"): while a request is on its way the box says Loading and draws no rows (`bulkBoxState`); rows catch up before Tab (`catchUp`).
- "The same" is never said of what was compared in part: what "Add Bulk Medicine" compares for its skip (the first line) and what it says about it are worked out separately (`bulkToRxItems`).
- A "fail silently" rule is never handed to a second caller without the thing that made it safe: for the bulk list the generic lookup throws (`listAll` does not catch what `attachGenerics` throws; `list` does).
- A flag that names one feature is never put on what another feature made (`fromHabit` on bulk lines would write an untrue activity sentence): before reusing a field, read every place that reads it.
- A flag is never carried across a fold by the wording that won alone (`rebuild-rx-habits.js`): every wording that landed on the habit is tried for `hidden` / `pinned`, and `hidden` wins.
- How it works — "Your usual" prescribing habits: the doctor's own past instructions for the medicine being typed, offered as full lines above the medicine results; client-side rules follow.
- `MedicinePad` `showHabits` is opt-in and defaults to FALSE; only the OPD ℞ pad opts in — a new caller must never pick up clinical suggestions by accident.
- "Your usual" render is total: `safeContLines` skips what it cannot read and every string goes through `safeHabitText`, so a bad value never unmounts the prescription editor.
- `insertHabitRows` never overwrites: it replaces the clicked row and splices the tapering lines below it; focus goes to the next medicine row.
- "Your usual" lines and notes wait for 3 letters (`rxSuggestReady`, spaces not counted); the medicine list keeps 2; the gate lives in `MedicinePad`, not the hooks.
- "Your usual" count reads "7 patients", never "7×" — it means distinct patients.
- "Your usual" empty renders nothing — never an empty-state message; a failed lookup resolves to `[]` silently.
- "Your usual" `✕` needs the permanent way back (`N hidden — show`), not just Undo; a failed hide is reported by putting the row back.
- "Your usual" `generic` comes from the SERVER on the same response (`RxHabitGroup.generic`); losing it silently stops a contraindication firing; `resolveGeneric` is only a fallback.
- `lib/rxHabitKey.ts` mirrors `server/src/rx-habits/normalise.ts` and both tests share one literal table — edit both copies; a mismatch yields no generic, never another medicine's.
- Learned phrases: `GET /api/doctor-phrases` via `hooks/useDoctorPhrases` (300 ms debounce, out-of-order guard, failure resolves to `[]`); "no saved phrases" and "lookup failed" must not look alike.
- Advice chips: learned → recents → static, de-duplicated; since 31/10/2026 no count, recents marked `plus`, no static Advice list, doctor's lines never cut; keep `sugs` order and score bonus in step.
- How it works — ℞ note line: "Your usual notes" in the `MedicinePad` dropdown only on a row that is NOT a medicine, gated by `showHabits`, so IPD sheet, Drug-history pad and template editor are untouched.
- Recents (`useFieldRecents`, `User.fieldRecents`) are KEPT beside learned phrases: learned ones come only from saved, printed prescriptions; do not tidy them away as a duplicate.
- Learned phrases: nothing is ever auto-filled (every suggestion needs a click); the client never writes to the phrase table — only a completed prescription teaches it.
- ••• special advice per medicine (OPD pad only): only on NAMED medicine lines, never a taper, note or typing line; Save is NOT optimistic; assistants need `rx.advice` (+2 more)
- ••• advice beside each Final diagnosis: keyed by diagnosis folded for case and spacing only, never matched on part of it; app ships no diagnosis advice; medicines' advice first (+2 more)
- Advice box "From your other advice": copies a line saved for any medicine, group or diagnosis into THIS box only; the other entry is never written; not offered without `rx.advice`
- Advice-section mirror: withdraws only lines it added (`rxAdviceOwned`), never a hand-typed line; does nothing until `useDrugAdvice` has LOADED; keys mirror `server/src/drug-advice/keys.ts` (+2 more)
- Add Bulk Medicine (+ beside ℞, OPD pad only): one row per medicine with its usual instruction, tapers and generic; Popular / Alphabetical; not on IPD sheet, Drug-history pad or template editor
- Add Bulk Medicine invents nothing: a cell left blank is added blank; a first line saved blank reads "No dose recorded" and is added so
- Add Bulk Medicine: a taper goes with its medicine; a medicine whose taper cannot be read is left out WHOLE and counted; the response is read as `unknown` (`readBulkList`)
- Add Bulk Medicine: the generic travels with the medicine on the same response (warnings are written against it); the server does not offer the list when it cannot ask the catalogue
- Add Bulk Medicine: a LINE is never written twice (same medicine, dose, timing, duration skipped); a MEDICINE can be and the box says so; compare via `sameMedicine` / `instructionKey` (+3 more)
- Add Bulk Medicine: only ticked rows are added, in on-screen order, after the pad's last line, and the pad scrolls to them; a tick survives a search that hides its row
- Add Bulk Medicine box is ONE patient's: closes in the same render when `currentPatientId` changes (and when `rx.medicines` is taken away); it does not come back with the first patient
- Add Bulk Medicine: "No medicines yet" only for a list HERE and empty (`bulkBoxState`); every opening asks again and waits; `networkMode: "always"`; one quiet retry, never on a 403 (+2 more)
- Add Bulk Medicine keyboard: list is ONE Tab stop; the row landed on is asked into view on each of four frames (`SETTLE_FRAMES`); Tab brings rows up to the search first (`catchUp`) (+3 more)
- How it works — Add Bulk Medicine long list: server cuts at 2,000, list not windowed; `ROW_OUT_OF_SIGHT` (`content-visibility: auto`) and On ℞ marks worked out on change keep it quick; what was not timed
- Add Bulk Medicine: an assistant needs `rx.medicines`; without it the + is greyed (`aria-disabled`, still a Tab stop) with the reason in its name and tooltip
- Add Bulk Medicine lines carry no `fromHabit` (that flag writes an activity-feed line on save); the box teaches `DoctorRxHabit` nothing and logs nothing
- Add Bulk Medicine chips: a chip shows the NAME only; ▼ offers the last three instructions plus the usual; chip starts on the usual; Add adds exactly the chosen instruction, nothing mixed (+3 more)
- Known limit — Add Bulk Medicine tests and known limits: a medicine saved with no instruction is not listed; one dose per medicine; a medicine already on the pad is never changed from the box (+1 more)
- Add Bulk Medicine "Your selected medicine names are:" box: ticked medicines in Add order; ONE height (86px, scrolls inside), never grows; its × is out of the Tab order and keeps the focus
- How it works — `rx-habits` learns a doctor's repeated prescribing instructions and offers them in the ℞ pad; domain rules are in the root `CLAUDE.md`, code-level rules follow.
- `patientCount` is never `increment: 1`: it counts DISTINCT PATIENTS, from the record via `priorBlockKeys()`.
- `contLines` (Json) is unknown at every boundary: `sanitiseContLines` returns `null` and the block is dropped whole — never partially; the client sanitises again.
- The lookup matches `searchKey` only, via the same normalisation, needs the `text_pattern_ops` index (`C.UTF-8` collation), and escapes LIKE metacharacters (`likePrefix`).
- `list()` attaches each medicine's `generic` from the raw `medicines` table server-side — a SAFETY field for alerts; do not resolve it on the client from a separate request.
- `listAll()` (`GET /rx-habits/all`, Add Bulk Medicine) THROWS on failure, scoped by `@WorkstationDoctorId()`; hidden rows left out before choosing (+2 more).
- `attachGenerics` THROWS on a failed catalogue lookup: `list()` catches it, `listAll()` must not — a silent-fail rule is safe only with a caller that has a second source.
- `catalogueRows` asks the catalogue ONCE by equality on the brand's first word — never turn it back into a `LIKE`, never use `= ANY($1)`; two generics for one medicine: the first is used, logged.
- The `rx-habits` boot check never throws: `onModuleInit` runs `SELECT 1` and logs one ERROR naming `manual-rx-habits.sql` if the table is unreadable.
- `RxHabitsModule` must import `WorkstationsModule`; typecheck passes without it but the API crash-loops at boot — start the server for a new guarded module.
- How it works — `doctor-phrases` learns Advice and free-typed ℞ note lines; `PrescriptionsService.create` calls `phrases.recordFrom` in the same try/catch that can never fail the save.
- `manual-doctor-phrase-habit.sql` must be applied before `doctor-phrases` does anything; until then the boot check logs one ERROR and both fields work silently.
- `doctor-phrases` `patientCount` is DISTINCT PATIENTS via `priorSignatures`; never `increment: 1` unconditionally.
- `doctor-phrases/normalise.ts` folds typography only (case, whitespace, one trailing full stop); it must never drop a word, number, unit or parenthesised qualifier.
- `doctor-phrases` lookup size depends on surface (`LIST_LIMIT`): `rxNote` at most 8, `advice` at most 1000 (physician wants every Advice line offered).
- `doctor-phrases` `hidden` is never un-set by a later save; un-hiding is the PATCH route.
- Repair `doctor-phrases`, never hand-edit: `node scripts/rebuild-doctor-phrases.js [--dry-run]` recomputes it in one transaction, re-applying `hidden` by content.
- Repair rx-habits, never hand-edit: `rebuild-rx-habits.js [--dry-run]` re-applies `pinned`/`hidden` by content — never simplify to a `signature` join; the script must stay `.js`.
- A Bangla dose/food/duration is the same habit as its English via `cellInEnglish` (copy of the client table); nothing outside the table read; rebuild keeps `hidden` from ANY folded wording (+1 more).
- `DoctorDrugAdvice` is typed by the doctor, not derived; `PUT /drug-advice` replaces a key's lines, scoped by `@WorkstationDoctorId()`, an assistant needs `rx.advice` (+1 more: key scopes).

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not `increment: 1` a habit/phrase `patientCount`. It counts distinct patients, taken from the record.
- We do not let a derived-feature write fail a prescription save. It runs awaited, in try/catch, after `prescription.create`.

- We do not let a list that is being TICKED be replaced under the doctor. "Add Bulk Medicine" asks for the doctor's medicines on every opening, because a prescription saved in between changes the counts — and a cached list shown at once, with the newer one landing a moment later, re-sorts the rows as a finger comes down: the tick lands on the medicine that moved into that place. While a request is on its way the box says Loading and draws no rows (`bulkBoxState`). The first version left "nothing is kept between openings" to the cache's own timer (`gcTime: 0`); a test that reopened the box at once still found last time's list in it (2026-10-13, before release). The search broke the same rule a round later: its rows are drawn a moment behind what is typed, so that a long list does not hold up typing — and Tab reached the first row of the list as it stood BEFORE the search, where `napa`, Tab, Space ticked another medicine. The rows are brought up to what is typed before the keyboard lands on them (`catchUp`; second pass of the independent review, before release).

- We do not say "the same" of what we compared in part. "Add Bulk Medicine" skips a medicine whose first line is on the pad — the physician's rule, so that no LINE is written twice (the same medicine at another dose is another line, and is added) — and said "already on ℞ with the same instruction", while the pad held that medicine WITHOUT the tapering lines shown in the box. The skip was right and the sentence was not: what is compared for the skip (the first line) and what is said about it (the whole instruction) are worked out separately now, and the line beside the + says when the tapering lines differ (`bulkToRxItems`, first review, before release).
- We do not hand a "fail silently" rule to a second caller without the thing that made it safe. The "Your usual" dropdown may lose a medicine's generic to a failed catalogue lookup, because the ℞ pad has a second source for it — a partial one: the medicine results loaded for what was typed. The bulk list reused that lookup, try/catch and all — and it has no second source, so a medicine added from it would have gone onto the pad with its contraindication warning switched off, several lines at once and nothing on screen to say so. There the lookup throws, and the box says the list could not be loaded (`listAll` does not catch what `attachGenerics` throws; `list` does — first review, before release).
- We do not put a flag that names one feature on what another feature made. The design for "Add Bulk Medicine" said its lines should carry `fromHabit`, as a line picked from "Your usual" does — and that flag is what makes a save write `N of M ℞ lines inserted from "Your usual"` to the activity feed, a sentence about how the prescription was written that would not have been true. Before reusing a field, read every place that reads it.

- We do not carry a flag across a fold by looking only at the wording that won. `rebuild-rx-habits.js` re-attaches `hidden` / `pinned` by the content of the NEWEST prescription's wording — enough while one signature meant one wording per stored row. When a rule folds two wordings into one habit (the same dose written in Bangla and in English, `ALGO_VERSION` 2, 2026-10-15), a flag set on the older wording was dropped and a dose the doctor had hidden came back. Every wording that landed on the habit is tried, and `hidden` wins. Found before release, from reading the script, not from a failure; the integration spec puts the hidden flag on the OLDER wording because that is the one the newest-wording logic loses, and was checked red against that logic in a copy of the sources.

## ⚕️ Clinical-accuracy rules specific to the client

_From `client/CLAUDE.md`._

- **Prescribing habits — "Your usual" (`hooks/useRxHabits.ts`, `lib/rxHabitRows.ts`, `lib/rxHabitKey.ts`, rendered inside `MedicinePad.tsx`):** the doctor's own past instructions for the medicine being typed, offered as full lines above the medicine results. The domain rules are in the root `CLAUDE.md`; these are the client-side ones:
  - **`showHabits` is opt-in and defaults to FALSE.** Four screens render `MedicinePad` — the OPD ℞ pad (`RightColumn`, the only one that opts in), the IPD order sheet, the Drug-history pad and the template editor. Ward doses and a patient's existing medication are not outpatient prescribing habits, so the default has to be "off": a new caller must never pick up clinical suggestions by accident.
  - **The render is total, and the conversion is a pure module for that reason.** `contLines` reaches the browser from a `Json` column, so `safeContLines` skips anything it cannot read rather than mapping over it, and every string goes through `safeHabitText`. This code runs *inside* the prescription editor, where React unmounts the whole tree on an uncaught render error — the same failure that took out `rxAlerts` on 2026-08-01. `rxHabitRows.test.ts` throws garbage at every entry point.
  - **Insertion never overwrites.** `insertHabitRows` replaces the clicked row and SPLICES the tapering lines below it, pushing what followed downward; focus then goes to the **next medicine row**, not `dose` — the clicked row is already complete, which is the entire point.
  - **Learned lines wait for 3 letters (physician's request, 2026-09-25).** `MedicinePad` asks `useRxHabits` and the ℞-note `useDoctorPhrases` only once `rxSuggestReady()` (`lib/rxSuggest.ts`, spaces not counted) holds. The **medicine list keeps its 2-letter start** — the physician chose to gate only "Your usual" lines and "Your usual notes". The gate lives in the pad, not the hooks: `useDoctorPhrases` also serves the Advice field, which deliberately offers phrases with nothing typed. Pinned in `rxSuggest.test.ts` and `MedicinePad.suggestMin.test.tsx`.
  - **The count reads "7 patients", never "7×".** It means distinct patients, and a bare `×` invites the reader to supply their own meaning for the one number that separates a routine dose from a one-off.
  - **Empty renders nothing — never an empty-state message.** A failed lookup resolves to `[]` silently. On a clinical screen "no suggestions" and "the lookup failed" must not look alike, and the safe rendering of both is silence plus a working dropdown; the operator hears about it in the server log instead.
  - **`✕` needs the permanent way back, not just Undo.** Hiding raises the Undo bar — which lives OUTSIDE the dropdown, because the dropdown closes on the very click that raises it — and the group also shows `N hidden — show` whenever that medicine has hidden rows. Without that second route `✕` is a one-way door: dismiss the Undo bar, change your mind tomorrow, and the suggestion is unreachable. Hiding is never destructive (the prescription record is untouched), so a failed hide is reported by simply putting the row back.
  - **The `generic` comes from the SERVER, with the suggestion.** Prescribing-alert rules are written against generics (`entecavir`) while the ℞ line carries the brand (`Tablet. Barcavir 0.5 mg`), and a habit learned from history cannot carry a generic of its own — so `RxItem.generic` is the only bridge, and losing it means a contraindication silently stops firing on the *fastest* path through the editor. The first design resolved it on the client from the medicine results already loaded; that made a safety field depend on a race between two independent requests, so `RxHabitGroup.generic` now travels on the same response and cannot separate from the suggestion. `resolveGeneric` in `rxHabitRows.ts` remains as a fallback. Pinned end-to-end (suggestion → generic → alert) in `rxHabitAlerts.test.ts`, using the real Barcavir/Entecavir pair.
  - **`lib/rxHabitKey.ts` is a deliberate mirror of `server/src/rx-habits/normalise.ts`, and the two test files share one literal table** (`rxHabitKey.test.ts` ⇄ `normalise.spec.ts`) so editing one copy alone turns a suite red. It backs that fallback resolution — matched on the NORMALISED key, because a raw comparison misses on a space (`500 mg`), a case, a dropped `n/a` or a form qualifier. A mismatch yields no generic, never another medicine's.

## Learned phrases: what this doctor has written before (2026-09-21)

_From `client/CLAUDE.md`._

Two surfaces offer back the free text a doctor has written before, both fed by
`GET /api/doctor-phrases` through `hooks/useDoctorPhrases` (300 ms debounce,
out-of-order guard, **failure resolves to `[]`** — on a clinical screen "no
saved phrases" and "the lookup failed" must not look alike).

- **Advice** — `ExpandableField`'s opt-in `learnedSource` prop, passed only by
  `RightColumn` for the Advice field. The chip list is ordered **learned (★, with
  the number of PATIENTS it was written for) → recents (↺) → the static list**,
  de-duplicated by text. **Since 31/10/2026** (physician's sheet): no count on
  the chip (it still orders the server's list), recents are marked with the
  `plus` icon instead of ↺, Advice has NO static list (`adviceSuggestions` is
  gone), and the doctor's own lines are never cut — only a static list is held
  to `STATIC_SHOWN` (10) places; the chips scroll (`suggestion-list`). Server
  bound for `advice` is 1000 (`rxNote` stays 8); `RECENT_LIMIT` is 1000 (was 12,
  which "reset" Note/Plan/Provisional diagnosis/Associated illness). Static lists
  that remain (`data/suggestions.ts`): Chief complaints, History, Provisional
  diagnosis, Associated illness, Final diagnosis (OPD + IPD), the others' keys,
  and the IPD's advised tests. Position in `sugs` carries the ranking, so the array
  order and the score bonus must stay in step.
- **℞ note line** — a "Your usual notes" section in the `MedicinePad` dropdown,
  shown only on a row that is NOT a medicine. Gated by the same `showHabits`
  opt-in as the medicine habits, so the IPD order sheet, the Drug-history pad and
  the template editor are untouched.

**Why recents are KEPT alongside** (`useFieldRecents`, `User.fieldRecents`): a
learned phrase can only come from a prescription already saved and printed, so
recents are what covers a line typed earlier today. They are two sources with
two jobs, not a duplication to tidy away.

Nothing is ever auto-filled — every suggestion needs a click — and the client
never writes to the phrase table; only a completed prescription teaches it.
Pinned in `ExpandableField.test.tsx`.

## UI conventions

_From `client/CLAUDE.md`._

- **⚕️ ••• Special advice per medicine (physician's design, 2026-09-24), OPD pad only.** `MedicinePad`'s opt-in `drugAdvice` prop (passed by `RightColumn` only) puts a ••• button left of the serial on every NAMED medicine line — never a taper, a note or the typing line; other rows keep a same-width spacer so the serials stay in one column. Hover: "Add special advice to this drug"; the dots turn green when saved advice applies. The button stops `pointerdown` so it never starts a line drag. Clicking opens `DrugAdviceBox`: Instruction = the line as written, radios **Only for this medicine** / **For all drugs of this group (generic)** (disabled with the reason when the line has no generic), one tick per line (ticked by default), **+ Add Advice**, and **Edit** / **Save** in the footer. Save is NOT optimistic (stays open with the text on failure); closing with unsaved edits asks to Discard first. Assistants need `rx.advice` to edit (server enforces it too). The advice inputs carry `BANGLA_ATTR` — they write Advice lines, which is a BAN field.
  - **⚕️ ••• beside each FINAL DIAGNOSIS (physician's sheet, 15/10/2026, item 4: "Final Diagnosis er prottektar pashe advice add kora jabe osudh er moto kore … pregnant diagnosis a add korar sathe sathe [auto add hobe] … osudh er advice and final diagnosis er advice prescription er advice a por por thakbe").** `ExpandableField`'s opt-in `lineAdvice` (passed by `LeftColumn` for Final diagnosis only) puts the same ••• left of each line — green once advice is saved, hidden while ✎ Edit is open — and opens `DrugAdviceBox` with `diagnosis`: Instruction = the diagnosis as written, no medicine/group radios, "No advice for this diagnosis yet.", the same ticks, + Add Advice, Edit, Save. It is saved as scope `diagnosis`, keyed by the diagnosis folded for **case and spacing only** (`diagnosisKey`, mirrored on the server): `pregnant` gets the advice saved for `Pregnant`, but `Pregnant 32 weeks` and `Not pregnant` are other diagnoses and get none — nothing is matched on part of a diagnosis. **Every word is the doctor's own; the app ships no diagnosis advice.** The same mirror (`adviceLinesFor`, effect in `MuqsitContext`) adds the ticked lines to Advice the moment the diagnosis is written and withdraws them when it leaves, with every rule above (only its own lines, a hand-deleted line stays deleted and is unticked for THAT diagnosis — `diagnosisOwner` keeps a diagnosis's ticks apart from every medicine's). **Order:** the medicines' advice stands before the diagnoses' — the mirror orders ITS OWN lines that way among the places they hold, so a diagnosis written before its medicine still prints after the medicine's advice, and a line the doctor typed never moves; a line both a medicine and a diagnosis ask for is written once, with the medicines'. Printed as ordinary Advice (`prescriptionDoc` is unchanged). Pinned in `rxDrugAdvice.test.ts`, `ExpandableField.lineAdvice.test.tsx`, `DrugAdviceBox.diagnosis.test.tsx`, `LeftColumn.diagnosisAdvice.test.tsx` and `MuqsitContext.test.tsx`.
  - **Other advice into this box, and in-place edit (physician's sheet, 31/10/2026: "amr onno disease ba osudh er lekha advice add kora edit korte parbo").** Under the lines, "From your other advice" (`data-testid="other-advice"`) offers every line saved for ANY medicine, group or diagnosis — from `savedDrugAdvice`, which the editor already loads, no new request — once each (spacing/capitals set aside) and minus what the box holds. A press copies it into THIS box's list in Edit; Save stores only this box; the other entry is never written. A line's words are a button that opens Edit. Neither is offered without `rx.advice`. Pinned in `DrugAdviceBox.other.test.tsx`. Not verified in a browser.
  - **The Advice-section mirror (`lib/rxDrugAdvice.ts`, effect in `MuqsitContext`)** follows the Drug-history mirror's rules: it only withdraws lines it added (`rxAdviceOwned`), never a hand-typed Advice line even one that reads the same (such a line is not claimed); a mirrored line the doctor deletes from Advice by hand is unticked for the visit rather than put back; it is idempotent. **It does nothing until `useDrugAdvice` has LOADED** — an unknown list treated as empty would withdraw every mirrored line on reload. The per-visit ticks (`rxAdviceOff`, keyed `normaliseDrugKey(drug) + line`) and `rxAdviceOwned` ride the draft snapshot, `incompleteRx` and the device mirror, and `resetEditor` clears both. Matching keys mirror `server/src/drug-advice/keys.ts`; if they drift, advice is simply not offered, never offered on another drug. **Known limits:** a line loaded from an old prescription has no `generic`, so only medicine-scope advice applies to it; editing a saved line's text re-adds it ticked. Pinned in `rxDrugAdvice.test.ts` and `MedicinePad.advice.test.tsx`.
- **⚕️ "Add Bulk Medicine" — the + beside the ℞ mark (physician's request, 2026-10-13), OPD pad only.** The doctor's OWN medicines, ticked and appended to the pad in one press. `BulkMedicineButton.tsx` is the +, the line beside it that says what the last Add did, and whose pad the box belongs to; `BulkMedicineBox.tsx` asks for the list and decides which of three faces the box shows; `BulkMedicineModal.tsx` is the box and holds only the ticks, the order and the search; `lib/bulkMedicines.ts` is every rule about the medicines. **One row per medicine** (physician's decision): the instruction "Your usual" would offer first, chosen by the server in the dropdown's own order, with its `↳` taper lines, its generic, `N patients` and when it was last written. Two orders, *Popular* (most DISTINCT patients given the instruction shown; the order it opens in) and *Alphabetical* (by the BRAND — a label starts with its dosage form). Not on the IPD sheet, the Drug-history pad or the template editor (ward doses are not outpatient habits, design D5). The rules that are safety:
  - **It invents nothing.** A cell left blank when prescribing is added blank. A first line saved blank reads "No dose recorded" and is added so.
  - **A taper goes with its medicine**, as continuation lines under it; a medicine whose taper cannot be read is left out WHOLE and counted in a notice (the server's count and this module's, added). The response is read as `unknown` (`readBulkList`): it reaches the editor, where an uncaught error unmounts the screen.
  - **The generic travels with the medicine**, on the same response: it is what a prescribing warning is written against, so a row WITHOUT one is a medicine the warnings will not see. It was shown under the name; since 17/10/2026 (the chip is the name only, below) it is the first line of the chip's tooltip, and absent there when the medicine has none. The server does not offer the list at all when it cannot ask the catalogue (`server/CLAUDE.md`). `rxHabitAlerts.test.ts` holds the Barcavir/Entecavir bridge through the pad's own rows.
  - **⚕️ A LINE is not written twice — a MEDICINE can be, and the box says so.** The same medicine with the same dose, timing and duration is skipped, tapering lines and all (the rule of "Move to Rx", by the physician's decision); the same medicine at ANOTHER dose is another line and is added. So: a row whose medicine is already on the pad carries an **On ℞** mark before it is ticked; and the line beside the + NAMES it — `3 added · “Tablet. Napa 500 mg” is now on ℞ more than once` (two names at most, a count beyond that; `it is now…` when one was added: the pad has scrolled to the new lines, and the older one may be above its edge) — or `1 already on ℞`, or — because only the first line is compared — `1 already on ℞ — its tapering lines differ there`, never "the same instruction" of an instruction that is not on the prescription. The medicine is compared as the app compares medicines elsewhere (`sameMedicine`: capitals, spacing, `Tab` for `Tablet.`, and a label typed WITHOUT its form as any form of that name and strength — `lib/medicineKey.ts` lists what it sets aside and what it does not), and the dose, food and duration, of the first line and of each tapering line, with their capitals and spaces set aside (`instructionKey`) — the physician's decisions of 2026-10-14, the same as Move to Rx. A NOTE on the pad that reads as the medicine names it: the row is marked On ℞, a medicine with nothing written and no tapering lines is skipped against it, and one with an instruction — or with its doses in its tapering lines — is added and counted as now on ℞ more than once. When nothing could be added the box stays open and says why, in an amber line above the buttons.
  - **Only what is ticked is added, in the order on screen**, after the pad's last line — and the pad scrolls to it (`RightColumn`): past ten lines the added medicines were on the prescription and out of sight. A tick survives a search that hides its row, and the footer counts it (`3 selected · 2 not shown by this search`).
  - **⚕️ The box is ONE patient's.** `BulkMedicineButton` closes it when `currentPatientId` changes under it (device mirroring, a patient still loading) — in the same render, by resetting state while rendering — and takes down what the last Add said; it does not come back with the first patient. The same for `rx.medicines` taken away. (It tells patients apart by id, which is safe only because the editor cannot be written in before a patient with an id is chosen — `PatientGate`.)
  - **⚕️ "No medicines yet" is drawn for a list that is HERE and empty, and for nothing else** (`bulkBoxState`, three states: asking / failed / list). A request on its way is "asking" whatever is still held — a list replaced by a newer one on screen re-sorts under the doctor's finger and the tick lands on the medicine that moved in; so every opening asks again and waits. A failure is "failed" even with an older list held. And three things that were once drawn as an empty history each end as "could not be loaded": offline (React Query does not ask at all while the browser says it is offline — hence `networkMode: "always"`), an answer that is not the list (`readBulkList` returns null), and a request held back. One quiet retry first (`askAgain` in `useBulkMedicines`): for a dropped request, a 5xx, an answer that could not be read, and a 401 or a 404, which may well be different a moment later (a session being renewed, an API one deploy behind the page). Not for a 403 — the one refusal the server words for a person, and the one answer shown as written. Nothing else it says is shown: "Unauthorized" and "Cannot GET /api/…" are the framework's words.
  - **The keyboard.** With a mouse or trackpad the search has the focus on opening (not on a touch screen, where that raises the keyboard over the list). The list is ONE Tab stop: arrows, Page keys, Home and End MOVE along the rows and Space ticks — a stop on every row put two hundred presses of Tab between the search and Add. **⚕️ The row a key lands on is asked into view on each of the next four frames** (`SETTLE_FRAMES`): rows are drawn a frame after they come near, taller than the space kept for them, and with the page not held still through that (Chromium with scroll anchoring switched off; Safari is documented as having none and was not run) End left the last row below the edge, with the focus on it and Space ready to tick it unseen. The list says how it is moved along (a group's name for a screen reader, a line under the title for someone with a keyboard). **⚕️ The rows are drawn a moment behind what is typed** (`seek`), so that a long list does not hold up typing — **and Tab brings them up to it before it lands** (`catchUp`): `napa`, Tab, Space had ticked the first row of the list as it stood before the search. Escape in a search with something typed clears the search only. **With medicines ticked, only Add, Cancel and the × leave the box:** Escape and a press on the veil say how to close instead (a press that began inside the box is never one on the veil). The line that says it stands in a region that is on the page from the start — one that arrives with its words is often not read out. A key HELD down does not press the + (Add hands the focus back to it).
  - **A long list (timed 2026-10-14).** The server cuts the list at 2,000 medicines and every one is a row in the page: the list is not windowed, and a journey holds that the keyboard reaches a row that was never drawn. Two things keep that quick: a row out of sight is not laid out or painted until it is scrolled to (`ROW_OUT_OF_SIGHT`: `content-visibility: auto`, which a browser that does not know it ignores — every row is drawn, as before; the 48px beside it is what a row HOLDS, and the padding is added to it), and the On ℞ marks are worked out when the list or the pad changes, not at every tick. In Chromium on a PRODUCTION build, with made-up lists against a made-up catalogue of 35,000: 300 medicines open in about 0.3 s and 2,000 in about 1.2 s (about half of each is the request), changing the order takes about 0.1 s and 0.2–0.3 s, and a tick 0.02–0.06 s. Without the first of the two, drawing 2,000 rows took twice as long and re-ordering them four times as long. **Not timed:** the production catalogue, a real doctor's list, a phone, Firefox or Safari. `next dev` is not the measure (root `CLAUDE.md`): without the first of the two the box took 4.6 s to open there, and 1.9 s on a production build.
  - **An assistant needs `rx.medicines`**, the pad's own key: without it the + is greyed (`aria-disabled`, still a Tab stop) with the reason in its name and tooltip. The server lets any assistant of the practice READ the list, as it does "Your usual".
  - **Its lines carry no `fromHabit`**: that flag writes `N of M ℞ lines inserted from "Your usual"` to the activity feed on save. The box teaches `DoctorRxHabit` nothing and logs nothing.
  - **⚕️ Chips, and a ▼ of the last instructions (physician's sheet, 15/10/2026, item 2: "Red area ok ase nicher format change hobe … Computer er screen er moto stack kora thakbe … down arrow dia last use 3ta option select kora jabe").** The top of the box — title, its line, Popular / Alphabetical, the search — is as it was. Below it each medicine is a CHIP (`[data-chip]`), side by side in a grid (`repeat(auto-fill, minmax(min(250px, 100%), 1fr))`; the box is `min(860px, 100%)` wide: three to a line on a computer, one on a phone). **Since 17/10/2026 a chip shows the medicine's NAME only** ("just keep the medicine name, no need to add extra things like dose, duration"): the brand in bold, the On ℞ mark when it applies, and a **▼**. The generic, the instruction the chip stands on, its ↳ tapers and patients · last date are the chip's tooltip (`title`, generic first) and are in the ▼ list. The **▼** (text glyph, out of the Tab order) that opens the medicine's choices in the chip (`choicesOf`): the doctor's **last three instructions for it, newest first** (`recent` from `GET /rx-habits/all`, this doctor's, never hidden), with the usual among them, marked `usual`, first when it is not one of the three. **The chip starts on the usual — nothing changes for a doctor who never presses ▼.** What a tick adds is no longer written on the chip: it is the option marked chosen when the ▼ is opened, and the tooltip. Choosing an option ticks the medicine, the tooltip and the ▼ follow it, and Add adds exactly that instruction, taper and all (`withChoice`; nothing mixed from two). Keyboard: the list is still one Tab stop; ← → move like ↑ ↓; **Enter** (or Alt + ↓) on a chip opens its list with the focus on the option it stands on, ↑ ↓ move there, Enter / Space choose, and **Escape closes the list, not the box** (it is `preventDefault`ed, which `useDialog` reads). An entry of `recent` that cannot be read whole is left out of the choices, never the medicine; an older server that sends no `recent` leaves the ▼ with the usual alone. `ROW_OUT_OF_SIGHT` stays on the chips, at **`auto 33px`** since 17/10/2026 — a name-only chip on one line, less its border. (It was `auto 80px`, for a chip with its doses; with the name-only chip an undrawn chip WAS given that stand-in and stood 52.7 screen px taller than drawn — the browser journey caught it. On 15/10 it had been measured at its own height undrawn; that no longer holds, and is not relied on.) A name that wraps is taller when drawn, as a row with tapers once was; the keyboard's settling frames cover that. The 2,000-row timing above was not re-taken for chips. `e2e/tests/bulk-medicine.spec.ts` holds that an undrawn chip takes the space it takes drawn (nothing moves), over a list of 134. Pinned in `bulkMedicines.test.ts` and `BulkMedicineModal.test.tsx` ("the chips and their ▼").
  - **Tests:** the rules in `bulkMedicines.test.ts`; the box in `BulkMedicineModal.test.tsx` (it runs `itKeepsTheKeyboard`); the request in `BulkMedicineBox.test.tsx`; the patient rule in `BulkMedicineButton.test.tsx`; five journeys in `e2e/tests/bulk-medicine.spec.ts` — a real keyboard, offline, a phone, a long pad (and, in that one, End and the Page keys along a list of fifty-four, most of it never drawn and most of it taller than the space kept for it, with scroll anchoring switched off). **Known limits** are in `FUNCTIONAL-AUDIT.md` for the physician: a medicine only ever saved with no instruction is not listed; *Popular* counts the patients of the instruction shown; one dose per medicine in the box; a medicine already on the pad is never changed from the box.
- **"Your selected medicine names are:" in Add Bulk Medicine (physician's sheet, 18/10/2026, item 6).** Between the search and the chips, a box names every ticked medicine in the order Add puts them on the ℞ (`chosen`), also one a search has hidden. It is ONE height (86px, scrolling inside) whatever is ticked — a box that grew pushed the chips down under the finger ticking them — and its × (untick) is out of the Tab order and keeps the focus where it was (review, 18/10/2026). `BulkMedicineModal.selected.test.tsx`.

## ⚠️ Rule 2c — `DoctorRxHabit` is DERIVED, and its write path is load-bearing

_From `server/CLAUDE.md`._

`rx-habits` (2026-08-17) learns a doctor's repeated prescribing instructions and
offers them back in the ℞ pad. The domain rules are in the root `CLAUDE.md`;
these are the ones that live in this app's code and are easy to break.

- **`patientCount` is never `increment: 1`.** It counts DISTINCT PATIENTS, and
  the answer comes from the record: `priorBlockKeys()` asks whether this patient
  already contributed this block on an EARLIER prescription. One query per save,
  then a set lookup per block. A prescription-count would make one returning
  patient look like routine practice, which defeats the only safety signal the
  feature has.
- **`contLines` is a Json column, so it is unknown at every boundary.**
  `sanitiseContLines` returns `null` for anything it cannot read and the block is
  dropped **whole** — never partially. Half a tapering schedule delivered as if
  it were the whole instruction is worse than no suggestion. The client sanitises
  again (`rxHabitRows.ts`); the two layers fail for different reasons.
- **The lookup matches `searchKey` only**, through the SAME normalisation the
  stored key went through, and needs the `text_pattern_ops` index from
  `manual-rx-habits.sql`. The plain btree does NOT serve `LIKE 'prefix%'` here:
  this database's collation is `C.UTF-8`, and Postgres only treats a collation as
  pattern-safe when it is exactly `C`/`POSIX`. Verified with EXPLAIN on
  2026-08-17 — an earlier draft of the design assumed otherwise. LIKE
  metacharacters in the doctor's typing are escaped (`likePrefix`); a bare `%`
  would otherwise match every medicine they have ever prescribed.
- **`list()` attaches each medicine's `generic` from the raw `medicines` table**,
  matched on the same normalised key that grouped the habits. This is a SAFETY
  field, not a label: prescribing-alert rules are written against generics
  (`entecavir`) while the ℞ line carries the brand (`Tablet. Barcavir 0.5 mg`).
  Resolving it on the client from a separate medicines request — the original
  design — made it depend on a race, and a doctor clicking the suggestion before
  that request landed would lose the contraindication warning entirely. The
  catalogue is asked through `catalogueRows` (below), wrapped in try/catch: no
  generic just means the line behaves like a hand-typed brand.
- **There is a second read path, `listAll()` (`GET /rx-habits/all`, 2026-10-13),
  and it THROWS.** It feeds the "Add Bulk Medicine" box: one row per medicine —
  the row the typing dropdown would offer first (pinned, then most patients, then
  most recent), with hidden rows left out BEFORE that choice, so a hidden dose
  never hides the next one. `list()` is silent on failure because it sits under a
  working medicine search; this is a list the doctor opened on purpose, and
  "could not be loaded" must not look like "you have prescribed nothing". It
  writes nothing and logs nothing to `activity`; scope is
  `@WorkstationDoctorId()` like every other route here
  (`server/test/rx-habits-all.int-spec.ts` holds that against the real
  database). A medicine whose chosen row has unreadable `contLines` is left out
  and COUNTED (`unreadable`), and the box says the number — the dropdown would
  offer that medicine's next instruction, so in that one case the two surfaces
  differ.
  **Since 15/10/2026 each medicine also carries `recent`** — the doctor's last
  three instructions for it, newest first (physician's sheet, item 2: the ▼ on
  a medicine in the box). A second query over the SAME rows (this doctor,
  `hidden = false`), `ROW_NUMBER() … ORDER BY "lastUsedAt" DESC, "id"`, `rr <= 3`
  (`attachRecent`); an instruction whose `contLines` cannot be read is left out
  of the choices and the medicine stays. Timed on `muqsit_load_test` with made-up
  rows (one doctor with 2,000 medicines × 4 instructions among 68,000): median
  ~10 ms, the same as the list's own query; the production table was not timed.
  Held against a real Postgres in `rx-habits-all.int-spec.ts`.
- **⚕️ `attachGenerics` THROWS on a failed catalogue lookup: `list()` catches
  it, `listAll()` does not** (first review, 2026-10-13, before release). The
  first version wrapped the lookup in the dropdown's try/catch and returned the
  list without generics. For `list()` that is right: the ℞ pad has a second,
  PARTIAL source — the medicine results loaded for what was typed
  (`resolveGeneric` on the client; at most the ten rows of that search). The
  box has no second source at all — a medicine added from it without the
  generic the catalogue holds for it is a contraindication warning that does not
  fire, on several lines at once, with nothing on screen to say so. A rule that
  fails silently is safe only together with whatever catches the failure;
  before giving it to a second caller, check that caller has the catch too.
- **⚕️ The catalogue is asked ONCE, by an equality on the brand's first word**
  (`catalogueRows`, 2026-10-14) — never by a pattern per brand. It was
  `"brandName" ILIKE ANY('{napa%,…}')`: fine for the dropdown's four medicines,
  ruinous for a doctor's whole list, because every pattern is tried against
  every row of the catalogue. Nothing had shown it: the test catalogue is six
  rows. Measured on a made-up catalogue of 35,000 medicines, the box took 5 to
  7 s to open for a doctor with 200 medicines and over a minute for 2,000; as
  one hash join (`lower(first word of "brandName") IN (SELECT unnest($1))`) it
  is 0.08 s and 0.32 s for the whole service call (0.05 s and 0.13 s of it the
  query), and the dropdown's own lookup is cheaper than it was.
  The question is also a better one. A prefix needed a row cap, and a cap that
  bites drops whichever brands the database reached last (the dropdown's old
  `LIMIT 500` could, for one broad prefix); a brand whose first word is one
  letter could not be asked for at all. An equality needs neither rule, and
  its answer is bounded by the catalogue. The first word is taken as
  `normaliseDrugKey` takes it — lower case, a leading space ignored, a tab or
  a no-break space counted as the space a spreadsheet meant — and
  `server/test/rx-habits-all.int-spec.ts` holds each of those against a real
  Postgres, for the box and for the dropdown. **Do not turn it back into a
  `LIKE`**, and do not use `= ANY($1)` for the list: with a bound array that is
  a linear search per row (2.5 s for 2,000 brands, measured). The rows come in
  a stated order, so the same medicine gets the same generic on every request.
  **Where the catalogue lists one medicine (form, brand, strength) under two
  different generics, the first is used, as it always was — the first in the
  stated order now (brand, form, strength, then generic), where it was
  whichever row the database returned first — and the log names the medicine
  and the generics, once per process.** Attaching neither would be the
  stricter rule; it changes which warnings fire in the dropdown as well, and
  needs a look at the real catalogue before it is decided
  (`FUNCTIONAL-AUDIT.md`).
- **The boot check never throws.** `onModuleInit` runs one `SELECT 1` and logs a
  single ERROR naming `manual-rx-habits.sql` if the table is unreadable. Because
  the doctor is shown silence on failure by design, the log is the ONLY place a
  dead feature announces itself — and this repo already has two committed-but-
  unapplied manual migrations to prove that matters.
- **`RxHabitsModule` imports `WorkstationsModule`.** `WorkstationGuard` injects
  `WorkstationsService`, and Nest resolves that at BOOT: `npx tsc --noEmit` is
  green without the import and the API then crash-loops on start. Typecheck is
  not enough for a new guarded module — start the server.
`doctor-phrases` (2026-09-21) is the FREE-TEXT sibling of `rx-habits`: it learns
the ADVICE lines and the free-typed ℞ **note** lines a doctor writes, and offers
them back as they type. It is built to the same five rules and shares the same
seam — `PrescriptionsService.create` calls `phrases.recordFrom(...)` beside
`habits.recordFrom(...)`, in the same try/catch that can never fail the save.

- **`manual-doctor-phrase-habit.sql` must be applied** before it does anything.
  Until then `DoctorPhrasesService.onModuleInit` logs one ERROR naming that file
  and the rebuild script, and both fields keep working, silently. That boot
  check is the only place a missing table can be announced: on the clinical
  screen an empty list and a dead feature look identical.
- **`patientCount` is DISTINCT PATIENTS.** `recordFrom` asks the record which
  patients already contributed each signature on an EARLIER prescription
  (`priorSignatures`, excluding the one being learned from) and increments only
  for a genuinely new one. Never `increment: 1` unconditionally.
- **Typography-only normalisation** (`doctor-phrases/normalise.ts`): case,
  whitespace, one trailing full stop. It must never drop a word, number, unit or
  parenthesised qualifier — `Insulin as before` and `Inj. Insulin as before` are
  two instructions. Pinned in `normalise.spec.ts`, including everything it must
  NOT fold.
- **How many a lookup returns depends on the surface (31/10/2026):** `rxNote`
  at most 8 (a dropdown under the caret); `advice` at most 1000, because the
  physician asked for every Advice line he ever wrote to stay offered (the
  client's Advice popup scrolls). `LIST_LIMIT` in the service; spec pins both.
- **`hidden` is never un-set by a later save.** A suppressed line stays
  suppressed even when the doctor writes it again by hand; un-hiding is the
  PATCH route.
- **Repair, never hand-edit:** `node scripts/rebuild-doctor-phrases.js
  [--dry-run]` recomputes the table from `Prescription.advice` and
  `PrescriptionItem where isNote`, in one transaction, re-applying `hidden`
  **by content** for the same reason the medicine rebuild does.

- **Repair, never hand-edit:** `node scripts/rebuild-rx-habits.js [--dry-run]`
  recomputes the table from `Prescription`/`PrescriptionItem`, one transaction
  per doctor, and re-applies `pinned`/`hidden` **by content**. Do not "simplify"
  that to a `signature` join — a signature is the OUTPUT of the normalisation
  algorithm, so the day a rule is edited every signature changes, every flag
  orphans, and every deliberately suppressed dose comes back silently. The
  script loads `normalise.ts` from `dist/` (or via ts-node) rather than
  reimplementing it, and must stay `.js` — see the `rootDir` trap below.
- **⚕️ A Bangla dose / food / duration is the same instruction as its English
  (`ALGO_VERSION` 2, 2026-10-15).** BAN writes the ℞ columns in Bangla
  (physician's decision, 2026-10-14), so `১+০+১ · খাবারের আগে · ৭ দিন` and
  `1+0+1 · Before meal · 7 days` reached the habit table as two rows and split
  one dose's distinct-patient count. `signatureOf` now reads each cell through
  `rx-habits/rxLanguage.ts#cellInEnglish` first — the physician's table, a
  COPY of `client/src/lib/rxLanguage.ts#rxCellIn(…, "en")`, pinned against it by
  one literal table in `normalise.spec.ts` ⇄ `rxLanguage.test.ts`. Three things
  about it are safety, not style:
  - **A cell with no Bangla in it is returned untouched,** so no English
    habit's signature moved; only a habit saved with Bangla changes key.
  - **Nothing outside the table is read:** `খাবারের পর`, `২.৫ মিলি` stay as typed
    and are their own instruction; a decimal point stays a point (`০.৫` is
    `0.5`, never `5`); a 3→1 taper is still not a 1→3 taper.
  - **The rebuild keeps a flag set on ANY wording that folded in,** `hidden`
    winning over a wording that was not hidden. Before this, one signature was
    one wording per stored row and the newest wording's flag was enough; now
    two stored rows (Bangla, English) become one, and taking only the newest
    wording's flags would bring back a dose the doctor had hidden.
  `server/test/rx-habits-bangla.int-spec.ts` runs it for real: both languages
  through `POST /prescriptions` into one row, the same patient in the other
  language not counted twice, and the repair script against rows learned under
  version 1. **After the deploy, run the rebuild once** (`--dry-run` first) —
  until then rows already learned in Bangla stay as separate rows, and a new
  Bangla prescription lands on the English row and not on its hidden Bangla twin.

## `drug-advice` — the doctor's own standing advice (2026-09-24)

_From `server/CLAUDE.md`._

`DoctorDrugAdvice` (`manual-drug-advice.sql`, applied 2026-09-24) holds what a
doctor writes in the ℞ pad's ••• box. Unlike the two habit tables it is NOT
derived — every line is typed by the doctor, so there is no rebuild script and
nothing learns into it. `PUT /drug-advice` replaces a key's lines (empty =
cleared). Scope is `@WorkstationDoctorId()`; an assistant needs `rx.advice` to
write. Keys (`drug-advice/keys.ts`): scope `medicine` reuses
`rx-habits/normalise.ts#normaliseDrugKey` (strength included), scope `generic`
folds case and spacing only, and scope `diagnosis` (a final diagnosis, the •••
beside its line — physician's sheet 15/10/2026) folds case and spacing only too.
`scope` is a plain text column, so the third scope needed no SQL. The client
mirrors all three in `lib/rxDrugAdvice.ts`.
Boot check logs one ERROR naming the SQL file if the table is unreadable.
