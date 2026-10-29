# Muqsit Health System — Technical Requirements Document

How the system is built, the constraints it is built under, and the rules that keep it safe. Product intent lives in [PRD.md](PRD.md); data shapes in [Schema.md](Schema.md); every route in [API.md](API.md); screens in [UI_Spec.md](UI_Spec.md) and [AppFlow.md](AppFlow.md).

> ⚕️ Doctors in Bangladesh prescribe real medication through this software. Where a technical convenience conflicts with a safety rule in §3, the safety rule wins.

---

## 1. System overview

| App | Folder | Stack | Port | Role |
|---|---|---|---|---|
| Doctor app | `client/` | Next.js 14 (App Router), React 18.3, TypeScript 5.5, React Query 5 | 3000 | Prescribing, OPD, IPD, patients, settings |
| Admin console | `admin/` | Next.js 14 | 3001 | Registration review, tier changes, account trash |
| API | `server/` | NestJS 10, Prisma 5.22, PostgreSQL | 4000 (`/api`) | REST, cookie JWT, SSE |

The repository root only orchestrates (`concurrently`). Each app has its own `package.json`.

```
 Browser (doctor)         Browser (admin)
      │  cookies + X-Workstation   │  cookies
      ▼                            ▼
 ┌─────────┐                 ┌─────────┐        ┌────────────────────────────┐
 │ client  │                 │  admin  │        │         proxy (VPS)        │
 │ :3000   │                 │  :3001  │        │  TLS, HTTP/2 → pm2 apps  │
 └────┬────┘                 └────┬────┘        └──────────────┬─────────────┘
      └──────────────┬────────────┘                            │
                     ▼                                         ▼
              ┌──────────────┐   Prisma + $queryRaw     ┌─────────────┐
              │ server :4000 │─────────────────────────►│ PostgreSQL  │
              │ NestJS /api  │                          │  (shared)   │
              └──────┬───────┘                          └─────────────┘
                     │ /uploads (disk), SSE /mirror/stream, SMTP (OTP mail)
```

Production hosts: `muqsithealthsystem.com` (doctor app), `api.muqsithealthsystem.com/api`, `admin.muqsithealthsystem.com`. The three are unrelated origins, so cookies need `Secure` + `SameSite=None` and CORS must list every frontend origin.

### Request path

```
client/src/lib/api.ts#apiFetch   (credentials: include, X-Workstation)
   → Nest controller   @UseGuards(JwtAuthGuard, WorkstationGuard)
   → @WorkstationDoctorId()
   → service           (receives the resolved doctorId; never resolves it again)
   → PrismaService     (or parameterised $queryRaw for `medicines`)
```

## 2. Functional-technical requirements

| # | Requirement | Where it is implemented |
|---|---|---|
| T1 | Cookie-JWT sign-in with rotating refresh tokens, OTP email verification, admin approval gate | `server/src/auth`, `admin` |
| T2 | Every patient-data request resolves to exactly one practice | `WorkstationGuard`, `WorkstationsService.resolve` |
| T3 | The editor survives reloads and dropped connections | `PrescriptionDraft`, `Patient.incompleteRx`, `SupervisedDraft`, `client/src/lib/rxPadHold.ts` |
| T4 | A save whose answer is lost never files twice | `server/src/prescriptions/repeat.ts`, `client/src/lib/sendAgain.ts` |
| T5 | Prescribing alerts are computed live and never stored or printed | `client/src/data/rxAlerts.ts`, `rxAlertsByLine` |
| T6 | Print/PDF reproduces exactly what was entered | `client/src/lib/prescriptionDoc.ts` |
| T7 | Several devices of one user mirror each other | `server/src/mirror` (SSE) |
| T8 | Medicine search over a large catalogue stays fast | raw `medicines` table, equality-on-first-word lookup (`server/src/medicines/catalogue.ts`) |
| T9 | Doctor's own habits, phrases and advice are learned without inventing content | `rx-habits`, `doctor-phrases`, `drug-advice` modules |
| T10 | Bangla and English typing, dates in `dd/mm/yyyy` | `lib/banglaInput.ts`, `lib/rxLanguage.ts`, `lib/dateInput.ts` |
| T11 | Dark and light UI; printouts identical in both | `client/src/theme/palette.ts` |

