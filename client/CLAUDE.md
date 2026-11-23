# client/CLAUDE.md — Doctor app (Next.js 14)

The doctor-facing SPA. App Router pages are thin shells; almost everything renders through `src/components/Muqsit.tsx` → `TabRouter.tsx` (tab = URL segment) with state in **one large context store**: `src/context/MuqsitContext.tsx` (`MuqsitStore = ReturnType<typeof useMuqsitStore>` — add to the return object and the type follows). Auth lives in `src/context/AuthContext.tsx`; server state in React Query hooks (`src/hooks/`); all HTTP through `src/lib/api.ts` (`apiFetch`: credentials, X-Workstation header, silent 401 refresh).

Where each thing lives: [`docs/CODEMAP.md`](../docs/CODEMAP.md) §2 (routes, tabs, components, hooks, the groups of `src/lib/`). The words used here: [`docs/DOMAIN.md`](../docs/DOMAIN.md).

## How this file works

The rules of the doctor app — clinical accuracy, the storage formats, the editor's lifecycle, the UI conventions — are in `docs/rules/<topic>.md`, each with its reason ([index](../docs/rules/README.md), which also says where each section of the old version of this file went). This file is the way in:

- **Rules for every client change** — one line per rule. Read the file named beside a group when one of its lines bears on what you are doing.
- **Before you touch a feature** — the file you MUST read before changing that feature's code. The lines under a feature are its most safety-critical entries, kept here so they are never out of sight. They are pointers: the entry in the file is what counts, and the file holds more than is listed here.
- Open questions, known limits and the physician's answers for the same feature: `docs/audit/<topic>.md` — the same file name.
- A new lesson: the full entry and its "At a glance" line go in the topic file; a line goes here only if it bears on every client change or on what a patient is given.

## Rules for every client change

