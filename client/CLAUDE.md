# client/CLAUDE.md — Doctor app (Next.js 14)

The doctor-facing SPA. App Router pages are thin shells; almost everything renders through `src/components/Muqsit.tsx` → `TabRouter.tsx` (tab = URL segment) with state in **one large context store**: `src/context/MuqsitContext.tsx` (`MuqsitStore = ReturnType<typeof useMuqsitStore>` — add to the return object and the type follows). Auth lives in `src/context/AuthContext.tsx`; server state in React Query hooks (`src/hooks/`); all HTTP through `src/lib/api.ts` (`apiFetch`: credentials, X-Workstation header, silent 401 refresh).

**Env trap:** `NEXT_PUBLIC_API_URL` must be set in both `.env.local` (dev, gitignored) and **`.env.production` (committed — the deployed build uses it)**. A missing prod value silently points the live site at `localhost:4000`.

## ⚕️ Clinical-accuracy rules specific to the client

- **Calculators (`src/lib/calculators/`, ~77 of them, wired via `calculator-registry.ts`):** each implements a published clinical score/formula. Never alter a formula, cutoff, unit, or interpretation without the published source; keep severity labels (`success/warning/danger`) consistent with the source. New calculators register in the registry and appear in Investigation "Special Scores".
- **Investigation catalog (`src/data/investigations.ts`):** the master test list (`INV_CATS`: `{cat, tests:[{name, fields}]}`, some via the `txt([...])` name-only helper). Test names must stay **unique across categories** (duplicates were purged deliberately); field units are clinical facts — verify before editing.
- **Never round, reformat, or "normalize" an entered clinical value.** Display exactly what the doctor typed.
- **Medicine search hits the server** (`/medicines/search`, raw `medicines` table). `src/data/drugs.ts` is only an 18-item static fallback for the legacy drug picker / monthly-cost demo — do not treat it as the drug database.
- **Prescribing alerts (`src/data/rxAlerts.ts` rules, `src/lib/rxAlerts.ts` matcher, `RxAlerts.tsx` → `RxAlertBanner.tsx` UI):** shown on **both** prescribing surfaces — the OPD editor (top of `ReportsSection`, desktop and mobile alike) and the IPD order sheet (above the ℞ pad in `IpdDetailView`). Keep them in step: a doctor who learns to trust the alert on one screen must not silently lose it on the other. Three structural rules that are not style preferences:
  - **Render `<RxAlerts input={…}/>`, never `RxAlertBanner` directly.** `RxAlerts` wraps the banner in an error boundary. The banner lives *inside* the editor and the order sheet, and React unmounts the whole tree on an uncaught render error — one bad value would take out the entire screen a doctor prescribes through, not just the advisory.
  - **Callers assemble the input only; the matching runs inside the banner.** Doing it in the caller's `useMemo` puts the computation outside the boundary, where no wrapper can catch it.
  - **The check fails loud, never silent.** `checkRxAlerts` is total — it normalises unknown input, skips what it cannot read, and returns an `unreadable` count that the banner turns into a visible "Prescribing check was incomplete" notice; the boundary's fallback says "not checked", not "nothing found". A doctor reads a blank advisory as *no contraindication*, so an empty render must only ever mean the rules actually ran and found nothing.

  The data file is a transcription of the physician's rule sheets and nothing else — adding a rule, correcting a spelling ("atleast" is theirs), or filling a truncated row from memory is a PRIME-DIRECTIVE violation, not a tidy-up. `src/lib/rxAlerts.test.ts` pins each message string, so a failure there is a clinical regression: check the source sheet before touching the expectation. Matching rules worth knowing:
  - Terms match on **word boundaries**, case-insensitively, so `pregnant` does not fire on `prepregnant`.
  - A condition immediately preceded by a negator (`no`, `not`, `non`, `denies`, `without`, …) is skipped. That guard is deliberately literal — anything more ambiguous still fires, and the doctor judges from the record.
  - **The banner shows the advice only.** The `Because: <drug line> + <sidebar entry>` line under it was removed on 2026-08-16 at the physician's request — the advice already names the drug and the condition, so the echo was noise on a screen read every visit. `RxAlert.evidence` is still computed by the matcher and simply has no reader; `RxAlertBanner.test.ts` pins the absence, so restoring it is a product decision, not a bug fix. A side effect worth knowing: nothing a doctor types is rendered in the banner any more, so typed markup cannot reach it at all.
  - Only the fields in `CONDITION_FIELDS` are scanned for conditions, compared **case-insensitively** because the two screens name them differently (OPD `Chief complaints`; IPD `Sign` + `Symptoms`, and `Chief Complaints` on admissions written before that rename). Drug history, investigation findings, procedure and follow-up vitals are excluded on purpose (a drug named *Pregnacare* is not a pregnancy). It is an allowlist so a newly added field cannot silently start firing clinical alerts — adding one is a deliberate edit.
  - **drug-drug rules see the ℞ pad plus CURRENT drug history**, where "current" is the same derivation `DrugHistoryField` uses for its Current medications tab (entry dated on `ptDate`). Distant-past entries are excluded on purpose — a timing rule fired for a drug stopped two years ago is alert fatigue, and a doctor who stops reading alerts is the failure this feature exists to prevent. **At least one of the two drugs must be on today's ℞:** if both are already current, nothing changed this visit and the alert would repeat on every open. Do not "simplify" either half of that condition away.
  - `Sofosbuvir+Velpatasvir` matches on **velpatasvir**, not bare sofosbuvir — sofosbuvir also ships with ledipasvir and daclatasvir, and the advice text names the velpatasvir combination.
  - **Known gap:** a brand free-typed by hand (not picked from the medicines table) carries no generic, so a rule written against the generic cannot see it. Picked medicines are covered — see `RxItem.generic` below.
