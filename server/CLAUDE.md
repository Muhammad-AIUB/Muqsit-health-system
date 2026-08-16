# server/CLAUDE.md — NestJS API

NestJS 10 modular monolith, global prefix `/api`, Prisma 5.22 → shared VPS PostgreSQL (see root CLAUDE.md for the tunnel/migration workflow). Express platform, `trust proxy 1`, JSON body limit 8 MB, uploads served from `/uploads`.

## Module map (src/)

`auth` (cookie JWT + refresh rotation + OTP email verify) · `users` · `admin` (registrations, tier changes, evict) · `assistants` (doctor→assistant links + permission keys) · `wards` (IPD wards + their teams) · `workstations` (X-Workstation resolution) · `patients` (records, galleries, summaries, family tree, supervised access) · `prescriptions` + `prescription-draft` + `prescription-layout` + `templates` · `opd` / `ipd` (queues, admissions, follow-ups) · `patient-chat` (per-patient team chat + PatientSupervisor + `/supervised`) · `activity` (audit feed) · `medicines` (search) · `mirror` (SSE device mirroring) · `uploads` · `mail` · `research` · `prisma`.

## ⚠️ Rule 1 — every patient-data query is doctor-scoped

Controllers touching practice data use `@UseGuards(JwtAuthGuard, WorkstationGuard)` and take the doctor from `@WorkstationDoctorId()` — **never** from `req.user.id` directly, and never trust a client-sent doctorId in the body. `WorkstationGuard` resolves the `X-Workstation` header: absent/own id → own context; a doctor the user actively assists → that doctor + granted permission keys; anything else → 403.

## ⚠️ Rule 2 — the patient access model (do not widen casually)

| Action | Owner | Assistant (via workstation) | Supervisor (PatientSupervisor) |
|---|---|---|---|
| find by mobile / open / update patient | ✅ | ✅ (as the owner) | ✅ (`accessibleWhere`: owner OR `supervisors.some({doctorId})`) |
| create prescription on the patient | ✅ | ✅ | ✅ — stored under the **supervisor's own** `doctorId` |
| list prescriptions | own `doctorId` only — a supervisor never sees the owner's Rx and vice versa | | |
| DELETE patient | ✅ **owner-only, always** | ❌ | ❌ |

If you add a new patient-scoped endpoint, decide explicitly which column of this table it belongs to and mirror the corresponding `where` shape from `patients.service.ts`.

**Narrower than the table above:** `hmDrugDates` / `hmSymptomDates` (the Health-trend-chart duration overrides) are **owner-only**, and the two denials come from **different layers** — both load-bearing:

| Caller | Stopped by |
|---|---|
| Assistant in the owner's workstation | `patients.controller.ts#update`: `ws.role !== 'owner'` + the key is present → 403 |
| Supervising doctor | *Not* the controller — they act under their **own** workstation, so `ws.role` is `'owner'`. The `patient.doctorId !== doctorId` check in `patients.service.ts#update` is what stops them |

`hmDrugDates` used to sit in the assistant `RX_LIFECYCLE` bypass set — deliberately removed; don't put it back without a permission key. `PATCH /patients/:id` is the **only** route that accepts `UpdatePatientDto`, and these fields are declared on it alone (not on Create/Link), so `ValidationPipe({ whitelist: true })` strips them everywhere else. One door — keep it that way.

**Deleting a doctor must not delete their patients.** A patient is not the property of the account that registered them: the same person returns to a different doctor and is found again by mobile. `admin.service.ts#hardDelete` therefore does a plain user delete and lets `Patient.doctorId`'s `onDelete: SetNull` keep the row, its demographics and its durable history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `familyMembers`). That doctor's own `Prescription` rows still cascade, which is consistent — they were never visible to another doctor. **Known gap:** `accessibleWhere()` matches `{ doctorId }` OR an assigned supervisor, so a patient left with `doctorId = null` is retained but **not reachable** through the mobile lookup. Making unowned patients findable exposes PII across practices and needs its own access design — do not bolt it onto a delete path.

## ⚠️ Rule 2b — an IPD team is NOT a workstation

`wards` (2026-08-15) models a ward and the team that works it: `Ward` (one per
practice, unique name), `IpdTeamMember` (ward + user + `ipd.*` permission keys),
and `IpdAdmission.wardId`.

Two things about it are load-bearing:

- **Every handler in `wards.controller.ts` passes the signed-in user's OWN id**,
  never `@WorkstationDoctorId()`. Deciding who may reach admitted patients is the
  owner's call; an assistant inside the practice must not be able to put anyone
  (least of all themselves) on a ward team. Same posture as `AssistantsController`.