## 3. Safety constraints (non-negotiable engineering rules)

These come from the project's `CLAUDE.md` files and beat any convenience or skill workflow.

1. **No guessed clinical content.** Formulas, ranges, units, doses, score cut-offs and alert text come from a verified source or from the physician. `client/src/data/rxAlerts.ts` is verbatim from the physician's rule sheets — never reworded or extended.
2. **No silent loss or transformation of patient data.** No destructive migration, no dedupe that can drop a finding. Deleting is an explicit action with a confirm.
3. **Scoping is a safety boundary.** See §5.
4. **Print is a legal document.** It fits the page, never truncates, and shows exactly what was entered.
5. **Derived features never fail a save.** Habit learning runs awaited, in a try/catch, *after* `prescription.create` returns.
6. **A number is never read in part.** `parseFloat`/`parseInt` on typed text is only allowed after checking that all of it is the number (`lib/twoUnitValue.ts`, `lib/numericInvSeries.ts`).
7. **Tests never use the production database.** `DATABASE_URL` in `server/.env` is production behind the tunnel; DB-backed tests use the container on `127.0.0.1:5544`, and `assertTestDatabase()` refuses anything else.
8. **Docs move with code.** The `CLAUDE.md` files, `docs/DOMAIN.md` and `docs/API.md` are updated in the same commit as the change.

## 4. Server design

### 4.1 Modules (`server/src/`)

`auth` · `users` · `admin` · `assistants` · `wards` · `workstations` · `patients` · `prescriptions` · `prescription-draft` · `prescription-layout` · `templates` · `opd` · `ipd` · `patient-chat` (also `PatientSupervisor` and `/supervised`) · `activity` · `medicines` · `rx-habits` · `doctor-phrases` · `drug-advice` · `patient-notes` · `revision-notes` · `mirror` · `uploads` · `mail` · `research` · `prisma`.

`sms/` exists but is **deliberately not wired** into `AppModule`; nothing consumes it yet.

One module per domain: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`. A new guarded module must import `WorkstationsModule` — `tsc` is green without it and the API then crash-loops at boot.

### 4.2 Global behaviour (`app.setup.ts`)

| Concern | Setting |
|---|---|
| Prefix | `/api`; uploads at `/uploads/` outside it |
| Validation | `ValidationPipe({ whitelist: true, transform: true })` — **an undeclared DTO field is silently dropped** |
| Body limit | 8 MB JSON and urlencoded |
| Rate limit | `ThrottlerGuard`, 100 req/min/IP globally; `/auth`: register 5/min, verify-email 10, resend-otp 3, login 5, refresh 30 |
| Proxy | `trust proxy 1` |
| Headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS (production only). No CSP; `helmet` is not installed |
| CORS | `CORS_ORIGIN` (comma-separated) with credentials; registered **before** the static handler so image bytes carry the header the gallery PDF export needs |
| Static | `/uploads/` cached one year, `immutable` — safe because every upload is a fresh `randomUUID()` name |
| Boot check | Production refuses to start with a `JWT_SECRET` shorter than 32 characters or equal to `dev-secret` |

### 4.3 Authentication

| Cookie | Lifetime | Path | Content |
|---|---|---|---|
| `mhs_at` | 15 min | `/` | access JWT |
| `mhs_rt` | 30 days ("remember me") or session | `/api/auth` | opaque refresh token, SHA-256 hashed at rest |

Refresh rotates inside a *family*. A replayed revoked token revokes the family (theft assumption) except inside a 10-second same-User-Agent grace window, which exists because several tabs and both frontends share one cookie.

Client side, `apiFetch` retries a 401 once after a single in-flight refresh (a burst of 401s starts one refresh, not many). Only a definitive "rejected" from the server ends the session; an unreachable server does not log the user out.

Sign-up: `register` (account created `pending`, tier `secondary`) → 6-digit OTP by email (5 attempts per code) → admin approval in `admin/` → optional promotion to `primary`/`premium`, which unlocks an own workstation.

### 4.4 Data access rules

- Parameterised Prisma or `$queryRaw` only. `medicines` is a raw table.
- **A read-modify-write of a JSON column takes a row lock** (`SELECT … FOR UPDATE`), e.g. `ipd.service.ts#lockAdmission` and the family-tree link.
- **A transaction that waits for such a lock uses `ROW_LOCK_TX`** (`server/src/prisma/row-lock.ts`: 30 s, 10 s connection). Prisma's 5 s default counts the *wait*, so writes at the back of a queue answered 500 on a busy server and the page was not filed.
- Per-doctor advisory locks serialise `POST /prescriptions` and the two OPD writes.
- Lines added to drug history after a print are appended **by the server** under the row's lock; a device never sends the whole list.
- `PATCH /ipd/:id` replaces `clinical` wholesale. New per-admission data gets its own route.
- A query is not "fast" until it has met a table the size of production (35 000-row load-test catalogue, `muqsit_load_test`, never the tunnel).