### Access and scoping (workstation, assistants, supervised doctor) → [`docs/rules/access-and-scoping.md`](../docs/rules/access-and-scoping.md)
- The `Lock` in `LeftColumn` stays: an assistant without `rx.drugHistory` must not be handed a patient's medications by the read-only view. → `docs/rules/drug-history.md`
- An assistant without `rx.drugHistory` sees the drug safety list (it is not behind `Lock`) but gets no + / ✎ Edit.
- `ipd.analogue` is enforced server-side but deliberately not against assistants (they hold no `ipd.*` key at all); see `assertMayEditAnalogue`.
- Keep the `ipd.*` keys in `IPD_PERMISSION_GROUPS`, OUT of `PERMISSION_GROUPS` — folding them in would revoke IPD access from every existing assistant.
- A new ward team member starts with nothing ticked: on a ward, silence must mean "cannot", never "can".
- Permission gating uses `can(key)` / `canEditLabel(label)` from context and `<Lock>` around read-only sections; tier gating reads `user.accountTier`
- ⚕️ Another practice's patient is listed in the mobile lookup apart from the doctor's own and opens only through `AccessCodeDialog` (the patient's own code, `lib/patientAccess.ts`); an isolated practice (`activeWorkstation.isolated`) does not even ask; a failed search shows nothing extra, never an error over the doctor's own list.
- Note and Plan both carry `rx.note` via explicit `permKey`; never put "Plan" into `PERM_KEY_OF_LABEL` (IPD label); a label colliding across screens must pass `permKey` → `docs/rules/visit-sheet.md`

### Dates → [`docs/rules/dates.md`](../docs/rules/dates.md)
- Never use a bare `new Date(str)` on a stored date: parse `dd/mm/yyyy` explicitly, reject rolled-over dates, never fall back to an instant (`|| 0`) — return `NaN`, drop and count what fails.
- Every caller that orders clinical data by a `dd/mm/yyyy` string shares ONE copy, `ddmmyyyyMs` in `lib/dateInput.ts`; two screens disagreeing on which finding is newer is a real hazard.
- `ddmmyyyyMs` returns milliseconds, not a `yyyymmdd` sort key, because callers do time arithmetic (`rxAlerts` days, "last 6 months" filter); a sort key would silently break them.
- `ddmmyyyyMsStrict` returns `NaN` and refuses rolled-over dates, for callers that must DROP a bad date (chart axis, `rxAlerts`); pick by what a bad date must do: sort last → lenient; dropped → strict.
- Two-digit years are resolved by `resolveTwoDigitYear(yy, futureAllowanceYears, now?)` in `lib/dateInput.ts`, a sliding window — not a hard-coded `2000 + yy` (`030398` became 2098).
- Pick each date field's `YEAR_POLICY`: `past` (0 years; DOB, LMP/ultrasound; a later-than-today date is refused) or `clinical` (5 years); `FUTURE_LIMIT_YEARS` is this constant — don't redeclare it.
- All date entry goes through `components/common/DateField.tsx`; never add a native `<input type="date">`; a bad parse reverts AND says why; Escape flag is a ref set before `blur()` (+1 more)
- Pass `allowEmpty` on every optional date so a wrong date (e.g. date of birth) can be taken out; it stays off for the prescription visit date.
- Dates stored before the century fix keep their wrong century; nothing is rewritten; `isImplausibleDate()` flags them where they render; a bulk repair would be its own reviewed migration.
- Server validates `dob` in `patients/dto/patient.dto.ts` (`@IsISO8601({strict:true})` + `NotFutureDateConstraint`, 24h grace); its messages reach the save banner, so write them for a clinician.

### Forms, typing, BAN / EN, number formats → [`docs/rules/forms-and-input.md`](../docs/rules/forms-and-input.md)
- Entered clinical values: never round, reformat or "normalize" one; display exactly what the doctor typed.
- BAN/EN typing uses Avro Phonetic's rule table, vendored unmodified but for one `export` in `src/vendor/avro-phonetic/` (MPL-1.1) — keep the header and licence file; engine `lib/banglaInput.ts`.
- Only physician-named fields convert (`BANGLA_FIELDS`, OPD ℞ dose/food/duration, `data-bangla="on"`); others type English with a notice; medicine NAME box excluded; widening is a product decision.
- ⚕️ The BAN keyboard never converts a number: digits, `+`, `/`, `-` pass through as typed (`0.5` never `০।৫`); `.` becomes `।` only straight after a Bangla letter.
- BAN conversion is ONE document-level capture-phase `keydown` listener writing via the native value setter + an `input` event; no field holds Bangla state of its own.
- A form being read is `<fieldset disabled className="read-form">`; locked is shown by grey boxes, never by fading the patient's details; an empty locked box needs its own placeholder rule
- System timestamps go through `lib/stamp.ts`, never `toLocaleString()` / `toLocaleDateString()`; a calculator's NUMBER goes through `grouped()` (it is filed as the finding and prints)
- A form box keeps a caption above it (`fieldLabel`) matching its `aria-label`, never a placeholder as its name; a caption must SAY so (`<label data-caption>`) to focus its box (+3 more)
- The `+` beside each clinical field is `className="hit-area"` (margin exactly its 28px row); never put it on a × at the end of a list line
- A listener on the whole document never guesses what an element is for: a caption that puts the cursor in its box is a `<label data-caption>`, and a thing that is pressed is a `<button>`.

### Popups, focus, keyboard, accessibility → [`docs/rules/dialogs-and-focus.md`](../docs/rules/dialogs-and-focus.md)
- ⚕️ The closed patient gate is `inert` (closed to the keyboard too); set `inert` only via `useInert()` (`lib/inert.ts`), never a bare ref; wrappers carry a `key`.
- Anything clickable is keyboard-reachable (`<button>` or `pressable()`); icon-only buttons carry `aria-label`; Investigation calendar arrows MOVE, never choose a date (+4 more)
- Keyboard focus is drawn globally (`:focus-visible` in `app/globals.css`); a control drawing its own opts out with `data-focus-ring="off"`; colours there mirror `theme/index.ts` — change both
- Popups spread `useDialog(open, close)` and prove it with `itKeepsTheKeyboard()`; the Save & print sheet uses `returnFocus: false` — only an opener that commits asks for it (+4 more)
- Use `confirmAction()` / `tell()`, never `window.confirm` / `window.alert`; a removal is `danger` with Cancel holding focus; fix what is removed before the `await`, re-read after (+2 more)
- Nothing is opened over the app without `useDialog()` (`client/src/lib/useDialog.ts`); a new popup's test runs `itKeepsTheKeyboard()`; one that shows an `<iframe>` listens for keys inside it too.
- The focus is never handed back to a button that SAVES: the print sheet closes with the focus on the page (`useDialog(…, { returnFocus: false })`), held by `e2e/tests/print-sheet.spec.ts`.
- A popup that stays mounted for the session never keeps a half-typed value across patients: its draft is dropped when the patient changes, and on close it is ASKED about ("Discard …?", red), never dropped silently.

### Lists: loading, empty and error states → [`docs/rules/lists-loading-errors.md`](../docs/rules/lists-loading-errors.md)
- Lists use `EmptyState` / `Loading` / `LoadError` (Try again); never a raw `error.message` or "Is the API running?"; clinical suggestion lists render nothing when empty or failed (+1 more)
- Reuse established patterns: Edit-mode-gated deletes with red ✕ + persistent Undo, select-then-remove galleries, silent background retry instead of error walls, disabled-with-tooltip not hidden
- "Nothing here yet" is drawn only for a list that is HERE and EMPTY: the fetch asks whatever the browser says (`networkMode: "always"`), the answer is checked to BE the list, an error is drawn before any data.
- Not every answer below 500 is the server's last word, nor its text a sentence for a doctor: a 401 is worth the quiet retry; only the 403 of `WorkstationGuard` is shown as written and not asked for again.

### Theme, colour, night mode, icons, fonts → [`docs/rules/theme-and-colour.md`](../docs/rules/theme-and-colour.md)
- Never write a colour as a literal in a component; `rawColours.test.ts` fails on `#hex`, `rgba(` or `"white"` not on its reasoned allowlist; text on a filled colour is `C.n[0]`.
- Contrast decides night values: `contrast.test.ts` holds every drawn pair to WCAG AA in both modes; `palette.test.ts` pins LIGHT to the old hex.
- Night mode never darkens printouts (`prescriptionDoc.ts` imports no theme), patient images (never filtered or inverted) or rich text (`PAPER`).
- `app/layout.tsx` is a server component — whatever it imports must hold no React; verify a layout change with a production build; theme store `lib/theme.ts`, not mirrored (+1 more)
- Styling: inline styles only, with `C` / `font` from `@/theme` and shared styles from `@/theme/styles`; no Tailwind or CSS modules; occasional scoped `<style>` for hover/animation is OK
- Palette: `C.pri` (blue) is brand and pressable/selected, `C.ok` (green) is done/normal/saved; never `C.pri` on a status, never `C.ok` on a button; print blue is hard-coded (+1 more)
- Tabs: a chosen tab is FILLED (`tabOn`: `pri[100]` fill, `n[900]` words) and every tab is written black (`tabInk`); a tab that cannot be pressed stays `n[400]`
- Buttons and fields come from `@/theme/styles`; a button that cannot be pressed is `btnDisabled` spread last, never a lowered `opacity`; popup corner × is `btnClose` (+2 more)
- A whole card that opens something uses `className="card-press"`; a switched-off card (`aria-disabled`) does neither effect; scoped to `(hover: hover)`
- Type size: no text below 10.5px (captions, helper lines, pills 11px), except the listed sizes tied to a box, glyph or miniature; `HealthTrendsChart` writes sizes in the drawing's own units
- Icons are `components/common/Icon.tsx`; never an emoji as an icon; ✎ ⊘ 💊 ★ ↳ ▲ ▼ ✓ × ℞ ⤓ ⚠ stay TEXT — do not "tidy" them into icons
- Font is served by the app (`public/fonts/dm-sans-5.3.0/`), nothing fetched from Google; a new font file needs a new folder because `/fonts` is cached for a year
- Every "add" plus is the circled `plusCircle` (`AddCircleButton` beside fields, `PlusLabel` with words); a `+` that is not "add" (zoom-in, directory open, Anaemia/Jaundice grades) is not changed
- Navigation icons are `components/layout/TabIcon.tsx`, not the glyphs in `tabs.ts` (text fallback); below 1040px the tab icons are hidden (`.nav-ico`)
- Patient header's three view buttons share one brand-blue "selected" look (`subNav`); amber means "needs attention" and stays on the Keep-eye toggle only

### Layout, page zoom, responsive → [`docs/rules/layout-and-zoom.md`](../docs/rules/layout-and-zoom.md)
- Page zoom 1.12: no `vh`/`vw` sizing (use `.screen-fill` / `.mobile-shell-fill`; popups take limits from the veil); convert screen px with `zoomScale` / `toLayoutPx`; change the three 1.12s together
- Phone layout (`MobileShell`): More opens with a Patients card; bottom-bar places are `flex: 1 1 auto`; IPD name block 220px basis; OPD token stays at the end of the first line (+1 more)
- A short screen is its own case: at `max-height: 850px` (`useMediaQuery`, reads the window) the Investigation popup's days fold behind Days ▾; the popup takes `100%` of its veil, not `85vh`.
- `Muqsit.tsx` derives `effectiveView` from `matchMedia("(max-width: 767px)")` (phones always `MobileShell`) and must NOT mutate the mirrored `view` state.
- `DesktopShell` also serves tablets (≥768px, capped at 1440); check ~768px as well as ~375px when adding or changing a view.
- Inline styles only: `flexWrap`, `auto-fit` grids, popups `min(Npx, 100%)` with `maxWidth`/`maxHeight: "100%"`, never `vw`/`vh`; a real breakpoint uses a scoped `<style>` class.
- An absent `mobile` prop does not mean a view is exempt from responsive handling; check sibling views before assuming a new fixed-width row is fine.
- No control is drawn over a page that is open to be read: in the image viewer, at fit the whole page is on the screen with room kept for the controls (`LIGHTBOX_CSS`).

### Screenshots and recording → [`docs/rules/screen-capture.md`](../docs/rules/screen-capture.md)
- `ScreenGuard` (production only, doctor app, not admin) hides the screen on focus loss / capture keys and watermarks it; it never touches Save & print, and focus moving into an `<iframe>` is not a capture. A web page cannot truly block capture — never claim it does.

### Naming and wording → [`docs/rules/naming-and-wording.md`](../docs/rules/naming-and-wording.md)
- Nav label, IPD ℞ heading and the `ipd.medicines` permission label read "Prescription"; the permission KEY `ipd.medicines` is unchanged (renaming revokes it); mobile tab `Rx`, ids and route unchanged.

### Testing and verification → [`docs/rules/testing-and-verification.md`](../docs/rules/testing-and-verification.md)
- Client check 0: `npm test` (vitest); a red test is a clinical regression, not a formatting nit.
- Client check 1: `npx tsc --noEmit` clean; the Next build also lints and unused vars fail the prod build.
- Client check 2: exercise the flow at :3000; for editor changes also check reload-restore and that a supervised patient stays blank.
- Client check 3: touching print/downloads → open Preview PDF and check fit; touching summaries → check records page grouping + Undo.
- Never run `npm run build` while `next dev` is running (they share `client/.next`): stop dev → delete `.next` → build → restart.
- Verify persistence through the API (`fetch('http://localhost:4000/api/...', { credentials: 'include' })`), not the rendered UI.

### Build, deploy, dependencies, git → [`docs/rules/deploy-and-ops.md`](../docs/rules/deploy-and-ops.md)
- Env: `NEXT_PUBLIC_API_URL` must be set in both `.env.local` and the committed `.env.production`; a missing prod value silently points the live site at `localhost:4000`.
- Image optimizer: keep `images: { unoptimized: true }` in `next.config.mjs` (security; Next 14 advisories) until Next is 15.5.24+, then drop it only if an image is meant to be optimized.
- Build folders: `.gitignore` ignores every `/.next*/` folder (any `NEXT_DIST_DIR`); never commit one.

## Before you touch a feature, read its file

- **Editor lifecycle: drafts, reload, visit state, device mirror** → [`docs/rules/editor-lifecycle.md`](../docs/rules/editor-lifecycle.md) — 18 entries. Named there: `client/src/lib/visitSig.ts`, `MuqsitContext.tsx`, `POST /patients/:id/drug-history`, `resetEditor`, `applyMirrorSnapshot`, `editorEpochRef`.
  - ⚕️ Header photo is the on-screen patient's: `resetEditor` blanks `ptInfo` and `watchPatient`; `loadPatientById` opens only the LAST patient asked, if not reset since; `<img>` keyed by patient+URL.
  - ⚕️ Printed = Save & print done AND the visit still says what was SENT (`fingerprint`, never text); "+ Add medicine" lines are appended by the server via one queue; `DEFECT-RELOAD-MIDNIGHT` (+8 more)
  - ⚕️ A reload's draft is dropped if the editor moved while it was on its way: every applied snapshot moves `editorEpochRef`; state arriving then is marked arrived (`mirrorAppliedRef`) (+1 more)
  - A visit's work is never kept in a place that a reload, a patient switch or the next sign-in empties: each kind of visit is parked in a place of its practice's own, and "printed" rides the draft.
  - "Printed" is not a latch: it means "what the visit says is what was sent", compared both ways by a short fingerprint (`visitSig.ts`), only for the visit's own patient; `resetEditor` clears it.
  - A background fetch never believes its own answer is the whole record: the patient fetch MERGES `drugHistory` against live state (`MuqsitContext.tsx`) — nothing dropped, nothing duplicated.
  - A late answer never decides it is still wanted by asking about ONE of the ways the editor can move on: every writer that replaces the editor moves `editorEpochRef`, not `resetEditor` alone.
- **The ℞ pad and Save & print** → [`docs/rules/rx-pad.md`](../docs/rules/rx-pad.md) — 20 entries. Named there: `client/src/lib/rxPadHold.ts`, `client/src/lib/usePadSync.ts`, `server/src/rx-habits/rxLanguage.ts`, `client/src/lib/medicineKey.ts`, `components/prescription/MonthlyCost.tsx`, `hooks/useMonthlyCost.ts`.
  - A `>>>` taper never leaves its medicine: written only under a named medicine directly above; a tapered medicine keeps its name; unwritable lines are held, red, and Save refuses (+4 more) → `docs/rules/drug-history.md`
  - ⚕️ The ℞ pad is always English; BAN/EN changes only the printout's dose/food/duration (`rxForPrint`, physician's table verbatim; a NAME never converted; advice is machine-translated, unreviewed, `docs/rules/rx-pad.md`)
  - OPD ℞ pad and print: notes and medicines are ONE numbered list, but a note stays a NOTE (no dose, mirror, alerts or habits); in print a note advances `rxNo` but never `rxRowNo`
  - ℞ pad medicine column has a 190px floor (`MedicinePad.tsx`); do not remove the floor to "save a line" — a pad too narrow wraps the doses to the next line
  - Save buttons: a failed save is a `tell()` box, never the green line; a throw after the prescription was created is never "not saved"; a lost answer is re-sent AS IT IS (+4 more)
  - The line under the Save buttons holds its KIND with its words (`SaveNotice`); a failed or refused save is a `tell()` box (`whyNotSaved`); a throw after the prescription was created is never called "not saved".
  - "Is this medicine on the pad already?" is asked ONE way: `sameMedicine` / `MedicineMap` (`medicineKey.ts`) and `instructionKey`; it converts no unit, never sets aside a strength, never takes two forms for one.
  - No way onto the ℞ pad that no screen uses is kept: dead code that writes clinical content is removed, not left for a later change to wire back in.
  - A `>>>` line never falls onto the medicine above: a medicine with `>>>` lines keeps its name, EVERY edit that changes position keeps the rule (`rxItemsFromRows`), and the pad's rows are held with the visit (`rxPadHeld`).
  - Two copies of the same state are never kept in step with one effect each way: the ℞ pad's rows and `rxItems` go through ONE effect (`usePadSync.ts`); where the pad moved, the pad's edit wins.
