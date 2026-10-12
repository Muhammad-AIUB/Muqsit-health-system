# Muqsit Health System — CLAUDE.md

## ⚕️ PRIME DIRECTIVE — medical software, patient safety first
Doctors in Bangladesh prescribe real medication through this. These rules beat every skill and every default:
1. **Never invent or guess clinical content** (formulas, ranges, units, dosing, score cutoffs, alert text). Verify against the source or ask the user (a physician).
2. **Never silently lose or transform patient data.** No destructive migration, no dedupe that can drop a finding; deleting needs an explicit action + confirm (+ Undo where built).
3. **Scoping is a safety boundary.** Every patient-data query is doctor-scoped; cross-practice access only via Assistant (workstation) or Supervised doctor. Patient DELETE is owner-only, always.
4. **Print/PDF is a legal document.** Fits the page, never truncates, shows exactly what was entered. Check print preview after touching `client/src/lib/prescriptionDoc.ts`.
5. **Calm clinical UX:** `C` palette, clear empty/loading/error states, forgiving input, silent retry on flaky networks.
6. **Verify before claiming done:** typecheck + both test suites + the flow exercised at :3000/:4000; report honestly what was not verified.
7. **Keep the CLAUDE.md files and `docs/DOMAIN.md` current** in the same commit as any major change.

## Project Snapshot
- Monorepo, three apps with their own `package.json`; root only orchestrates (`concurrently`).
- `client/` Next.js 14 + React Query (:3000, doctor app) · `admin/` Next.js 14 (:3001) · `server/` NestJS 10 + Prisma 5 + PostgreSQL (:4000, REST under `/api`, cookie JWT).
- Request flow: `client/src/lib/api.ts#apiFetch` (sends `X-Workstation`) → Nest controller (`JwtAuthGuard, WorkstationGuard`) → `@WorkstationDoctorId()` → service → `PrismaService`.

## Commands
```bash
npm run install:all                       # root: install all three apps
npm run dev                               # root: api + web + admin together
npm run build                             # root: build server, client, admin
cd server && npm run start:dev            # nodemon API on :4000
cd server && npm test                     # jest, *.spec.ts beside the code in src/
docker compose -f docker-compose.test.yml up -d   # root: throwaway Postgres on 127.0.0.1:5544
cd server && npm run test:db              # build the test databases (schema.prisma + medicines + marker)
cd server && npm run test:int             # integration/contract/regression, server/test/*.int-spec.ts
cd e2e && npx playwright test             # browser journeys on :3100/:4200 (see e2e/README.md)
node scripts/test-repeat.mjs <server|int|client> 3   # root: flaky-test detector
cd server && npx tsc --noEmit -p tsconfig.json
cd server && npm run lint                 # eslint --fix
cd server && npm run format               # prettier
cd client && npm run dev                  # :3000 (admin: same, :3001)
cd client && npm test                     # vitest run, *.test.ts(x) beside the code
cd client && npx tsc --noEmit             # same in admin/
npx prisma db execute --file prisma/manual-<name>.sql --schema prisma/schema.prisma   # from server/
```
- `client`/`admin` `npm run lint` is `next lint` but no ESLint config exists there — TODO: verify before relying on it.
- New `.ts` outside `server/src/` moves the build output and 502s prod: run `cd server && rm -rf dist && npm run build && ls dist/main.js`.