### 4.5 Idempotent prescription save

`create()` takes an advisory lock per doctor and patient and answers a request identical to this doctor's *latest* prescription for the patient from the last 30 minutes (`REPEAT_WINDOW_MS`) with that one: `201`, same shape, `repeat: true`, no second row, nothing learned twice. "Identical" is every field the DTO can carry and every line; `repeat.spec.ts` reads the DTO metadata and fails when a field is added without a line in `repeat.ts`.

### 4.6 Uploads

`POST /uploads/image` is public on purpose (registration uploads NID and certificates before an account exists). Bounded by the throttler, an 8 MB limit, one part named `file` (text fields refused), and a **magic-byte** check — the multipart `Content-Type` is not consulted.

- Accepted: JPEG, PNG, GIF, BMP, WEBP, AVIF, HEIC/HEIF, TIFF. SVG and PDF are refused.
- The client converts HEIC and TIFF to JPEG first (`lib/decodeImage.ts`).
- Stored on the API's disk under a random name; the DB holds the absolute URL built from `PUBLIC_URL`, never base64.
- **A localhost `PUBLIC_URL` answers 503 before the file is written**, because the development database is production and a `localhost` URL in a patient record opens nowhere.

### 4.7 Device mirroring

`GET /mirror/stream` (SSE) and `POST /mirror/publish`, scoped to the signed-in user's own sessions, in-memory fan-out. The first event is `hello` with a `connId`. The response must carry `X-Accel-Buffering: no` or the production reverse proxy (nginx, per the API notes) buffers it and mirroring "stops working". In-memory means one API process; running several would need a shared bus.

## 5. Access control

`WorkstationGuard` is the **only** place that decides whose practice a request acts on. Controllers take the doctor from `@WorkstationDoctorId()`, never from `req.user.id` and never from a request body.

| `X-Workstation` | Result |
|---|---|
| absent, or the caller's own id | own practice, `role: owner` |
| a doctor the caller actively assists | that doctor's practice + the granted keys, `role: assistant` |
| anything else | 403 |

Routes that always use the signed-in user's own id and cannot be redirected by the header: `assistants`, `wards`, `prescription-draft`, `prescription-layout`, `prescription-templates`, `research`, `mirror`, `/supervised`, `revision-notes`.

