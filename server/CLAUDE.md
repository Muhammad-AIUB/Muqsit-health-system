# server/CLAUDE.md — NestJS API

NestJS 10 modular monolith, global prefix `/api`, Prisma 5.22 → shared VPS PostgreSQL (see root CLAUDE.md for the tunnel/migration workflow). Express platform, `trust proxy 1`, JSON body limit 8 MB, uploads served from `/uploads`.

**Every route is catalogued in `docs/API.md`** — paths, DTO shapes, scoping and the
permission keys each one enforces. Keep it in the same commit as a route change.

Where each thing lives: [`docs/CODEMAP.md`](../docs/CODEMAP.md) §1 — every module with its route prefix, guards and tables, the scripts and the integration specs.

## How this file works

The server's rules — the access model, the derived tables, the queue, uploads, the build traps — are in `docs/rules/<topic>.md`, each with its reason ([index](../docs/rules/README.md), which also says where each section of the old version of this file went). This file is the way in:

- **Before any change that reads or writes patient data**, read [`docs/rules/access-and-scoping.md`](../docs/rules/access-and-scoping.md): the access table (owner / assistant / supervising doctor) is there, and a new patient-scoped endpoint must be placed in it.
- **Rules for every server change** — one line per rule. Read the file named beside a group when one of its lines bears on what you are doing.
- **Before you touch a module** — the file you MUST read before changing that module's code. The lines under it are the entries that had been raised to the root file or are marked ⚕️; they are pointers, and the file holds more than is listed here.
- Open questions, known limits and the physician's answers for the same area: `docs/audit/<topic>.md` — the same file name.
- A new lesson: the full entry and its "At a glance" line go in the topic file; a line goes here only if it bears on every server change or on what a patient is given.

## Rules for every server change