- **Drug history** → [`docs/rules/drug-history.md`](../docs/rules/drug-history.md) — 28 entries. Named there: `client/src/lib/rxDrugHistory.ts`, `components/prescription/DrugHistoryTable.tsx`, `hooks/useDrugHistoryGenerics.ts`, `lib/drugCourse.ts`, `lib/drugHistoryAdd.ts#buildDrugHistoryEntry`, `lib/drugHistoryGeneric.ts#genericOf`.
  - Background patient fetch merges `drugHistory` by BLOCKS (`mergeWithRecord`), never overwrites it with `p.drugHistory`; known limit: a ℞ change after Save & print is undone by a reload.
  - Drug history modal and Records section show the GENERIC, never the trade name — display only; nothing guessed: an unmatched or ambiguous label is shown as stored with a note (+2 more)
  - Records Drug history table: End = Start + days of every line; Total = Σ(units a day × days); nothing guessed — unreadable cells give a dash, a total is not rounded (+3 more)
  - The ℞ → Drug-history mirror claims only what it INSERTED (`mirrorClaims`), never what it would write; what it owns travels with the VISIT (`rxMirrorOwned`); a resumed draft's lines are re-stamped to today.
- **Prescribing alerts, drug hypersensitivity, high-alert medication** → [`docs/rules/rx-alerts.md`](../docs/rules/rx-alerts.md) — 34 entries. Named there: `client/src/data/rxAlerts.ts`, `components/prescription/DrugSafetyField.tsx`, `hooks/useRxAlertInput.ts`, `lib/drugSafety.ts`, `lib/rxRows.ts`, `server/src/patient-drug-safety/lines.ts`.
  - Entries in `client/src/data/rxAlerts.ts` are never reworded, added or "fixed": every message is verbatim from the physician's rule sheets.
  - Prescribing alerts are never printed or persisted: they are derived live, and `prescriptionDoc.ts` has no alert input, pinned by tests (physician's decision).
- **"Your usual", learned phrases, Add Bulk Medicine, drug advice** → [`docs/rules/habits-and-phrases.md`](../docs/rules/habits-and-phrases.md) — 61 entries. Named there: `lib/rxHabitKey.ts`, `data/suggestions.ts`, `hooks/useRxHabits.ts`, `lib/bulkMedicines.ts`, `lib/medicineKey.ts`, `lib/rxDrugAdvice.ts`.
  - ••• special advice per medicine (OPD pad only): only on NAMED medicine lines, never a taper, note or typing line; Save is NOT optimistic; assistants need `rx.advice` (+2 more)
  - ••• advice beside each Final diagnosis: keyed by diagnosis folded for case and spacing only, never matched on part of it; app ships no diagnosis advice; medicines' advice first (+2 more)
  - Add Bulk Medicine (+ beside ℞, OPD pad only): one row per medicine with its usual instruction, tapers and generic; Popular / Alphabetical; not on IPD sheet, Drug-history pad or template editor
  - Add Bulk Medicine: a LINE is never written twice (same medicine, dose, timing, duration skipped); a MEDICINE can be and the box says so; compare via `sameMedicine` / `instructionKey` (+3 more)
  - Add Bulk Medicine box is ONE patient's: closes in the same render when `currentPatientId` changes (and when `rx.medicines` is taken away); it does not come back with the first patient
  - Add Bulk Medicine: "No medicines yet" only for a list HERE and empty (`bulkBoxState`); every opening asks again and waits; `networkMode: "always"`; one quiet retry, never on a 403 (+2 more)
  - Add Bulk Medicine chips: a chip shows the NAME only; ▼ offers the last three instructions plus the usual; chip starts on the usual; Add adds exactly the chosen instruction, nothing mixed (+3 more)
  - A list that is being TICKED is never replaced under the doctor ("Add Bulk Medicine"): while a request is on its way the box says Loading and draws no rows (`bulkBoxState`); rows catch up before Tab (`catchUp`).
  - "The same" is never said of what was compared in part: what "Add Bulk Medicine" compares for its skip (the first line) and what it says about it are worked out separately (`bulkToRxItems`).
  - A flag that names one feature is never put on what another feature made (`fromHabit` on bulk lines would write an untrue activity sentence): before reusing a field, read every place that reads it.
- **Investigations: popup, findings, catalog, units** → [`docs/rules/investigation.md`](../docs/rules/investigation.md) — 26 entries. Named there: `client/src/lib/findingParts.ts`, `client/src/lib/twoUnitValue.ts`, `lib/investigationImages.ts`, `src/data/investigations.ts`, `components/common/HideToggle.tsx`, `components/investigation/InvestigationDirectory.tsx`.
  - Two-unit result box converts only a whole, plain number; anything else is recorded exactly as typed in its box's unit; never `parseFloat`/`parseInt` a typed value without checking all of it.
  - Finding parts: only a test the catalog says has (or ever had) several boxes is spaced at commas; all else shown as stored — never a "looks like a grouped number" pattern (+3 more)
  - Nothing — not a space — is put inside a number to show it, and no guessing which comma is which: the catalog says which values hold several parts; everything else is shown as stored (`findingParts.ts`).
  - A number not read whole is never converted or recorded: never `parseFloat` / `parseInt` on something a doctor typed without first checking that ALL of it is the number (`twoUnitValue.ts`).
  - A key that MOVES never also CHOOSES: in the Investigation calendar the arrows move along the days and only Enter, Space or a click chooses one (choosing a day files whatever is half typed).
- **Health monitoring and the trend chart** → [`docs/rules/health-trends.md`](../docs/rules/health-trends.md) — 24 entries. Named there: `client/src/lib/timelineLabel.ts`, `client/src/lib/numericInvSeries.ts`, `lib/drugCourse.ts`, `lib/hmDates.ts`, `lib/timelineGeometry.ts`, `drugHistorySummary.ts`.
  - ⚕️ `numericInvSeries.ts`: a comma with a digit directly on each side cannot be read — neither side is plotted; comma + space is punctuation. Defects kept: spaced/grouped numbers, signs (+3 more)
  - ⚕️ Narrow health chart is never shrunk (scrolls; names in a second `viewBox`); `timelineLabel.ts` never cuts a number or parts it from its unit, and keeps strengths apart (+10 more)
  - A medicine's label is never cut at its END to fit a narrow column: the dosage form gives way first, then the end of the brand; the strength is the last thing cut (`nameLines`). (+1 more)
  - A rule for ONE name never promises that two names come out different: the names of one chart are laid out TOGETHER (`namesApart`); a "never" property is run over pairs BUILT to be mistaken for each other.
  - One step of a fix never undoes another (`namesApart`): a step is taken only when it leaves FEWER pairs alike on the whole chart; a case that cannot be told apart is a failing test (`DEFECT-HM-NAMES`).
  - A number is never cut, or parted from its unit, to make it fit; a decimal point is never parted from its number; and a rule about medicine labels is tried on labels as real sheets write them (`20 mg+50 mg`).
  - "Every" is never said of what a sample has shown, nor "the labels differ" taken for "the labels tell them apart": a shape that matters is COUNTED, whole, over fixed pools; a test's name says what the test tries.
  - A strength is never cut without looking at the other strengths of that medicine on the chart (`layOut`, `medicineOf`); the strength takes the line only where the medicine's name is shown no less than before.
  - No language feature new to the doctor app (`\p{…}` classes, `matchAll`) goes into the page every doctor opens without asking what a browser that lacks it will do: there it fails to load the page.
  - Part of a number is never plotted: what stands on either side of a comma with a digit directly on each side of it is not plotted (`client/src/lib/numericInvSeries.ts`).
  - A drawing that carries numbers is never shrunk to fit a narrow screen: the health-trend chart keeps its size and scrolls sideways; its names stay put.
- **Clinical calculators** → [`docs/rules/calculators.md`](../docs/rules/calculators.md) — 1 entries. Named there: `calculator-registry.ts`, `src/lib/calculators/`.
  - Calculators: never alter a formula, cutoff, unit or interpretation without the published source; keep severity labels consistent with it; register new ones in `calculator-registry.ts`.
- **The visit sheet and the app shell** → [`docs/rules/visit-sheet.md`](../docs/rules/visit-sheet.md) — 12 entries. Named there: `app/error.tsx`, `app/not-found.tsx`, `components/auth/guards.tsx`, `components/prescription/PatientHistoryField.tsx`, `lib/inlineEditFields.ts`, `lib/oeHistory.ts`.
  - OPD sidebar line removal: red ✕ only inside ✎ Edit, never on a line being read; one press takes ONE line, Undo puts it back at its old place and never writes a line twice (+2 more)
  - Every OPD `ExpandableField` (incl. History, Associated illness, Advice) edits in place; popup ADDED chips show × only after ✎ Edit; IPD unchanged; supersedes parts of the in-place/removal bullets
- **Printing** → [`docs/rules/printing.md`](../docs/rules/printing.md) — 62 entries. Named there: `client/src/lib/prescriptionDoc.ts`, `components/prescription/PrintSheetModal.tsx`, `lib/chamberLayout.ts`, `lib/rxShorthand.ts`, `lib/rxSnapshot.ts`, `server/src/rx-habits/normalise.ts#splitForm`.
  - Print: the dose prints UNDER the medicine name in ONE `<td>` (`.rx-name` / `.rx-dose`) and has no column of its own; the table is drug + [food] + duration
  - Print: the ↳ marker is hidden on paper with `visibility: hidden`, never `display: none` — the dose must stay indented under its medicine and the width maths honest
  - Print: Body Section settings (`bodySplit`, top margins, `bodyBottomLine`) reach the paper via `PrescriptionDoc.body`, passed by `PrescriptionView`
  - Print: the doctor's Header Section prints inside the printable area on every page; Page Setup labels the bands Top margin / Bottom margin (stored names unchanged)
  - Print: the signature is FIXED at the foot of the page in the repeating `<tfoot>`; in print `.pagegrid` takes the printable height less 4px so no blank second page
  - ⚕️ Print: a ℞ row is never cut across two pages and a `>>>` taper stays with its medicine; a number is kept with its unit by a wrap only where the glued pair fits its cell (`glueWhereItFits`) — in a cell too narrow it breaks between digits; the foot stays ONE row — a wrapped foot is not repeated, so pages print with no signature
  - Print: the fitting script lets a multi-word ℞ cell that cannot hold its line wrap, never a single word (`letWrap`); a page break can only be checked in Chromium's PDF, not in a screenshot (`prescriptionDoc.fit.test.ts`, `docs/rules/printing.md`)
  - A colour, size or spacing in `prescriptionDoc.ts` is never changed as part of an app restyle: it imports no theme on purpose.
  - ⚕️ `PrescriptionDoc.hideMhsLogo` (admin "Remove MHS logo", 16/11/2026) removes only the `bb-mhs` mark, only for the boolean `true` (via `lib/practiceBrand.ts#hidesMhsLogo`, the practice's setting from `activeWorkstation`); "By EXHORT" and the signature stay and the sheet is byte-for-byte unchanged with it off.
- **Patient identity: sex, age, NID, family tree, photo** → [`docs/rules/patient-identity.md`](../docs/rules/patient-identity.md) — 7 entries. Named there: `lib/age.ts#ageFromDob`, `lib/sex.ts`, `src/lib/ocr.ts`, `patientForm.ts`, `PatientMobileLookup.tsx`, `normaliseSex`.
- **Patient Records page and files** → [`docs/rules/records-page.md`](../docs/rules/records-page.md) — 8 entries. Named there: `lib/galleryPdf.ts`, `lib/imagesPdf.ts`, `lib/onExaminationSummary.ts`, `lib/totalSummary.ts`, `DicomSection.tsx`, `RecordsHistorySections.tsx`.
- **OPD queue, chambers, appointment SMS** → [`docs/rules/opd.md`](../docs/rules/opd.md) — 18 entries. Named there: `components/layout/ChamberPicker.tsx`, `components/opd/OpdSmsDialog.tsx`, `lib/chamber.ts`, `lib/opdDay.ts`, `lib/opdPresence.ts`, `lib/opdSchedule.ts`.
  - A serial's time is never shown from a schedule box that is still being typed in: times come from the SAVED schedule (`useOpdSchedule`), and a save clears only what it sent (`OpdScheduleBar`).
- **IPD: ward sheet, order sheets, wards and their teams** → [`docs/rules/ipd.md`](../docs/rules/ipd.md) — 31 entries. Named there: `components/ipd/AnalogueSheetPanel.tsx`, `hooks/useWards.ts`, `lib/ipdAnalogue.ts`, `lib/ipdClinical.ts`, `lib/rxAlerts.ts`, `ipd.service.ts#preserveAnalogueSheets`.
  - ⚕️ `IpdDetailView` borrows the editor's investigation (`beginInvBorrow`/`endInvBorrow`), pausing editor auto-save; `buildClinical` never sends `analogueSheets`.
  - IPD sheet Saves: a save that did not happen is a `tell()` box; a follow-up joins the log only once the server has it; a save clears only what it SENT; one at a time (+2 more)
  - What was typed is never shown as recorded before the server has it (`IpdDetailView`): it stays in its boxes until the server answers, a save clears only what it SENT, saves go one at a time.
- **Patient chat, notes, activity feed** → [`docs/rules/chat-and-notes.md`](../docs/rules/chat-and-notes.md) — 7 entries. Named there: `client/src/components/prescription/PersonalNote.tsx`, `components/tabs/RevisionNotesView.tsx`, `lib/beforeLogout.ts`, `lib/signedInUser.ts`, `currentPatientId`, `expectedUserId`.
  - No second copy of loaded data is kept for a button to act on: the personal note has ONE text — what was typed, else what is saved — and a save clears only what it SENT.
  - An open popup never follows the editor's patient: a popup that writes to a patient is opened FOR that patient (id and details fixed at the press), and its opener does nothing while it is open.
  - A field's report of its own text is never taken as an edit (the note's editor reports on every blur): compare with what is held before calling anything changed.
- **Settings → Statistics** → [`docs/rules/statistics.md`](../docs/rules/statistics.md) — 14 entries. Named there: `components/statistics/PatientStatistics.tsx`, `lib/statistics.ts#readDays|readMonths|readOverall|readDiagnoses`, `DiseaseStatistics.tsx`, `SettingsView.tsx`, `StatisticsView.tsx`, `VisitBarChart.tsx`.
- **Settings** → [`docs/rules/settings.md`](../docs/rules/settings.md) — 2 entries. Named there: `ChambersSettingsView.tsx`, `/settings/chambers`, `PUT /chambers/:id/layout`, `confirmAction`.
  - Settings → Chambers: boxes keep what was typed until the server has it, a save clears only what it sent; Remove asks (`confirmAction`, soft); main chamber has no Remove; assistants read-only.
  - Prescription settings "Settings for" a chamber: Save writes to the CHAMBER (`PUT /chambers/:id/layout`), never to General; "Use General settings" asks, then removes the chamber's own.
- **Uploads** → [`docs/rules/uploads.md`](../docs/rules/uploads.md) — 20 entries. Named there: `components/common/ImageLightbox.tsx`, `components/common/ImageGallery.tsx`, `lib/decodeImage.ts`, `lib/imageFormats.ts`, `lib/imageThumbs.ts`, `server/src/uploads/upload.service.ts#sniff`.
  - Image formats: ONE table, `lib/imageFormats.ts`, read by the BYTES; accepted JPEG, PNG, GIF, BMP, WEBP, AVIF, HEIC/HEIF, TIFF
  - Image viewer at fit (`LIGHTBOX_CSS`): the whole page is on screen and nothing is drawn over it; to look without storing a file, use a `data:` URL in the throwaway test database (+1 more)