| Action | Owner | Assistant | Supervising doctor |
|---|---|---|---|
| find / open / update patient | ✅ | ✅ (as owner, per key) | ✅ (read, own draft only) |
| create a prescription | ✅ | ✅ needs `rx.savePrint` | ✅ stored under **their own** id |
| list prescriptions | own only | own practice's only | own only — never the owner's |
| write `hmDrugDates` / `hmSymptomDates` | ✅ | ❌ controller | ❌ service (`patient.doctorId` check) |
| append drug history | ✅ | needs any `rx.*` | ❌ 403 |
| **delete patient** | ✅ **owner only, always** | ❌ | ❌ |

- **Permission keys.** Prescription page `rx.*`, patient settings `pt.*`, IPD ward sheet `ipd.*` (ward teams only, absent from the assistant editor). Catalogue: `client/src/lib/permissions.ts`. The UI gate is never the boundary; the API enforces.
- **A ward team is not a workstation.** `WorkstationsService.resolve` must not be extended for ward logins — every patient controller reads the workstation doctor, so that would hand a ward nurse the whole OPD record. A narrower IPD-only door is the intended design; **the team member's own login is not built.**
- **Unknown id = 404.** A foreign id is indistinguishable from a missing one.
- **Private-to-person tables** (`DoctorPatientNote`, `DoctorRevisionNote`) key on the *authenticated* user, never the workstation doctor.
- A new patient-scoped endpoint must be placed explicitly in the table above and mirror the matching `where` shape from `patients.service.ts` (`accessibleWhere`).

## 6. Client design

### 6.1 Structure

```
app/                       thin App Router shells (page.tsx, [tab]/, login/, signup/, settings/)
src/components/Muqsit.tsx  → TabRouter.tsx   (the application shell)
src/context/MuqsitContext.tsx   ONE store for editor state
src/hooks/use*.ts          server state via React Query
src/lib/*.ts               pure clinical/format logic, each with a co-located *.test.ts
src/data/                  rxAlerts.ts · investigations.ts · suggestions.ts
src/theme/palette.ts       the `C` palette (CSS variables)
```

- Styling is inline against the `C` palette; no UI framework. Every colour is a CSS variable (`rawColours.test.ts` fails on a literal), so night mode works and a `#fff` stays white on a night button.
- The whole page is drawn at `zoom: 1.12`. **Never size with `vh`/`vw`** in the doctor app (use `.screen-fill` / `.mobile-shell-fill`), and add `zoomScale()` to any pointer or rect value used for fixed positioning.
- Fonts are self-hosted (DM Sans in `public/fonts`). No third-party CDN for fonts, scripts or styles — a hospital network that blocks Google turned the app to the system font. The E2E request guard allows no outside origin.
- `images: { unoptimized: true }` in both Next apps: the image optimiser carried critical advisories and is unused.

### 6.2 Editor lifecycle (summary)

