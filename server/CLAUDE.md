# server/CLAUDE.md — NestJS API

NestJS 10 modular monolith, global prefix `/api`, Prisma 5.22 → shared VPS PostgreSQL (see root CLAUDE.md for the tunnel/migration workflow). Express platform, `trust proxy 1`, JSON body limit 8 MB, uploads served from `/uploads`.

## Module map (src/)

`auth` (cookie JWT + refresh rotation + OTP email verify) · `users` · `admin` (registrations, tier changes, evict) · `assistants` (doctor→assistant links + permission keys) · `workstations` (X-Workstation resolution) · `patients` (records, galleries, summaries, family tree, supervised access) · `prescriptions` + `prescription-draft` + `prescription-layout` + `templates` · `opd` / `ipd` (queues, admissions, follow-ups) · `patient-chat` (per-patient team chat + PatientSupervisor + `/supervised`) · `activity` (audit feed) · `medicines` (search) · `mirror` (SSE device mirroring) · `uploads` · `mail` · `research` · `prisma`.

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

## Gotchas

- **The medicine database is a raw Postgres table `medicines` that is NOT in `schema.prisma`** — `medicines.service.ts` queries it with `$queryRaw` (bound params, brand-before-generic ranking). Don't look for a Prisma model, don't let a destructive schema push touch it, and keep any new query parameterized.
- Email (OTP verification, notifications) is nodemailer over SMTP — `SMTP_HOST/SMTP_USER/SMTP_PASS` env. Without them the transporter is null (dev): signup OTP won't arrive; that's configuration, not a bug.
- `CORS_ORIGIN` env is a comma list and must include every frontend origin (localhost:3000/3001 + prod domains) — a missing origin looks like random auth failures.
- Activity log (`activity`) is the doctor-facing audit trail; when adding a feature that records clinical input, log it (`section`, `detail`, optional `imageUrl`) so it appears in "Notifications, Chats & Reports". `detail` is capped at **400 chars** — trim free-text names (a chief complaint is doctor-typed) before interpolating, or the whole log call 400s.
- Uploaded files are on-disk under `uploads/` (served at `/uploads/<file>`) — hosted URLs, never base64 into the DB. `server/.gitignore` anchors this as `/uploads/`: an unanchored `uploads/` **also matched `src/uploads/`**, the upload module, so a new file added there was silently untracked and never deployed. Keep the leading slash.
- The upload size limit is **8 MB on purpose**. `compressImage()` on the client returns the ORIGINAL file whenever `createImageBitmap` throws (HEIC on most desktop browsers), for GIFs, and whenever the re-encode isn't smaller — and `upload.service.ts#checkMagic` accepts `heic`/`heif`/`avif` deliberately. iPhone report photos are routinely 3-8 MB; a tighter ceiling rejects real uploads. The hardening that matters is the magic-byte check, not the last few MB.