- **`RxItem.generic`** is set only when the line was chosen from the medicines dropdown; `drug` holds the brand label (`"Tablet. Entaliv 0.5mg"`). It is **cleared as soon as the doctor edits the drug text by hand** (`MedicinePad.tsx`) — a stale generic pointing at a different medicine would let a safety rule fire on the wrong drug. Additive: prescriptions and drafts saved before it simply lack the field.
- **OCR (`src/lib/ocr.ts`, tesseract.js)** verifies the typed NID number against the uploaded NID photo during signup. It is assistive only — never let OCR overwrite what the user typed.

## Storage string protocols (the data model hiding in strings)

These formats are persisted in drafts, prescriptions and patient JSON columns — **changing them silently orphans existing data**. Extend parsers, don't break them:

- **Investigation finding:** `dd/mm/yyyy:TestName:value` (parse via `lib/investigationSummary.ts`). Report-pool images: `dd/mm/yyyy:Report N:[image attached]`; test-tagged images use key `dd/mm/yyyy:TestName` in `invImages` + a `…:[image attached]` entry. `[image attached]` / `Report N` rows are filtered out of print and summaries.
  - **A test's report image is only ever attached by an explicit act of the doctor** — dragging the open report onto that test's "Add report image", or picking a file there (`tagTestImage`/`untagImageKey` in `InvestigationPopup.tsx`). Until 2026-08-16 a `resolveTestImage()` fallback stamped *whatever report was open in the left viewer* onto every result the doctor typed (`addInvResult`, `addInvNormal`, and the auto-save on date-change/close), so a finding's 📎 opened a report it was never taken from — one report silently became the evidence for every line on the visit. Do not reintroduce a "helpful" default: on a clinical record an attachment has to mean the doctor attached it, and a wrong one is worse than none. Each attached image is a thumbnail + ✕ on the test card so the doctor can see what landed and take any one back off. **Findings saved before that date keep their auto-stamped images** — nothing was rewritten; the ✕ is the doctor-driven cleanup.
  - **A test holds MANY images (2026-08-16), keyed `dd/mm/yyyy:TestName`, `…#2`, `…#3`** — helpers in `lib/investigationImages.ts` (`testImageKeys`, `nextImageKey`, `hasImageUrl`, `hasValueLine`), unit-tested in `investigationImages.test.ts`. The first image keeps the historic unsuffixed key, so every draft/prescription/admission written before this reads back unchanged and no migration exists. No name in `data/investigations.ts` contains `#`. Three rules the code depends on: **keys are never renumbered** (removing the middle of base/#2/#3 leaves a gap that `nextImageKey` reuses — renumbering would rewrite keys inside saved prescriptions for a cosmetic tidy-up); **the same URL twice on one test+date is a no-op** (but the same report dropped on a *different* test tags it there too — one CT legitimately backs several findings, and removing it from one test must not remove it from the other); and **deleting a result drops that test's images only when it was the last value line for that test+date** (`deleteResult`), because with two lines for one test, deleting one to fix a typo must not discard the other line's evidence.
  - **A test tagged with images but given no value renders in the app, never in print.** `InvestigationFindingsField` builds that row at render from the `[image attached]` markers — it is *not* stored in `investigation`, so `prescriptionDoc`/`PrescriptionView`/`investigationSummary` keep excluding it through their existing `[image attached]` filters with nothing new to maintain. A value-less test name on a printed prescription would read to a pharmacy as a missing result. Images hang off a test's **first** value line (one test+date is one row, one 📎, showing the count when >1); the lightbox walks them with ‹ › / ←→ and closes on Escape.
- **Drug history (per-patient `Patient.drugHistory`):** `dd/mm/yyyy: Drug — dose — food — duration`, notes `dd/mm/yyyy(note): …`, tapering `dd/mm/yyyy(cont): dose — food — duration`. Legacy `Current:`/`Past:` prefixes must keep parsing. Current-vs-Distant-past is **derived from the entry date vs `ptDate`** — never store the bucket.
- **On-examination summary:** `{date, text}` objects (`lib/onExaminationSummary.ts`); investigation summary: `{date, category, test, value}` (`lib/investigationSummary.ts`). Both merge-on-save (deduped), grouped by date newest-first on the records page.
- **HM duration overrides:** `Patient.hmDrugDates` / `Patient.hmSymptomDates` are both `{ [name]: { sf, upto } }` (`DrugDateMap` in `lib/hmDates.ts`), values parsed by `cellToDate`. Keys are the exact drug name from `drugMentionRanges()` / the exact trimmed complaint text from `symptomMentionRanges()`. A blank or unparseable side means "use the derived date" — it does **not** hide the bar (this differs from the pre-2026-07 `hmDrugDates` semantics, when a blank `sf` meant "don't draw"). New values are written as `dd/mm/yyyy`; older `"26 Jul 2026"` labels from the removed panel still parse and are rewritten on the next edit of that field. A key whose range resolves to exactly the derived one is **dropped, not stored** — an override that changes nothing would still render dashed, carry a ✎ and write an audit line, all of which mean "moved away from the record". Orphaned keys (renamed drug, edited complaint text) are ignored, never purged.

## ⚠️ Patient sex: one word, one vocabulary, never a guess

The field is **"Sex"** on every screen (the header said "Gender" until 2026-07-27 — a different concept, and the second name is how the two screens drifted). It is `Patient.sex`, and every `<select>` offers the same four: `—` / Male / Female / Other.

**The OPD queue's `gender` column holds two spellings and always will:** `MuqsitContext` writes the full word from the editor (`gender: ptGender`), `PatientsView` used to write `"M"`/`"F"`. Read it through **`normaliseSex()` in `lib/sex.ts`**, never `=== "F"` — that test showed a woman stored as `"Female"` as **Male**, and opening her OPD row loaded that into the prescription editor.

**Never default a missing sex.** Five places used to: `patientForm.ts` pre-filled the form with `"Male"`, `PatientsView` listed and stored `M`, `OpdView` seeded the queue with `M` and pushed `"Male"` into the editor. Sex selects reference ranges (Hb, creatinine, eGFR) and sex-dependent dosing, so an unrecorded sex must stay unrecorded — `normaliseSex()` returns `""` for anything it does not recognise, and `sexLabel()` renders `—`.

**Sex and age are asked for where a patient is CREATED, and fillable where they are missing.** Both modals in `PatientMobileLookup.tsx` (new patient, and person-related-to) take them in the product owner's order — name, **Sex**, then **date of birth or age** (`IdentityFields`, 2026-08-15) — so a record no longer starts blank on the fields that decide dosing and reference ranges. All three stay **optional** there, because a guessed sex is worse than a missing one and an unknown age must not block opening the prescription. **Date of birth wins and the manual age is dropped from the payload:** `displayAge` prefers the DOB, so an age stored beside one is written and then never shown again — the box goes read-only and displays what the DOB computes to instead. The DOB box is a `DateField` on `YEAR_POLICY.past`, so `030398` is 1998, not 2098. In `PatientHeader`, Age and Sex are the one exception to the identity lock, and only to **fill a blank**: `fillable` is captured when the patient loads (not derived per render, or the box would re-lock mid-typing and a typo could never be corrected), and changing an already-recorded value still goes through Patient Settings — the same patient is seen by several practices. Age stays locked when a **DOB exists even if the box renders blank** (an unparseable or future DOB): `displayAge` prefers the DOB, so a manual age typed there would save and never appear. The header **persists these itself** (`useUpdatePatient`, 600 ms debounce) — nothing else writes them back, since `savePrescription` sends age/sex only when it is *creating* the patient — and a failed write is shown in red under the header rather than dropped.

Header and Patient Settings mirror each other live (`onGender` → `setPtInfo.sex`; the form's select → `setPtGender`; `loadPatient` sets both). If they ever disagree again, suspect a fabricated default, not the sync.

## ⚠️ Date parsing: `new Date("25/07/2026")` is Invalid Date

JavaScript reads a slash date as **month**/day/year, so the app's own `dd/mm/yyyy` blows up for any day past the 12th, and silently swaps day and month for days 1-12 (`03/06/2026` → 6 March). Anything that turns a stored date string into a `Date` must parse `dd/mm/yyyy` explicitly and reject rolled-over calendar dates (`31/02/2026` must not become 3 March) — `lib/hmDates.ts#cellToDate` and `HealthTrendsChart`'s `ddmmyyyyMs` both do, with calendar validation. Never reach for a bare `new Date(str)` on a stored date, and never let a failed parse fall back to an instant: `|| 0` yields 1 Jan 1970 and `yy || 0` yields 1900, and one such point stretches a shared axis across decades. Return `NaN`, drop what cannot be placed, and say how many were dropped.

### Two-digit years: one helper, one policy per field

A 2-digit year is ambiguous, and both parsers used to resolve it by hard-coding `2000 + yy` — so `030398` meant 2098 and a birth year was silently a century out. That is now **`resolveTwoDigitYear(yy, futureAllowanceYears, now?)` in `lib/dateInput.ts`**, a sliding window anchored on the current year (so it survives 2099, unlike a baked-in `2000`): the forward reading wins unless it lands beyond the allowance, in which case the previous century does.

The allowance is the whole design — **there is no single correct rule for every field**, and a global "never future" would be the same bug pointing backwards (a 2027 follow-up typed as `030127` would become 1927). Pick from `YEAR_POLICY`:

| Policy | Allowance | Fields |
|---|---|---|
| `YEAR_POLICY.past` | 0 years | Date of birth, calculator dates (LMP, ultrasound). Also turns on a **day-level** check: a date later than today is refused outright, not shifted, because 1926-vs-2026 there is a genuine ambiguity and guessing would be a second silent century move. A real 1926 date is typed in full. |
| `YEAR_POLICY.clinical` | 5 years | Prescription header Date, findings, medicine pad, health-monitoring durations — a follow-up may legitimately be years out. `HealthTrendsChart`'s `FUTURE_LIMIT_YEARS` **is** this constant; don't redeclare it. |

`parseDateInput` returns `{ok:true,iso}` or `{ok:false,reason:"malformed"|"future"}` — the reason exists because the field has to say *which* rule was broken. `parseFlexibleDate` is the old `string | null` wrapper and still works for callers that don't need the reason.

Separate from the policy, `parseDateInput` also enforces a sanity range: **year 1900 to today + 100**. The policy only decides which century an *ambiguous* 2-digit year belongs to; the range catches a year that is not a date at all however it was typed. `03/03/998` used to parse as year 998 — an age of 1028 — and `prescriptionDoc` prints the date string verbatim onto the prescription.

**Age comes from `lib/age.ts#ageFromDob`, everywhere.** Do not recompute it as `elapsedMs / (365.25 * day)`: leap days accumulate, so that form read 29 for someone born 27 Jul 1996 on their 30th birthday while the header said 30. Age drives dosing — one function.

**All date entry goes through `components/common/DateField.tsx`.** Do not add a native `<input type="date">`: it cannot take the DDMMYY shorthand, which is how doctors actually type, and it bypasses the century policy. `DateField` reverts to the last valid value on a bad parse **and** says why underneath — reverting alone swallowed the reason. Enter commits, Escape abandons (the Escape flag is a **ref**, set before `blur()`, because `blur()` runs the commit synchronously — the same trap documented for the chart below).

**Pass `allowEmpty` on every optional date.** The native pickers this replaced all had a clear button; without the prop a doctor can never take a wrong date of birth back out, because `parseDateInput("")` is "malformed" and the box reverts to the value they were trying to drop. It is off by default so the prescription visit date keeps refusing to be emptied, as it always did.

Dates stored **before** this fix keep their wrong century; nothing is rewritten. `isImplausibleDate()` flags them where they render (DOB field, `PatientRecordsView` date headings, the chart's amber note) and the doctor decides. A bulk repair would be its own reviewed migration.

Server side, `dob` is validated in `patients/dto/patient.dto.ts` (`@IsISO8601({strict:true})` + `NotFutureDateConstraint`, 24h grace for UTC+6-vs-UTC clock skew). Its messages are doctor-facing — `apiFetch` joins `body.message` straight into the save banner, so write them for a clinician.

## Health monitoring tab (idsp)

`HealthMonitoringView.tsx` is now a thin shell: it derives the ranges and owns the override state/mutations, and `HealthTrendsChart.tsx` does the rendering plus editing. The old "Drug timeline" SVG and its per-drug SF/Upto panel were removed (2026-07) — one chart, one place to edit. The decorative "Export Patient's Data" card went with them: a button that looks actionable and does nothing is worse than no button on a clinical screen.

- **Window ≠ filter.** The time dropdown (3m / 6m / 1y / all, default **all**, not persisted) clamps only the LOWER bound. A track whose effective end is inside the window stays visible even if it started years earlier: the bar clips at the plot edge and gets a chevron. Never make a running medication disappear from a narrow window. The window start is pulled back off month-end overflow (31 Jul − 3 months is 30 Apr, not 1 May) so it can't be a day short.
- **Order matters:** apply the override first, then the window. Filtering on recorded dates first would hide a bar the doctor just moved into view.
- **Nothing vanishes quietly.** A ticked lab parameter with no in-window reading keeps a (short) lane saying so — a missing lane would read as "never measured". Entries whose stored date can't be read are dropped from the plot but counted, with an amber note saying so and that the record still holds them.
- Editing is owner-only (`canEdit` = not assistant mode **and** `patient.doctorId === activeWorkstationId ?? user.id`); the server enforces the same in `patients.controller.ts`. Every edit is written to the activity feed under `Health monitoring` — from the mutation's `onSuccess`, so a failed save is rolled back and announced rather than logged as if it landed. The patient id travels inside the mutation payload, not a closure: a blur fires as the lookup steals focus, which is exactly when `currentPatientId` is changing.
- **Bar durations are derived and understate.** A tapering `(cont)` drug-history line carries no drug name, so it does not extend that drug's range even though the drug was still being taken; a legacy `Current:` entry resolves to *today*. Both are why the override exists — don't "fix" them by guessing in `drugHistorySummary.ts`.
- **A typo is not an instruction.** Every rejection is stated in place and nothing is stored: an unreadable date, a date more than 5 years out (the DDMMYY century trap), and an end that falls before the start. `buildTrack` still clamps an inverted range so nothing draws backwards, but the clamp is the drawing-time backstop, never the whole answer — clamping silently would hand the doctor a one-day bar with no reason for it.
- Keyboard: Enter commits, Escape abandons. Escape must set a ref **before** blurring — `blur()` runs the commit synchronously, ahead of React flushing the reverted draft, so without it Escape saves the value it was meant to discard.
- Each reading carries its parsed `ms` from the memo that builds the series; the render path compares numbers. Typing in a duration box re-renders the whole chart, so don't move date parsing back into render.
- `hmSelectedDrugs` no longer has a UI writer (the chart's checkboxes are view state). It is still seeded on patient load and carried over by the family-link flow, so the column and its data stay.

## Editor lifecycle (easy to break — know it)

- `resetEditor()` blanks everything and sets `ptDate` = today. `loadPatient(p)` = reset + header fields + restore `p.incompleteRx` **only when the patient belongs to the effective doctor** (`activeWsRef.current ?? authIdRef.current`). **Supervised patients (other doctor's) always open with a blank editor** — also enforced during draft hydration (the draft's patient is fetched and checked). Do not weaken either check.
- Auto-draft: the editor persists per-doctor via `prescription-draft`; fresh login (sessionStorage `mhs_fresh_login`) starts blank+gated, plain reload restores. "Save & print" completes the visit: merges findings/OE/drug-history into the patient's permanent JSON, clears `incompleteRx`, marks the OPD visit complete, and snapshots the printed sheet to the "All prescriptions(Image)" gallery (html2canvas in an off-screen iframe).
- **"Save & print" also PRINTS (2026-08-15).** It opens the same `buildPrescriptionHtml` document "Preview PDF" opens, at the same size — the doctor prints from that sheet's own toolbar. The two routes differ only in that this one persists the visit first. Three things in `handleSave` are load-bearing, not style: (1) the `window.open` happens **synchronously inside the click**, before `await savePrescription()`, because a pop-up opened after an await has lost the user gesture and blockers drop it silently — which is exactly how the print half went missing until 2026-08-15; it shows a "Saving…" placeholder until the sheet is ready. (2) **The save runs before anything that can throw**; building the sheet sits after it, in a `try`, so a render failure costs the printout and never the record. (3) A failed save **closes** the window — a printable prescription must never exist on screen for a visit the record does not have. The same HTML string feeds the print window and the gallery snapshot, so the stored image is provably the document that was printed. Blocked pop-up → saved, and said so in an alert that does not name "Preview PDF" (the mobile layout has no such button).
- **`saveDraftNow()` ("Save to complete later") is the doctor-initiated twin of that auto-save, and differs on purpose in two ways.** (1) It is **awaited**, and the editor is cleared *only after the server confirms*; on failure it says `Draft NOT saved: …` and touches nothing, so every value survives. Never reorder that — clearing on a fire-and-forget write is worse than the silent auto-save, because the doctor walks away believing the visit is safe. (2) It sets the OPD `rxStatus: "incomplete"` flag **unconditionally**, not gated on `rxFlaggedRef`: `flushEditorDraft` never sets it, so a patient typed-into and left inside the 1200 ms debounce used to end up with stored work and no Incomplete badge to find it by. Supervised patients take the same branch as the auto-save — own draft only, never the owner's `incompleteRx` or OPD queue. The button is gated on a loaded patient + `hasRxContent` only; `hasRxContent` ignores follow-up, `invImages` and `oeData`, so an image-only visit leaves it disabled — the tooltip has to say why rather than sitting there dead.
- The 3.docx mobile gate: nothing is writable until a patient is picked via the mobile lookup (`PatientMobileLookup`, exact 11-digit match, family-tree info rows, "SUPERVISED" badge for other-practice matches).

## Naming: "Order sheet" on the ward, "Prescription" in OPD

Deliberate and partial, chosen by the product owner on 2026-07-30 and extended on
2026-08-15. Renamed so far: the **desktop nav label** in `components/layout/tabs.ts`,
and the **℞ panel heading inside `IpdDetailView`** (an admitted patient really is
being given an order sheet). The mobile tab stays `Rx` (a 5-tab bar at 375px has no
room for "Order sheet", and ℞ is universal), and all other
user-visible strings, the PDF `<title>`, the tab `id`, the `/prescription` route, and
every code identifier are unchanged. **Do not "finish" the rename as a tidy-up** — the
clinical distinction is real (an order sheet directs nurses on the ward; a prescription
goes home with the patient to a pharmacy) and this app uses one editor for both, so
widening the rename is a product decision, not a consistency fix.

**The IPD clinical sheet's own vocabulary moved with it (2026-08-15):** the list
that read "Chief Complaints" is now **"Sign"**, and a new **"Symptoms"** list sits
under it. Only the labels changed — the stored keys are still
`clinical.chiefComplaints` / `chiefComplaintsNotes` (renaming them would orphan the
signs on every open admission), with `clinical.symptoms` / `symptomsNotes` added
alongside. Two things move together with a label on this screen and are easy to
miss: `CONDITION_FIELDS` in `lib/rxAlerts.ts` (an unlisted label silently stops
firing contraindication alerts — the reason "Chief Complaints" stays in the list) and
the `allFields` map that backs `@field` cross-references in `ExpandableField`.
OPD still says "Chief complaints"; the two screens are not required to match.

## IPD wards and their teams

Managed at Settings → "Manage your assistants and IPD team", below the assistant
list (`ManageAssistantsView` → `IpdTeamSection`, data via `hooks/useWards.ts`).
A ward holds admitted patients; its team is who works it. Notes that matter:

- **The `ipd.*` keys live in `IPD_PERMISSION_GROUPS`, deliberately OUT of
  `PERMISSION_GROUPS`.** That second list drives the assistant editor and the
  assistant gating, and an assistant reaches IPD today with no key at all — so
  folding the IPD keys in would revoke access every existing assistant already
  has. The two editors share their look through `components/tabs/permissionUi.tsx`,
  not their key list.
- A new team member starts with **nothing ticked**. On a ward, silence has to
  mean "cannot", never "can".
- The admit form's Ward field is a **dropdown of the doctor's wards** once any
  exist, with an "Other (type it)…" escape and plain free text when there are
  none — a doctor who has not set wards up must never be blocked from admitting.
  Only a chosen ward sends `wardId`; the server refuses one that isn't theirs.
- `IpdDetailView`'s header ward select is how an admission recorded **before**
  the ward list existed joins a team. It sends `wardId` only when it changed, so
  an untouched admission never has its free-typed ward text rewritten.

**Adding someone to a ward does not yet let them in** — the team member's own
login is not built. See "Rule 2b" in `server/CLAUDE.md` for why that must not go
through the workstation switcher.

## UI conventions

- **Inline styles only** with the theme palette: `import { C, font } from "@/theme"` (`C.pri/n/danger/warn/info` shades 50–800) and shared `inputSm`/`fieldLabel` from `@/theme/styles`. No Tailwind/CSS modules; occasional scoped `<style>` blocks for hover/animation are OK.
- Healthcare-grade interaction patterns already established — reuse them: Edit-mode-gated deletes with red round ✕ + persistent Undo bar (records page), select-then-remove galleries, scrollable capped-height summaries, sticky group headers, silent background retry instead of error walls (see `useWorkstations`), disabled-with-tooltip instead of hidden.
- Permission gating: `can(key)` / `canEditLabel(label)` from context (assistant permissions); wrap read-only sections in `<Lock>`. Tier gating reads `user.accountTier`.
- Print/PDF: `lib/prescriptionDoc.ts` builds a standalone HTML document (opened via `window.open` + `document.write`). Tables are `table-layout: fixed` with wrapping cells — long values must wrap **inside** the printable area, never overflow. The document carries a `<base href>` because it is written into an `about:blank` window (and an off-screen iframe for the gallery snapshot), where a relative image `src` has no reliable base — that is why the footer logo loads at all. Each `.sheet` is a single-cell `<table class="pagegrid">` whose `<tfoot>` holds the MHS / By EXHORT brand bar: a `tfoot` repeats on every printed page **and** has its height reserved in the flow, so it can never overprint a medicine row. Do not "simplify" it to `position: fixed` — that sits lower but is free to overlay content on a full page. The scoped `.pagegrid > tbody|tfoot > tr > td` resets exist so the global `table`/`td` rules (which belong to the Rx table) do not leak into the wrapper; keep the child combinators. The OPD "privacy copy" masks identity and drops clinical content — keep new sections out of it unless the patient needs them. Drug history prints **names only**, deduped.
- Mirror devices: editor state broadcasts over SSE (`DeviceMirror`); new editor state that should sync must be added to `mirrorSnapshot`/`applyMirrorSnapshot` in MuqsitContext.

## Responsive layout

The app adapts to the real device viewport, not just the manual preview toggle:

- `Muqsit.tsx` derives `effectiveView` from `matchMedia("(max-width: 767px)")` — phones always render `MobileShell`, regardless of the manual Desktop/Mobile toggle (hidden on real phones). It does **not** mutate the shared `view` state, since `view` is part of the mirrored snapshot (`mirrorSnapshot`/`applyMirrorSnapshot` in MuqsitContext) — device mirroring must stay unaffected.
- `MobileShell` takes a `preview` prop: `true` (desktop's manual "Mobile" toggle) renders the classic 375px bezel + fake status-bar mock; `false` (a real phone) fills the viewport (`100dvh`, no bezel). Both render the same children — the mock is presentation-only.
- `DesktopShell` now also serves **tablets** (≥768px, capped at 1440 via `.app-root`), not just desktop — "not mobile" no longer means "plenty of width." Check ~768px as well as ~375px when adding or changing a view.
- Styling is inline-only, so there's no ambient CSS breakpoint. Working patterns for a new row/grid/modal: `flexWrap:"wrap"` on any row that can overflow; `gridTemplateColumns:"repeat(auto-fit,minmax(Npx,1fr))"` instead of a fixed column count; `width:"min(Npx,92vw)"` + overlay `padding` for fixed-width modals. For a genuine breakpoint collapse (e.g. a 2-column layout that must become 1-column below some width — inline `style` can't express a media query), use a scoped `<style>` block with a class name, e.g. `.rxEditorGrid` in `PrescriptionView.tsx` (≤860px), `.invModal` in `InvestigationPopup.tsx` (≤820px), `.msgGrid` in `MessageView.tsx` (≤680px).
- A `mobile` prop being absent on a tab/view doesn't mean it's exempt from this — it usually means nobody's added responsive handling yet. Check how sibling views in the same tab group handle it before assuming a new fixed-width row is fine.

## Verification checklist for client changes

1. `npx tsc --noEmit` clean (Next build also lints — unused vars fail the prod build).
2. Exercise the flow at :3000; for editor changes also check reload-restore and a supervised patient stays blank.
3. Touching print/downloads → open Preview PDF and check fit; touching summaries → check records page grouping + Undo.
4. "Jest worker encountered N child process exceptions" from `next dev` = corrupted cache → stop, `Remove-Item -Recurse -Force client\.next`, restart. Not your change.
5. **Never run `npm run build` while `next dev` is running.** They share `client/.next`; the build dies with `EPERM ... .next\trace` and leaves the dev server serving a half-written tree (`Server Error: Cannot find module './vendor-chunks/next.js'`). Stop dev → delete `.next` → build → restart. This *is* your change, and it looks exactly like the corrupted-cache symptom above.
6. Verify persistence through the API, not the rendered UI — from the page, `fetch('http://localhost:4000/api/...', { credentials: 'include' })`. A value can be stored and still unreadable by the app (see the date-parsing section); only comparing the two catches it.