- **`wardId` in an admission body is validated against the doctor's own wards**
  (`ipd.service.ts#resolveWard`) and the ward's real name is written back into
  `wardNo`. A foreign id in a request body widens access exactly like a forged
  header would; an unknown ward is refused rather than silently dropped, so the
  doctor is never left believing a ward team can see a patient it cannot.

**The remaining half — letting a team member log in and reach the ward — is NOT
built, and must not be done by extending `WorkstationsService.resolve`.** Every
patient-data controller reads `workstationDoctorId`, so the moment a ward
membership resolves to a workstation, that member has the practice's patients,
prescriptions and OPD queue too — a ward nurse would silently gain the OPD
record of someone who was never on their ward. Build a narrow IPD-only door
instead: `ipd.service` resolves ward membership itself and returns only that
ward's admissions, and nothing else in the app changes shape.

## ⚠️ Rule 2c — `DoctorRxHabit` is DERIVED, and its write path is load-bearing

`rx-habits` (2026-08-17) learns a doctor's repeated prescribing instructions and
offers them back in the ℞ pad. The domain rules are in the root `CLAUDE.md`;
these are the ones that live in this app's code and are easy to break.

- **The write is awaited, in a try/catch, AFTER `prescription.create` returns.**
  All three parts matter and each was chosen against a specific failure:
  *outside the prescription write*, because a habit failure inside it would roll
  back a prescription the doctor believes was saved and has already printed;
  *awaited*, because every deploy restarts pm2 and a detached promise in flight
  at that moment is simply lost; *caught*, because a convenience must never fail
  the single most important write path in the product.
  `prescriptions.service.spec.ts` is a REGRESSION spec for exactly this — if you
  touch `create()`, it is the test that says whether you broke the record.
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
- **The boot check never throws.** `onModuleInit` runs one `SELECT 1` and logs a
  single ERROR naming `manual-rx-habits.sql` if the table is unreadable. Because
  the doctor is shown silence on failure by design, the log is the ONLY place a
  dead feature announces itself — and this repo already has two committed-but-
  unapplied manual migrations to prove that matters.
- **`RxHabitsModule` imports `WorkstationsModule`.** `WorkstationGuard` injects
  `WorkstationsService`, and Nest resolves that at BOOT: `npx tsc --noEmit` is
  green without the import and the API then crash-loops on start. Typecheck is
  not enough for a new guarded module — start the server.
- **Repair, never hand-edit:** `node scripts/rebuild-rx-habits.js [--dry-run]`
  recomputes the table from `Prescription`/`PrescriptionItem`, one transaction
  per doctor, and re-applies `pinned`/`hidden` **by content**. Do not "simplify"
  that to a `signature` join — a signature is the OUTPUT of the normalisation
  algorithm, so the day a rule is edited every signature changes, every flag
  orphans, and every deliberately suppressed dose comes back silently. The
  script loads `normalise.ts` from `dist/` (or via ts-node) rather than
  reimplementing it, and must stay `.js` — see the `rootDir` trap below.

## ⚠️ Rule 3 — ValidationPipe strips unknown fields

`main.ts` uses `ValidationPipe({ whitelist: true })`. **Any new field the client sends must be added to the DTO** (`src/*/dto/*.ts`) or it is silently dropped — a classic "saved but nothing persisted" bug. For JSON columns follow the existing pattern in `patients.service.ts#update`: destructure the field, cast via `Prisma.InputJsonValue`, use `Prisma.DbNull` for explicit nulls.

## Auth architecture (don't regress these)

- Access token `mhs_at` (15 min) + refresh `mhs_rt` (rotated, path `/api/auth`), both httpOnly. `publicUser()` must keep returning `accountTier` — the client's tier gates read it from the login/refresh response.
- **Rotation grace window (30 s)** in `auth.service.ts#refresh`: a just-rotated token presented again while the family has a live successor is a benign concurrent-refresh race (multiple tabs / client+admin share the cookie) → issue a fresh token. Only replay after the window, or against a dead family, revokes the family. Removing this brings back the "everyone logs out on reload" bug.
- Client `apiFetch` silently refreshes once on 401 and only logs out on a definitive rejection; keep server semantics compatible.
- `revokeAllForUser` is the admin evict path; sessions die within one access-token lifetime.

## Prisma specifics

- Regenerating on Windows requires the dev server stopped (root CLAUDE.md). If a freshly added column isn't in the generated client yet, the codebase uses loose casts (`const extra = rest as Record<string, unknown>`) — acceptable short-term, regenerate ASAP.
- JSON columns carrying medical history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `incompleteRx`, `familyMembers`, IPD `clinical`) are **append/merge on the client, whole-value writes on the server**. Never "fix up" their contents server-side without an explicit migration script.
- Seed: `npm run seed` (needs `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`).