## Architecture & Conventions
- **Server:** one Nest module per domain in `server/src/<domain>/` (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`). `ValidationPipe({ whitelist: true })` drops any field not declared on the DTO.
- **Client:** App Router pages are thin shells → `src/components/Muqsit.tsx` → `TabRouter.tsx`; editor state in one store, `src/context/MuqsitContext.tsx`; server state in `src/hooks/use*.ts` (React Query); pure clinical logic in `src/lib/*.ts` with a co-located `*.test.ts`.
- **Clinical logic gets a unit test** (same-medicine matching, offered doses, which alert fires). A red test is a clinical regression — check the source before changing the expectation.
- **DB:** one shared PostgreSQL on the VPS, reached through an SSH tunnel the user runs. `P1001` = tunnel down, ask the user; not a code bug. Applying a migration locally migrates production.
- **Deploy:** push to `main` → `.github/workflows/deploy.yml` builds and `pm2 restart all` (~2–3 min). It does not run migrations. If a VPS `package-lock.json` drift blocks `git pull`: SSH in, `git checkout -- <app>/package-lock.json`, re-run the Action.
- **Dates:** stored/shown `dd/mm/yyyy`, `ptDate` is ISO; `ddmmyy` shorthand accepted.
- **Git identity:** every commit and push as `Muhammad-AIUB <mjubayer.aiub@gmail.com>`. The machine's default is wrong — check `git config user.email` and `gh auth status` before committing and before pushing.
- Commits: conventional (`fix(scope): …`), ending `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Every route change updates `docs/API.md` in the same commit.
- Reply to the user (a physician) in Bangla; code and comments stay English.

## Patterns We Do Not Use
- We do not run `npm run prisma:migrate` / Prisma Migrate. Edit `schema.prisma`, write an idempotent `server/prisma/manual-<name>.sql` (`IF NOT EXISTS`), apply with `db execute`, regenerate — the DB is shared with production, so only additive changes.
- We do not run `prisma generate` with the API up. Kill the :4000 process first — Windows locks the query-engine DLL (EPERM).
- We do not take the doctor from `req.user.id` or a request body. Use `@WorkstationDoctorId()` — `WorkstationGuard` is the only place that decides whose practice a request acts on.
- We do not resolve a practice again inside a service. Pass the resolved `doctorId` in — a second resolver leaked another practice's activity feed (fixed 2026-08-27).
- We do not add a client field without adding it to the DTO — otherwise it is "saved" and silently dropped.
- We do not assume a `manual-*.sql` file was applied. Check the DB — `manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` may still be unapplied.
- We do not leave a table created as `postgres` with that owner. Run `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.
- We do not parse a stored date with `new Date(str)`. Use `client/src/lib/dateInput.ts` — JS reads `03/06/2026` as 6 March.
- We do not put `medicines` in `schema.prisma`. It is a raw table queried with parameterised `$queryRaw`.
- We do not reword, add or "fix" entries in `client/src/data/rxAlerts.ts`. Every message is verbatim from the physician's rule sheets.
- We do not print or persist prescribing alerts. They are derived live; `prescriptionDoc.ts` has no alert input, pinned by tests (physician's decision).
- We do not `increment: 1` a habit/phrase `patientCount`. It counts distinct patients, taken from the record.
- We do not let a derived-feature write fail a prescription save. It runs awaited, in try/catch, after `prescription.create`.
- We do not hard-delete clinical documents or add DELETE routes for learned suggestions. Use soft removal (`removedAt`) / `hidden`.
- We do not extend `WorkstationsService.resolve` for IPD ward-team logins. That would hand a ward nurse the whole practice's OPD records.
- We do not send new per-admission data through the IPD `clinical` PATCH. It replaces the whole column; give it its own route (see `/ipd/:id/analogue`).
- We do not store upload URLs minted on localhost. The dev DB is production; `upload.service.ts` refuses them.
- We do not instruct manual deploys or builds on the VPS. Push to `main`; only DB migrations are manual.
- We do not point a test at `DATABASE_URL` from `.env`. It is production behind the tunnel; DB-backed tests use the container on `127.0.0.1:5544` and `assertTestDatabase()` refuses anything else. `prisma db push` is allowed only inside `server/test/support/setup-db.js`, which forces both URLs to that container.
- We do not retry a flaky test. A test whose outcome varies is a defect; find the cause (clock, order, timeout) with `scripts/test-repeat.mjs`.
- We do not change a test to make a real defect pass. It stays as `it.failing` / `it.fails` with a `DEFECT-` comment until the code is fixed.
- We do not colour a status with the brand colour. `C.pri` (blue) is for what can be pressed or is selected; "done / normal / saved / stable" is `C.ok` (green). The brand was green until 2026-10-05 and doubled as "fine" — a normal BMI and a Save button were the same colour.
- We do not load a font, a script or a stylesheet the UI needs from a third-party CDN. A hospital network that blocks Google turned the whole app to the system font; DM Sans is in `public/fonts` of both apps, and the E2E request guard allows no outside origin.
- We do not use an emoji as an icon, and we do not turn a text glyph a doctor reads (✎ ⊘ 💊 ★ ↺ ↳ ℞) into one. Chrome icons are `client/src/components/common/Icon.tsx`; the list of glyphs that stay text is in `client/CLAUDE.md`.
- We do not make a `div` or `span` clickable without `pressable()` (`client/src/lib/a11y.ts`), or ship an icon-only button without an `aria-label`. 26 controls had no keyboard route and 16 buttons had no name.
- We do not change a colour, size or spacing in `prescriptionDoc.ts` as part of an app restyle. It imports no theme on purpose; its five accent rules were moved to blue once, by the physician's decision, with the whole-document snapshot updated in the same commit.
- We do not call `window.confirm` or `window.alert` in the doctor app. Use `confirmAction()` / `tell()` (`client/src/lib/dialogs.ts`); the admin console draws its own since 2026-10-09 (`Dialog` in `admin/app/page.tsx`). The browser lets a user switch its boxes off for the page — after that a `confirm()` answers "no" unseen and an `alert()` says nothing, including "the prescription was saved but could not be printed". And because the app's own question does not freeze the page, fix what is being removed before the `await` and re-read the list and the loaded patient after it (2026-10-06).
- We do not set `inert` — or any attribute React does not manage — through a bare ref. Use `useInert()` (`client/src/lib/inert.ts`). React re-uses the wrapper's DOM node for the content it wrapped, and a hand-set attribute stays on it: the editor came back from the patient gate with a patient chosen and nothing in it could be typed into; `Lock` had the same trap (2026-10-06).
- We do not name a form box only by its placeholder. The caption stays above the box (`fieldLabel`); on the admit form Bed, Room no and Cabin / ward no were three numbers in a row with nothing left to say which was which.
- We do not show a failed list as a line of red text. `LoadError` says what did not load and offers Try again; without it the only retry is reloading the app with a prescription half written. Never the raw `error.message`, never "Is the API running?".
- We do not size anything against the screen with `vh` / `vw` in the doctor app. The whole page is drawn at `zoom: 1.12`, and a viewport unit inside it is scaled too: `100vh` is 112% of the screen. The sign-in page always scrolled, and the image viewer opened a portrait order sheet with its top and bottom edges off the screen and its last line under the zoom bar. A page uses `.screen-fill` / `.mobile-shell-fill`; a popup takes `maxWidth` / `maxHeight: "100%"` from the padded veil it stands in (`client/CLAUDE.md`, the page-zoom rule; 2026-10-09).
- We do not add a pointer's travel or a measured rect to a `position: fixed` coordinate, a `translate()` or a scroll offset without `zoomScale()` (`client/src/lib/dropdownAnchor.ts`). The first two are in screen px, the others in the page's own: the medicine list hung 12% off the line being written — 54px low for a line 433px down the screen, which put it under the NEXT medicine — and a dragged sheet ran ahead of the finger holding it.
- We do not ask the browser to write a date, a time or a number without naming the locale (`toLocaleString()`, `toLocaleDateString()`). It answers in the machine's own language and order: `10/9/2026` for the 9th of October beside this app's `09/10/2026`, three different orders on two ward screens, and an absolute neutrophil count of 1500 written `1.500` in a German browser. A timestamp goes through `client/src/lib/stamp.ts` (`9 Oct 2026 · 17:04`), a calculator's number through `grouped()` (`client/src/lib/calculators/format.ts`); the admin console has `stamp()` / `ddmmyyyy()` of its own.
- We do not draw a control over a page that is open to be read. In the image viewer the arrows sat on a phone-wide order sheet and the zoom bar on its last line; at fit the whole page is on the screen with room kept for the controls (`LIGHTBOX_CSS`).
- We do not open anything over the app without `useDialog()` (`client/src/lib/useDialog.ts`). A popup that only listens for Escape leaves the focus on the page underneath: with the print sheet covering the screen, three presses of Tab reached the patient chat's message box, where Enter sends. A new popup's test runs `itKeepsTheKeyboard()` (`client/src/test/dialogKeyboard.tsx`), and one that shows an `<iframe>` listens for keys inside it too — a key pressed in a frame never reaches the app (2026-10-12).
- We do not hand the focus back to a button that SAVES. Every popup returns the focus to what opened it, and pressing an opener again normally just opens the popup again — but the print sheet is opened by "Save & print", and with the focus back on it Enter or Space (the key that scrolls a page) filed the same consultation as a second Prescription row. That sheet closes with the focus on the page (`useDialog(…, { returnFocus: false })`); `e2e/tests/print-sheet.spec.ts` holds it with a real keyboard (2026-10-12, caught in review before release).
- We do not let a listener on the whole document guess what an element is for. A caption that puts the cursor in its box is a `<label data-caption>`; the first rule was "any label with no control in it", and "Mirror devices" — a switch drawn as a label — sent the cursor into the patient search on every press. An element opts in by saying what it is, and a thing that is pressed is a `<button>`.
- We do not cut a medicine's label at its END to fit a narrow column. A label starts with its dosage form: `Tablet. Entaliv 0.5 mg` and `Tablet. Entaliv 1 mg` both became `Tablet. Enta…` on a phone's health-trend chart — two bars under one name. The dosage form gives way first, then the end of the brand; the strength is the last thing cut (`nameLines` in `client/src/lib/timelineLabel.ts`). And "the dosage form" is not whatever stands before the first full stop — `Pot.` and `Sod.` are part of a name, and left off they made potassium and sodium chloride one; `IV Infusion.` is a form the app does not know by name, and treated as part of the name it took the whole line from the brand. Three reviews found three such cases; a property over many names found two more that examples had not.
- We do not promise, from a rule for ONE name, that two names will come out different. Two lines of thirteen letters do not hold every label, and whatever a rule leaves off, some pair differs in exactly that: with the rule above in place a tablet and an injection of one medicine and strength were one name on a phone's chart, two salts of calcium another, and four parameters of Hb electrophoresis four lanes all called `Hb / Electrophores…` — while the code and three documents said "never" (fourth review, before release). The names of one chart are laid out TOGETHER (`namesApart`): any that come out the same are laid out again from where they differ. And a property that says "never" is run over pairs BUILT to be mistaken for each other — the one that passed had left out every pair of brands sharing three letters.
- We do not put a space, or anything else, inside a number in order to show it — and we do not guess from a string which comma is which. The Investigation popup spaced every comma of a stored result, so `ANC 1,500` was shown `ANC 1, 500`; the first fix kept together whatever LOOKED like a grouped number, and showed ETT's `METs:10` and a report beginning `150 bpm` as `METs:10,150 bpm`. The catalog says which values can hold several parts — only a test that has, or ever had, several boxes — and everything else is shown as stored (`client/src/lib/findingParts.ts`). A display rule that is right for one test's values and wrong for another's is not a fix, and neither is one that is tested beside the line that applies it: the panel's own line was wrong twice with the rule's tests green.
- We do not plot part of a number. The parts of a stored result are joined by commas — a comma and nothing else, no space — so a comma with a digit directly on each side of it cannot be read: `WBC:1,200` is 1,200, or 1.2, or a 1 and another box's 200. What stands on either side of such a comma is not plotted (`client/src/lib/numericInvSeries.ts`); a comma followed by a space is punctuation, and what a typed comma MEANS is the physician's to say. It took three reviews, each finding a wrong number already in production: `1,200` drawn as 1; then `1,200/cmm`, because the guard knew one shape of what follows; then a ferritin typed `>2,000` drawn as 0, because nobody had looked at the comma from its OTHER side. A guard is written for the thing itself, not for the one case that was reported — and tested over every box of the catalog.
- We do not call a rule tested by an assertion that would hold with the rule broken. "The calendar's arrows choose no date" passed with nothing typed — and what the rule protects is the half-typed result that choosing a date files. A test that something does NOT happen starts from the state in which it would, and is checked once by breaking the code.
- We do not convert, or record, a number we have not read whole. `parseFloat` reads the start of a text and stops: in a two-unit result box a viral load typed `1,20,000` copies/mL was converted from its first group and recorded — and printed — as `0.18IU/mL` (in production until 2026-10-12). Only a whole, plain number is converted; anything else is recorded exactly as typed, in the unit of the box it was typed in (`client/src/lib/twoUnitValue.ts`). Never `parseFloat` / `parseInt` on something a doctor typed without first checking that ALL of it is the number.
- We do not shrink a drawing that carries numbers to fit a narrow screen. The health-trend chart was drawn at half size on a phone and a lab value stood 5px tall — a number a doctor cannot read is one they will guess. It keeps its size and scrolls sideways; its names stay put as a second window on the same drawing.
- We do not let a key that MOVES also CHOOSE. In the Investigation calendar the arrows move along the days and only Enter, Space or a click chooses one, because choosing a day files whatever is half typed under the old date.
- We do not keep a second copy of loaded data for a button to act on. The personal note held a `draft` that an effect copied the loaded note into, with a "changed" flag beside it. The copy arrived one render late — Print pressed in that instant printed an empty note and skipped the question a note with sensitive text must ask; no hand is that fast, a test was, one run in four, and `scripts/test-repeat.mjs` is what named it: a test whose outcome varies is telling the truth about the code. And Save marked everything "saved", also what was typed while the request was on its way: those words were thrown away, or left on the screen looking saved while Print read the older text. The note has ONE text — what was typed, else what is saved — which the box shows, Save sends and Print prints; and a save clears only what it SENT (`client/src/components/prescription/PersonalNote.tsx`, 2026-10-12).
- We do not let an open popup follow the editor's patient. The personal note was handed `currentPatientId` on every render; another device moving the editor on (device mirroring), or a patient still loading from the OPD queue, changed it under the open box — and words typed for one patient were saved into the next one's note, under the next one's details. A popup that writes to a patient is opened FOR that patient: the id and the details are fixed at the press, and it stays theirs until it is closed (fourth review; in production until 2026-10-12).
- We do not take a field's report of its own text as an edit. The note's editor reports on every blur, typed in or not, and an untouched note asked about unsaved changes; compare with what is held before calling anything changed.
- We do not enable the ECC plugin in this repo. Its hooks have not been checked against these safety rules.

## Read First
- `docs/DOMAIN.md` — every domain concept (workstation, assistant, supervised doctor, wards, habits, alerts, drug-history mirror…) with the physician's decisions behind it.
- `server/CLAUDE.md` — the access table, scoping rules, auth and upload gotchas; required before any server change.
- `client/CLAUDE.md` — clinical-accuracy rules for alerts, habits, printing, dates; required before any client change. (`admin/CLAUDE.md` for the admin app.)
- `FUNCTIONAL-AUDIT.md` — what works, what is a stub, and the "Open threads" awaiting product-owner decisions; read at session start.

---
This file is a living document. Whenever an implementation gets rejected or corrected during a task, add the lesson to 'Patterns We Do Not Use' — a rule plus its reason, not just a prohibition.