- One store holds the visit. A debounced auto-save writes it to `PrescriptionDraft` (one row per user); on reload it is re-hydrated.
- An unprinted visit with content is parked on the patient (`incompleteRx`; a supervising practice's goes to `SupervisedDraft`) and shows **Incomplete** in OPD. "Printed" is a short **fingerprint** of what was sent (`lib/visitSig.ts`), compared both ways; a change after printing makes the visit incomplete again. It rides the draft, so a reload does not forget it.
- The ℞ pad's rows are held with the visit while one is on it (`rxPadHold.ts`), so a `>>>` line that lost its medicine is not silently lost.
- The pad and `rxItems` are one synchronised pair (`lib/usePadSync.ts`, one effect); two effects chasing each other crashed the screen.
- A late answer (a reload's draft, a background patient fetch) **merges** against live state, never overwrites it. Every writer that replaces the editor moves the epoch ref so a stale draft is not laid over it.
- A popup that writes to a patient is opened *for* that patient and keeps them until closed.

Full rules: `client/CLAUDE.md` (Editor lifecycle). Read it before changing the store.

### 6.3 Network behaviour

- `apiFetch` sends `X-Workstation`, refreshes once on 401, and re-reads the header on retry.
- **Save & print is built once and sent again as it is** while its answer is lost (`lib/sendAgain.ts`). Only a request the server answers once however often it is sent is ever re-sent automatically. Where no answer comes, the box says the prescription *may* not have been saved, and that pressing again unchanged within half an hour will not file it twice.
- A save that failed or was refused (other than for an empty form) is a `tell()` box in the doctor's words, never a transient green line (`SaveNotice`, `whyNotSaved`). A throw after the prescription was created is never called "not saved".
- Reads that must not silently fail say so: a failed list is `LoadError` with Try again, never raw `error.message`, never "Is the API running?".
- An answer is checked to *be* the list before being read as one (a hospital Wi-Fi sign-in page must not become "no medicines yet").

### 6.4 Printing

`client/src/lib/prescriptionDoc.ts` builds the sheet as HTML. It imports no theme on purpose, has **no alert input** (pinned by tests), and shows what was entered. The header and footer HTML are cleaned by `sanitizeHtml` (images only from a web address or an upload). The signature line is fixed at the foot of every page. After Save & print a PNG of the sheet is filed into the patient's gallery (best effort, keyed by `lastRxImageKey`). **After touching this file, check print preview.**

### 6.5 Accessibility

Anything clickable that is not a `<button>` uses `pressable()` (`lib/a11y.ts`); icon-only buttons need an `aria-label`; anything opened over the app uses `useDialog()` (focus in, Tab trapped, Escape closes, focus returned — except the print sheet after Save & print, which must not return focus to a button that saves); `inert` is set only through `useInert()`; `window.confirm`/`alert` are never used (`confirmAction()` / `tell()` in `lib/dialogs.ts`).

### 6.6 Libraries worth knowing

`@tanstack/react-query`, `html2canvas` (sheet snapshot), `tesseract.js` (OCR), `heic2any` + `utif` (HEIC/TIFF decode), `xlsx` (export only), `fast-check` (property tests), `vitest` + Testing Library. Do not bring a language feature into the page every doctor opens without asking what an older browser will do (a missing regex feature fails the whole page, not one label).

## 7. Environments and configuration

| Variable | Used for |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | PostgreSQL; locally through the SSH tunnel (`P1001` = tunnel down, ask the owner) |
| `JWT_SECRET` | access tokens, ≥32 random chars in production |
| `PORT` | default 4000 |
| `NODE_ENV` | HSTS, secure cookies, secret check |
| `CORS_ORIGIN` | allowed frontend origins |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | cross-origin cookies |
| `PUBLIC_URL`, `ALLOW_LOCALHOST_UPLOAD_URLS` | upload URL base and its localhost guard |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | OTP mail; unset means OTPs silently do not send |
| `SMS_*` | gateway config for the unwired SMS module |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | `npm run seed` |
| `NEXT_PUBLIC_API_URL` | client/admin → API base; needed in both `.env.local` and `.env.production` |
| `NEXT_DIST_DIR` | alternate Next build folder (E2E, production-build timing) |

**Development database = production.** Anything that writes, writes to real records. Browser verification of visual work uses the throwaway sandbox on `:3100`/`:4200`, never `:3000`.

## 8. Build, deploy, operations

- **Branches:** exactly `main` and `dev`. Work on `dev`; releasing is fast-forwarding `main` to it. That push is the deploy.
- **Pipeline:** push to `main` → `.github/workflows/deploy.yml` → SSH to the VPS → `git pull` → build API (`prisma generate` + `nest build`), then client, then admin (admin is non-fatal) → `pm2 restart all`. About 2–3 minutes. Each build runs in a subshell so a failed one stops the script before the restart. The action is pinned to a commit SHA, not a tag, because it holds the VPS key.
- **Migrations are manual** and never run by the deploy (see [Schema.md](Schema.md#migrations)). SQL a release reads must already be applied.
- **A red deploy is not a safe state.** `next build` and `nest build` empty their output folders first, so after a failed build the running app may already be missing files. Fix or revert at once. Building into a separate folder and swapping on success would close this and is **not done**.
- **Never** instruct manual builds on the VPS. If a `package-lock.json` drift blocks `git pull`: SSH, `git checkout -- <app>/package-lock.json`, re-run the Action.
- **After touching a `.ts` outside `server/src/`:** `cd server && rm -rf dist && npm run build && ls dist/main.js` (the build sets `rootDir` and fails with TS6059 instead of silently moving output).
- **Windows dev:** stop the `:4000` process before `prisma generate` (query-engine DLL lock, EPERM).
- **Git identity** for every commit and push: `Muhammad-AIUB <mjubayer.aiub@gmail.com>`; check `git config user.email` and `gh auth status` first.

## 9. Testing strategy

| Layer | Command | Where | Notes |
|---|---|---|---|
| Server unit | `cd server && npm test` | `src/**/*.spec.ts` | includes DTO-vs-comparison drift guards |
| Server integration | `cd server && npm run test:int` | `server/test/*.int-spec.ts` | real Postgres in Docker on `127.0.0.1:5544`; access, auth, contract (reads `client/src/lib/api.ts`), DTO whitelist, repeat save, uploads, row-lock waits |
| Client unit/property | `cd client && npm test` | `src/**/*.test.ts(x)` | vitest, jsdom, `fast-check` |
| Browser E2E | `cd e2e && npx playwright test` | `e2e/tests/*.spec.ts` | Chromium on `:3100` against API `:4200`, throwaway DB, request guard blocks any other host |
| Flake hunt | `node scripts/test-repeat.mjs <server\|int\|client> 3` | root | a test whose outcome varies is a defect, not a retry |
| Typecheck | `npx tsc --noEmit` in `server/`, `client/`, `admin/` | | required before any commit |

Rules:

- Clinical logic gets a unit test (same-medicine matching, offered doses, which alert fires). A red clinical test is a regression: check the source before changing the expectation.
- A real defect stays as `it.failing` / `it.fails` with a `DEFECT-` comment until the code is fixed.
- A sampled property is run once at a hundred times its budget when written or when its rule changes; a red property is read (`FC_SEED` replays it), not re-run.
- A test is checked by breaking a **copy** of the sources, never the checkout the dev servers watch.
- After touching `client/src/lib/api.ts`, run the server integration suite.
- Do not edit files while the browser suite runs; its dev server serves the checkout.
- Speed is judged on a production build (`NEXT_DIST_DIR`), medians of several runs, not on `next dev`.

## 10. Known technical gaps

Carried from the repository's own audit notes; not new findings.

| Gap | Effect |
|---|---|
| Ward-team member login not built | Adding people to a ward does not yet let them reach it |
| Unowned patients (`doctorId = null`) unreachable | Retained but not findable; needs an access design |
| Two uniqueness SQL files possibly unapplied | OPD token and IPD bed collisions rely on service-layer checks |
| Device mirror is in-memory | Single API process only |
| No health-check route, no OpenAPI document | `docs/API.md` is the reference |
| Deploy empties output folders before building | A failed build can leave the running app missing files |
| Next 15 and Nest 12 upgrades open | Remaining advisories are weighed by exposure, not counted |
| Wide-screen health-trend names are still cut at 20 characters | Closing it changes a chart the physician knows |
| `client`/`admin` `npm run lint` has no ESLint config | Do not rely on it |
| Investigation/report image pool in the editor is session-only (per the audit, older) | Verify before relying on either direction |
| Some placeholder views (Message tab, Research Compare/Export, Data security level) | Stubs |

The audit file is [`FUNCTIONAL-AUDIT.md`](../FUNCTIONAL-AUDIT.md); several of its older items have since been closed, so read its dated sections rather than only its top checklist.