## SSE mirror

`mirror` fans out editor snapshots per user in-memory. The `@Sse('stream')` route sets `X-Accel-Buffering: no` — required or nginx buffers the stream in prod and mirroring "stops working". Keep it on any new SSE route.

## ⚠️ Adding a `.ts` file OUTSIDE `src/` can take production down

Happened 2026-07-30: `scripts/sms-test.ts` was added, CI deployed, and the API
served **502** until it was reverted-by-fix. Nothing was wrong with the file.

`tsconfig.json` sets **no `rootDir`**, so TypeScript infers it from the common root
of the input files. Every `.ts` used to live under `src/` (`scripts/` held only
`.js`/`.py`, `prisma` and `test` are excluded), so the inferred root was `src/` and
`nest build` emitted `dist/main.js`. Add one `.ts` anywhere else and the common root
becomes the project root: output silently moves to `dist/src/main.js`, `start:prod`
(`node dist/main`) can't resolve it, pm2 crash-loops, nginx returns 502.

`tsconfig.build.json` now excludes `scripts`, so that one path is safe. Anything
else outside `src/` (a `tools/`, a root-level `foo.ts`) reintroduces it.

**`npx tsc --noEmit` cannot catch this** — it type-checks and emits nothing, so it
is green either way. Before pushing a new file outside `src/`, run the real build
and check the artifact:

```bash
cd server && rm -rf dist && npm run build && ls dist/main.js
```

No `dist/main.js` means the deploy will 502. The permanent fix is an explicit
`"rootDir": "./src"` in `tsconfig.json`, which turns the silent move into a compile
error; not done yet because it needs its own verification pass.

## Gotchas

- **The medicine database is a raw Postgres table `medicines` that is NOT in `schema.prisma`** — `medicines.service.ts` queries it with `$queryRaw` (bound params, brand-before-generic ranking). Don't look for a Prisma model, don't let a destructive schema push touch it, and keep any new query parameterized.
- Email (OTP verification, notifications) is nodemailer over SMTP — `SMTP_HOST/SMTP_USER/SMTP_PASS` env. Without them the transporter is null (dev): signup OTP won't arrive; that's configuration, not a bug.
- **SMS** (`sms/sms.service.ts`, 24bulksmsbd) — `SMS_CUSTOMER_ID/SMS_API_KEY`, optional `SMS_API_URL`. Same unconfigured-is-fine posture as mail: it logs instead of sending. **`SmsModule` is deliberately NOT in `AppModule`** — nothing consumes it yet (it exists for the cross-practice OTP-consent design). Wire it in when a caller lands. Two rules if you do: `send()` returns `{ok, detail, ms, raw}` and must never be `void`-ed into a swallowed catch — a lost access code that nobody hears about is the whole failure mode; and the gateway answers **HTTP 200 for business failures too** (bad key, no balance), so status alone is not proof of delivery, which is why the body is pattern-checked and the first few raw responses are logged. Numbers go through `normaliseBdMobile()`, which refuses anything that isn't `01[3-9]XXXXXXXX` rather than guessing — a guessed digit sends a patient's code to a stranger.
- `CORS_ORIGIN` env is a comma list and must include every frontend origin (localhost:3000/3001 + prod domains) — a missing origin looks like random auth failures.
- Activity log (`activity`) is the doctor-facing audit trail; when adding a feature that records clinical input, log it (`section`, `detail`, optional `imageUrl`) so it appears in "Notifications, Chats & Reports". `detail` is capped at **400 chars** — trim free-text names (a chief complaint is doctor-typed) before interpolating, or the whole log call 400s.
- Uploaded files are on-disk under `uploads/` (served at `/uploads/<file>`) — hosted URLs, never base64 into the DB. `server/.gitignore` anchors this as `/uploads/`: an unanchored `uploads/` **also matched `src/uploads/`**, the upload module, so a new file added there was silently untracked and never deployed. Keep the leading slash.
- The upload size limit is **8 MB on purpose**. `compressImage()` on the client returns the ORIGINAL file whenever `createImageBitmap` throws (HEIC on most desktop browsers), for GIFs, and whenever the re-encode isn't smaller — and `upload.service.ts#checkMagic` accepts `heic`/`heif`/`avif` deliberately. iPhone report photos are routinely 3-8 MB; a tighter ceiling rejects real uploads. The hardening that matters is the magic-byte check, not the last few MB.
