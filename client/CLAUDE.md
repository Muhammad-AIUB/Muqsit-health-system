# client/CLAUDE.md — Doctor app (Next.js 14)

The doctor-facing SPA. App Router pages are thin shells; almost everything renders through `src/components/Muqsit.tsx` → `TabRouter.tsx` (tab = URL segment) with state in **one large context store**: `src/context/MuqsitContext.tsx` (`MuqsitStore = ReturnType<typeof useMuqsitStore>` — add to the return object and the type follows). Auth lives in `src/context/AuthContext.tsx`; server state in React Query hooks (`src/hooks/`); all HTTP through `src/lib/api.ts` (`apiFetch`: credentials, X-Workstation header, silent 401 refresh).

**Env trap:** `NEXT_PUBLIC_API_URL` must be set in both `.env.local` (dev, gitignored) and **`.env.production` (committed — the deployed build uses it)**. A missing prod value silently points the live site at `localhost:4000`.

## ⚕️ Clinical-accuracy rules specific to the client

- **Calculators (`src/lib/calculators/`, ~77 of them, wired via `calculator-registry.ts`):** each implements a published clinical score/formula. Never alter a formula, cutoff, unit, or interpretation without the published source; keep severity labels (`success/warning/danger`) consistent with the source. New calculators register in the registry and appear in Investigation "Special Scores".
- **Investigation catalog (`src/data/investigations.ts`):** the master test list (`INV_CATS`: `{cat, tests:[{name, fields}]}`, some via the `txt([...])` name-only helper). Test names must stay **unique across categories** (duplicates were purged deliberately); field units are clinical facts — verify before editing.
- **Never round, reformat, or "normalize" an entered clinical value.** Display exactly what the doctor typed.
- **Medicine search hits the server** (`/medicines/search`, raw `medicines` table). `src/data/drugs.ts` is only an 18-item static fallback for the legacy drug picker / monthly-cost demo — do not treat it as the drug database.
- **OCR (`src/lib/ocr.ts`, tesseract.js)** verifies the typed NID number against the uploaded NID photo during signup. It is assistive only — never let OCR overwrite what the user typed.

## Storage string protocols (the data model hiding in strings)

These formats are persisted in drafts, prescriptions and patient JSON columns — **changing them silently orphans existing data**. Extend parsers, don't break them:

- **Investigation finding:** `dd/mm/yyyy:TestName:value` (parse via `lib/investigationSummary.ts`). Report-pool images: `dd/mm/yyyy:Report N:[image attached]`; test-tagged images use key `dd/mm/yyyy:TestName` in `invImages` + a `…:[image attached]` entry. `[image attached]` / `Report N` rows are filtered out of print and summaries.
- **Drug history (per-patient `Patient.drugHistory`):** `dd/mm/yyyy: Drug — dose — food — duration`, notes `dd/mm/yyyy(note): …`, tapering `dd/mm/yyyy(cont): dose — food — duration`. Legacy `Current:`/`Past:` prefixes must keep parsing. Current-vs-Distant-past is **derived from the entry date vs `ptDate`** — never store the bucket.
- **On-examination summary:** `{date, text}` objects (`lib/onExaminationSummary.ts`); investigation summary: `{date, category, test, value}` (`lib/investigationSummary.ts`). Both merge-on-save (deduped), grouped by date newest-first on the records page.
- **HM duration overrides:** `Patient.hmDrugDates` / `Patient.hmSymptomDates` are both `{ [name]: { sf, upto } }` (`DrugDateMap` in `lib/hmDates.ts`), values parsed by `cellToDate`. Keys are the exact drug name from `drugMentionRanges()` / the exact trimmed complaint text from `symptomMentionRanges()`. A blank or unparseable side means "use the derived date" — it does **not** hide the bar (this differs from the pre-2026-07 `hmDrugDates` semantics, when a blank `sf` meant "don't draw"). New values are written as `dd/mm/yyyy`; older `"26 Jul 2026"` labels from the removed panel still parse and are rewritten on the next edit of that field. A key whose range resolves to exactly the derived one is **dropped, not stored** — an override that changes nothing would still render dashed, carry a ✎ and write an audit line, all of which mean "moved away from the record". Orphaned keys (renamed drug, edited complaint text) are ignored, never purged.

## ⚠️ Patient sex: one word, one vocabulary, never a guess

The field is **"Sex"** on every screen (the header said "Gender" until 2026-07-27 — a different concept, and the second name is how the two screens drifted). It is `Patient.sex`, and every `<select>` offers the same four: `—` / Male / Female / Other.

**The OPD queue's `gender` column holds two spellings and always will:** `MuqsitContext` writes the full word from the editor (`gender: ptGender`), `PatientsView` used to write `"M"`/`"F"`. Read it through **`normaliseSex()` in `lib/sex.ts`**, never `=== "F"` — that test showed a woman stored as `"Female"` as **Male**, and opening her OPD row loaded that into the prescription editor.

**Never default a missing sex.** Five places used to: `patientForm.ts` pre-filled the form with `"Male"`, `PatientsView` listed and stored `M`, `OpdView` seeded the queue with `M` and pushed `"Male"` into the editor. Sex selects reference ranges (Hb, creatinine, eGFR) and sex-dependent dosing, so an unrecorded sex must stay unrecorded — `normaliseSex()` returns `""` for anything it does not recognise, and `sexLabel()` renders `—`.

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
- The 3.docx mobile gate: nothing is writable until a patient is picked via the mobile lookup (`PatientMobileLookup`, exact 11-digit match, family-tree info rows, "SUPERVISED" badge for other-practice matches).

## UI conventions

- **Inline styles only** with the theme palette: `import { C, font } from "@/theme"` (`C.pri/n/danger/warn/info` shades 50–800) and shared `inputSm`/`fieldLabel` from `@/theme/styles`. No Tailwind/CSS modules; occasional scoped `<style>` blocks for hover/animation are OK.
- Healthcare-grade interaction patterns already established — reuse them: Edit-mode-gated deletes with red round ✕ + persistent Undo bar (records page), select-then-remove galleries, scrollable capped-height summaries, sticky group headers, silent background retry instead of error walls (see `useWorkstations`), disabled-with-tooltip instead of hidden.
- Permission gating: `can(key)` / `canEditLabel(label)` from context (assistant permissions); wrap read-only sections in `<Lock>`. Tier gating reads `user.accountTier`.
- Print/PDF: `lib/prescriptionDoc.ts` builds a standalone HTML document (opened via `window.open` + `document.write`). Tables are `table-layout: fixed` with wrapping cells — long values must wrap **inside** the printable area, never overflow. The OPD "privacy copy" masks identity and drops clinical content — keep new sections out of it unless the patient needs them. Drug history prints **names only**, deduped.
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