### Access and scoping (workstation, assistants, supervised doctor) → [`docs/rules/access-and-scoping.md`](../docs/rules/access-and-scoping.md)
- The doctor is never taken from `req.user.id` or a request body: use `@WorkstationDoctorId()` — `WorkstationGuard` is the only place that decides whose practice a request acts on.
- A practice is never resolved again inside a service: pass the resolved `doctorId` in (a second resolver leaked another practice's activity feed).
- `WorkstationsService.resolve` is never extended for IPD ward-team logins: that would hand a ward nurse the whole practice's OPD records.
- Practice-data controllers use `JwtAuthGuard, WorkstationGuard` and take the doctor from `@WorkstationDoctorId()` — never from `req.user.id`, never a client-sent doctorId in the body.
- Patient access table (owner / assistant / supervisor): DELETE patient is owner-only, always; a new patient-scoped endpoint must pick its column and mirror the `where` of `patients.service.ts`.
- `hmDrugDates` / `hmSymptomDates` are owner-only, denied by two layers: the controller stops an assistant, the service's `patient.doctorId !== doctorId` check stops a supervisor — both load-bearing.
- Do not put `hmDrugDates` back in `RX_LIFECYCLE` without a permission key; `PATCH /patients/:id` is the only route accepting `UpdatePatientDto` — keep that one door.

### Authentication and sessions → [`docs/rules/auth.md`](../docs/rules/auth.md)
- Access `mhs_at` (15 min) + rotated refresh `mhs_rt` (path `/api/auth`), both httpOnly; `publicUser()` must keep returning `accountTier`.
- Keep the refresh rotation grace window (10 s, same User-Agent only) in `auth.service.ts#refresh`; a different/missing UA is theft; removing it logs everyone out on reload.
- Client `apiFetch` refreshes once on 401 and logs out only on a definitive rejection; keep server semantics compatible.

### Validation and DTOs → [`docs/rules/validation-and-dto.md`](../docs/rules/validation-and-dto.md)
- `ValidationPipe({ whitelist: true })`: any new client field must be added to the DTO or it is silently dropped; JSON columns follow `patients.service.ts#update` (`InputJsonValue`, `DbNull`).

### Database, manual SQL and Prisma → [`docs/rules/db-and-prisma.md`](../docs/rules/db-and-prisma.md)
- `medicines` is never put in `schema.prisma`: it is a raw table queried with parameterised `$queryRaw`.
- A transaction that takes a row lock is never left on Prisma's default 5 s limit: it takes `ROW_LOCK_TX` (`server/src/prisma/row-lock.ts`); a test that fails only under load is reproduced UNDER LOAD and read.
- Read-modify-write of a JSON column takes a `FOR UPDATE` row lock, and any such interactive transaction gets `ROW_LOCK_TX`, never Prisma's default; give it the same lock-holding test.
- Regenerate Prisma only with the dev server stopped; loose casts for a not-yet-generated column are acceptable short-term — regenerate ASAP.
- Medical-history JSON columns are append/merge on the client, whole-value writes on the server; never "fix up" their contents server-side without an explicit migration script.
- `medicines` is a raw Postgres table NOT in `schema.prisma`, queried with `$queryRaw`; no Prisma model, never let a destructive schema push touch it, keep queries parameterized.

### Server architecture → [`docs/rules/server-architecture.md`](../docs/rules/server-architecture.md)

### Admin console → [`docs/rules/admin.md`](../docs/rules/admin.md)
- Deleting a doctor must not delete their patients: `hardDelete` relies on `onDelete: SetNull`; orphans are unreachable; findability needs its own access design, never bolted onto a delete path.

### Build, deploy, dependencies, git → [`docs/rules/deploy-and-ops.md`](../docs/rules/deploy-and-ops.md)
- `npx tsc --noEmit` cannot catch the rootDir trap: before pushing a new file outside `src/`, run `rm -rf dist && npm run build && ls dist/main.js`; no `dist/main.js` = 502.
- `rootDir` belongs in the BUILD config, not `tsconfig.json`, which also type-checks `test/`, `prisma/seed.ts` and `scripts/*.ts` in CI.
- `tsBuildInfoFile` keeps the incremental cache inside `dist/`, else the next build writes nothing (no `dist/main.js`); check any change to these configs with two builds in a row.
- `CORS_ORIGIN` is a comma list and must include every frontend origin; a missing one looks like random auth failures.

## Before you touch a module, read its file

- **Editor lifecycle: drafts, reload, visit state, device mirror** → [`docs/rules/editor-lifecycle.md`](../docs/rules/editor-lifecycle.md) — 18 entries. Named there: `patients.service.ts#withOwnDraft`, `PUT /patients/:id/supervised-draft`, `forViewer`, `mirror`, `ROW_LOCK_TX`, `X-Accel-Buffering`.
  - A practice never reads another's draft: a Patient read for a possibly-supervising caller goes through `PatientsService.get` / `findByMobile` or `forViewer` (+N more: drug-history, on-exam).
  - `mirror` fans out editor snapshots in-memory; every SSE route must set `X-Accel-Buffering: no` or nginx buffers the stream in prod.
- **The ℞ pad and Save & print** → [`docs/rules/rx-pad.md`](../docs/rules/rx-pad.md) — 20 entries. Named there: `opd.service.ts`, `repeat.ts#sameContent`, `prescription.create`, `REPEAT_WINDOW_MS`, `prescriptions.service.spec.ts`, `repeat.spec.ts`.
  - `create()` answers a request identical to the latest Rx for the patient within 30 min with that one; never narrow comparison, window or lock; a new DTO field needs a line in `repeat.ts` (+1 more).
  - The habit write is awaited, in try/catch, AFTER `prescription.create` returns — it must never fail or roll back a prescription; `prescriptions.service.spec.ts` is the regression spec for `create()`.
- **Prescribing alerts, drug hypersensitivity, high-alert medication** → [`docs/rules/rx-alerts.md`](../docs/rules/rx-alerts.md) — 34 entries. Named there: `manual-patient-drug-safety.sql`, `/patients/:id/drug-safety`, `PatientDrugSafety`, `ROW_LOCK_TX`.
  - `PatientDrugSafety` (SQL not applied yet): any reaching practice reads/adds; edit/remove only own entries (owner: all); removal SOFT; server never fills `generic`; no FK to `User` (+N more).
- **"Your usual", learned phrases, Add Bulk Medicine, drug advice** → [`docs/rules/habits-and-phrases.md`](../docs/rules/habits-and-phrases.md) — 61 entries. Named there: `doctor-phrases/normalise.ts`, `scripts/rebuild-rx-habits.js`, `drug-advice/keys.ts`, `lib/rxDrugAdvice.ts`, `rx-habits/rxLanguage.ts#cellInEnglish`, `scripts/rebuild-doctor-phrases.js`.
  - A habit/phrase `patientCount` is never `increment: 1`: it counts distinct patients, taken from the record.
  - A derived-feature write never fails a prescription save: it runs awaited, in try/catch, after `prescription.create`.
  - A "fail silently" rule is never handed to a second caller without the thing that made it safe: for the bulk list the generic lookup throws (`listAll` does not catch what `attachGenerics` throws; `list` does).
  - A flag is never carried across a fold by the wording that won alone (`rebuild-rx-habits.js`): every wording that landed on the habit is tried for `hidden` / `pinned`, and `hidden` wins.
  - `attachGenerics` THROWS on a failed catalogue lookup: `list()` catches it, `listAll()` must not — a silent-fail rule is safe only with a caller that has a second source.
  - `catalogueRows` asks the catalogue ONCE by equality on the brand's first word — never turn it back into a `LIKE`, never use `= ANY($1)`; two generics for one medicine: the first is used, logged.
  - A Bangla dose/food/duration is the same habit as its English via `cellInEnglish` (copy of the client table); nothing outside the table read; rebuild keeps `hidden` from ANY folded wording (+1 more).
- **The visit sheet and the app shell** → [`docs/rules/visit-sheet.md`](../docs/rules/visit-sheet.md) — 12 entries. Named there: `POST /patients/:id/on-examination`, `isRemovedOe`, `onExaminationSummary`, `setHxRemoved`.
  - `onExaminationSummary` is written by the server only, under `ROW_LOCK_TX`: append, and SOFT remove/restore of `Disease Hx:` / `Surgical Hx:` entries by kind + words; findings cannot be removed.
- **Patient Records page and files** → [`docs/rules/records-page.md`](../docs/rules/records-page.md) — 8 entries. Named there: `patients.service.ts#update`, `manual-patient-files.sql`, `manual-patient-image-thumbs.sql`, `manual-patient-last-rx-image-key.sql`, `RX_LIFECYCLE`, `DICOM_MAX_BYTES`.
  - `Patient.imageThumbs` is a display-only side map riding `...rest`, not in `RX_LIFECYCLE`; it must never widen the `pt.info` key and only travels in the same PATCH as its gallery.
  - `Patient.lastRxImageKey` (SHA-256 of the newest auto snapshot) rides `...rest`, not `RX_LIFECYCLE`; only travels with `prescriptionImages` and must not widen `pt.info`; NULL = nothing filed yet.
  - `PatientFile`: add/remove owner practice only (assistant needs `pt.info`); DICOM is premium-only, checked on the server; removal SOFT; DICOM bytes checked for `DICM` at byte 128 (+N more).
- **OPD queue, chambers, appointment SMS** → [`docs/rules/opd.md`](../docs/rules/opd.md) — 18 entries. Named there: `src/opd/pad-stage.ts`, `manual-opd-queue-date.sql`, `queue-order.ts#renumber`, `manual-opd-chambers.sql`, `manual-opd-presence.sql`, `manual-opd-token-unique.sql`.
  - A queue's day is never found through `createdAt`: `OpdVisit.queueDate` says whose day it is; a day that has passed is refused by the SERVICE, not hidden by the screen.
  - `ChambersService.resolve` is the ONE place deciding the chamber: foreign/removed/made-up id is 404, never a fall-back; NULL is the default; never point at profile `Chamber` rows (+N more).
- **IPD: ward sheet, order sheets, wards and their teams** → [`docs/rules/ipd.md`](../docs/rules/ipd.md) — 31 entries. Named there: `lib/ipdClinical.ts#mergeIpdClinical`, `ipd.service.ts#resolveWard`, `wards.controller.ts`, `POST /ipd/:id/analogue`, `PATCH|DELETE /ipd/:id/analogue/:sheetId`, `POST /ipd`.
  - New per-admission data is never sent through the IPD `clinical` PATCH (it replaces the whole column): give it its own route (see `/ipd/:id/analogue`).
- **Patient chat, notes, activity feed** → [`docs/rules/chat-and-notes.md`](../docs/rules/chat-and-notes.md) — 7 entries. Named there: `ActivityService`, `DoctorPatientNote`, `PatientsService.get`, `WorkstationGuard`, `@CurrentUser().id`, `activity.service.spec.ts`.
  - `DoctorPatientNote` is read/written only under `@CurrentUser().id`; `@WorkstationDoctorId()` only proves reach — do not "fix" it to the workstation doctor, never log it to `activity`.
  - `ActivityService` takes an already-resolved `doctorId` and must never resolve a practice itself; `detail` capped at 400 chars — trim free text (+1 more: log clinical input).
- **Settings → Statistics** → [`docs/rules/statistics.md`](../docs/rules/statistics.md) — 14 entries. Named there: `client/src/lib/opdPresence.ts#isCompleted`, `visit-stats.ts`, `/statistics/diseases`, `GET /statistics/visits/days|months|overall`, `queueDate`, `ChambersService.resolve`.
- **SMS and payment** → [`docs/rules/sms-and-payment.md`](../docs/rules/sms-and-payment.md) — 2 entries. Named there: `sms/sms.service.ts`, `manual-sms-wallet.sql`, `sms-wallet.service.ts`, `POST /opd/sms/send`, `src/sms/`, `normaliseBdMobile()`.
  - Day SMS: never sent by itself, today/later only; chamber and time are the queue's; title from RECORDED sex, never guessed; charge only what the gateway took (+N more; SQL not applied).
  - `SmsService.send()` result must never be `void`-ed into a swallowed catch; HTTP 200 is not delivery proof; numbers go through `normaliseBdMobile()`, which refuses rather than guesses.
- **Uploads** → [`docs/rules/uploads.md`](../docs/rules/uploads.md) — 20 entries. Named there: `client/src/lib/imageFormats.ts`, `client/src/lib/imageThumbs.ts`, `scripts/backfill-image-thumbs.js`, `scripts/repair-localhost-image-urls.js`, `uploads/multer-error.filter.ts`, `upload.service.ts#checkMagic`.
  - Upload URLs minted on localhost are never stored (the dev DB is production); `upload.service.ts` refuses them.
  - `uploadImage` refuses (503, before `writeFileSync`) a localhost `PUBLIC_URL` unless `ALLOW_LOCALHOST_UPLOAD_URLS=true` exactly; never inferred (+1 more: repair script).
  - `upload.service.ts#sniff` is the one format gate, by BYTES; the stored extension comes from content, never filename; SVG and PDF stay refused; client copy: edit one, edit both (+N more).
