# Muqsit Health System — API Reference

REST API served by `server/` (NestJS 10 + Prisma + PostgreSQL) and consumed by
`client/` (doctor app, :3000) and `admin/` (admin app, :3001).

> ⚕️ **This is medical software.** Every route below that touches patient data is
> scoped to one doctor's practice. Before adding an endpoint, read `server/CLAUDE.md`
> — Rule 1 (doctor-scoping) and Rule 2 (the patient access model) are safety
> boundaries, not conventions.

---

## 1. Basics

| | |
|---|---|
| Base URL (dev) | `http://localhost:4000/api` |
| Base URL (prod) | `https://api.muqsithealthsystem.com/api` |
| Global prefix | `/api` (`main.ts` → `setGlobalPrefix`) |
| Content type | `application/json` (except `POST /uploads/image`, which is `multipart/form-data`) |
| Auth | httpOnly cookies (see §2). `credentials: "include"` is required on every browser call |
| Ids | cuid strings everywhere |
| Body limit | 8 MB (JSON and urlencoded) — prescription drafts and rich-text layouts are large |
| Static files | `GET /uploads/<filename>` — uploaded images, served from the server's disk, **not** under `/api` |
| CORS | `CORS_ORIGIN` env, comma-separated. Must list every frontend origin or requests look like random auth failures |

There is **no OpenAPI/Swagger document and no health-check route.** This file is
the reference; the source of truth is `server/src/**/*.controller.ts`.

### Error shape

Standard Nest `HttpException` JSON. `class-validator` messages arrive as an array:

```json
{ "statusCode": 400, "message": ["Mobile number must be exactly 11 digits"], "error": "Bad Request" }
```

The client (`client/src/lib/api.ts`) joins `body.message` straight into the
doctor-facing banner, so validation messages are written for a clinician.

| Status | Means |
|---|---|
| `400` | DTO validation failed, or a domain precondition (e.g. a chat message with no body and no attachment) |
| `401` | No/expired access cookie, or a refused refresh. The client silently refreshes once, then logs out |
| `403` | Workstation not permitted, or a missing permission key |
| `404` | Not found **or not yours** — a foreign id is deliberately indistinguishable from a missing one |
| `429` | Throttled (see below) |

### Rate limits

Global `ThrottlerGuard`: **100 requests / minute / IP**. Auth routes layer
tighter limits on top — `register` 5/min, `verify-email` 10/min, `resend-otp`
3/min, `login` 5/min, `refresh` 30/min.

### Validation

`ValidationPipe({ whitelist: true, transform: true })` is global: **any field not
declared on the route's DTO is silently stripped.** A "saved but nothing
persisted" bug is almost always a field missing from `server/src/*/dto/*.ts`.

### Dates

Stored/displayed clinical date strings are `dd/mm/yyyy`; ISO-8601 is used for
`dob` and for every `createdAt`/`updatedAt`. Never parse a `dd/mm/yyyy` string
with a bare `new Date()` — see the root `CLAUDE.md`.

---

## 2. Authentication

Two httpOnly cookies, so JavaScript can never read a session:

| Cookie | Lifetime | Path | Purpose |
|---|---|---|---|
| `mhs_at` | 15 min | `/` | Access token (JWT), sent with every API call |
| `mhs_rt` | 30 days ("remember me") or browser session | `/api/auth` | Refresh token, rotated on every use |

Flags come from env: `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN`
(`Secure` and `SameSite=None` are required when API and client live on unrelated
domains).

**Refresh rotation** revokes the presented token and issues a new one in the same
family. A replayed token normally kills the whole family (theft assumption), but
a **30-second grace window** treats a just-rotated token with a live successor as
a benign concurrent-refresh race — multiple tabs, and the client and admin apps,
share one cookie. Removing that window brings back "everyone logs out on reload".

### Endpoints — `/auth`

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/register` | public | `RegisterDto` → creates a pending account and emails a 6-digit OTP |
| POST | `/auth/verify-email` | public | `{ email, otp }` |
| POST | `/auth/resend-otp` | public | `{ email }` |
| POST | `/auth/login` | public | `{ identifier, password, remember? }` → `200 { user }` + sets both cookies |
| POST | `/auth/refresh` | refresh cookie | — → `200 { user }` + rotated cookies |
| POST | `/auth/logout` | refresh cookie | — → `204`, cookies cleared |
| GET | `/auth/me` | access cookie | → the signed-in user |

`identifier` is an email address **or** an 11-digit mobile number.

`RegisterDto` (all required unless noted): `name`, `email`, `mobile` (exactly 11
digits), `profession` (`doctor` / `intern_doctor` / `nurse` /
`medical_technologist` / `computer_operator`), `registrationNo` (required except
for `computer_operator`), `nidNo`, `designation`, `specialty`, `institutionCode?`,
`password` (≥8 chars with upper, lower, digit and symbol), `registrationCertUrl`,
`nidFrontUrl`, `nidBackUrl`, `profilePictureUrl`. The four URLs come from
`POST /uploads/image`. Every new sign-up starts `accountTier: "secondary"` with
`approvalStatus: "pending"`.

**User object** returned by login / refresh / `/auth/me`:

```ts
{ id, email, name, displayName, role, accountTier }
```

`accountTier` must keep being returned — the client's tier gates read it from the
login/refresh response.

---

## 3. Scoping: the `X-Workstation` header

A **workstation** is the practice a request acts on. The client sends the doctor's
id in `X-Workstation`; `WorkstationGuard` resolves it:

| Header | Result |
|---|---|
| absent, or the caller's own id | own context — `role: "owner"`, `permissions: []` |
| a doctor the caller **actively assists** | that doctor's context + the granted permission keys, `role: "assistant"` |
| anything else | `403` |

Routes marked **WS** below resolve `doctorId` from this header
(`@WorkstationDoctorId()`), never from `req.user.id`. Routes marked **own** always
use the signed-in user's own id — `assistants`, `wards`, `prescription-draft`,
`prescription-layout`, `prescription-templates`, `research`, `mirror` and
`/supervised` — and cannot be redirected by the header.

`GET /workstations` lists every practice the user can work in:

```ts
{ doctorId, name, role: "owner" | "assistant", permissions: string[] }[]
```

A `secondary` account has **no own workstation** (the client shows the upgrade
gate); `primary` and `premium` do.

### Permission keys

Granted per assistant (`Assistant.permissions`) or per ward-team member
(`IpdTeamMember.permissions`). The catalogue lives in
`client/src/lib/permissions.ts`.

**Prescription page:** `rx.chiefComplaints`, `rx.history`, `rx.investigation`,
`rx.drugHistory`, `rx.onExamination`, `rx.note`, `rx.provisionalDiagnosis`,
`rx.associatedIllness`, `rx.finalDiagnosis`, `rx.medicines`, `rx.advice`,
`rx.adviceTest`, `rx.followUp`, `rx.savePrint`.

**Patient settings:** `pt.info`, `pt.doctors`, `pt.family`, `pt.security`.

**IPD ward sheet (ward teams only — deliberately absent from the assistant
editor):** `ipd.sign`, `ipd.symptoms`, `ipd.diagnosis`, `ipd.investigation`,
`ipd.procedure`, `ipd.followUp`, `ipd.plan`, `ipd.adviceTests`, `ipd.medicines`,
`ipd.analogue`, `ipd.events`, `ipd.header`.

Always granted regardless of selection: `opd.addPatient`.

Server-side enforcement today (the UI gate is never the boundary):

| Route | Rule |
|---|---|
| `POST /prescriptions` | an assistant needs `rx.savePrint` |
| `PATCH /patients/:id` | per-field: demographic fields need `pt.info`, `familyMembers` needs `pt.family`, and the prescription-lifecycle fields (`incompleteRx`, `drugHistory`, `investigationSummary`, `onExaminationSummary`, `hmSelectedDrugs`) need any `rx.*` grant |
| `PATCH /patients/:id` with `hmDrugDates` / `hmSymptomDates` | **owner only** — an assistant is refused by the controller, a supervising doctor by the `patient.doctorId` check in the service |
| `DELETE /patients/:id` | **owner only, always** |
| `/ipd/:id/analogue*` | the doctor and their assistants pass without a key; any other actor needs `ipd.analogue` |

---

## 4. Patient access model

| Action | Owner | Assistant (via workstation) | Supervisor (`PatientSupervisor`) |
|---|---|---|---|
| find by mobile / open / update | ✅ | ✅ (as the owner) | ✅ |
| create a prescription | ✅ | ✅ | ✅ — stored under the **supervisor's own** `doctorId` |
| list prescriptions | own `doctorId` only — a supervisor never sees the owner's ℞, and vice versa | | |
| `DELETE` the patient | ✅ | ❌ | ❌ |

A **supervised doctor** is a per-patient link, not a workstation: they log into
their own account, find the patient by mobile, see patient info and records, and
prescribe under their own id.

---

## 5. Endpoint reference

Legend: **JWT** = access cookie required · **WS** = `X-Workstation` scoped ·
**own** = always the signed-in user · **admin** = `role: "admin"` required.

### 5.1 Users — `/users` (JWT, own)

| Method | Path | Notes |
|---|---|---|
| GET | `/users/me` | Full profile: certificates, chambers, NID, favourite investigations, unit prefs, field recents. `/auth/me` returns only the auth fields |
| PATCH | `/users/me` | `UpdateProfileDto` |

`UpdateProfileDto`: `displayName?`, `email?`, `mobile?` (11 digits), `nidNo?`,
`designation?`, `specialty?`, `profilePictureUrl?`, `nidFrontUrl?`, `nidBackUrl?`,
`otherCertificates?: [{ id?, url, details? }]`, `chambers?: [{ id?, address, mapLink? }]`,
`favouriteInvestigations?: string[]`, `investigationUnitPrefs?: { [test]: "u1" | "u2" }`,
`fieldRecents?: { [fieldLabel]: string[] }`.

`registrationNo` and `registrationCertUrl` are **deliberately not editable here** —
they identify the practitioner to the regulator and are changed only through the
admin app.

### 5.2 Admin — `/admin` (JWT + admin)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/admin/registrations` | — | optional `?status=` |
| GET | `/admin/registrations/:id` | — | |
| PATCH | `/admin/registrations/:id/approve` | — | |
| PATCH | `/admin/registrations/:id/reject` | `{ reason }` | reason is required |
| PATCH | `/admin/registrations/:id/suspend` | — | |
| PATCH | `/admin/registrations/:id/tier` | `{ tier: "primary" \| "secondary" \| "premium" }` | tier drives the workstation gate |
| DELETE | `/admin/registrations/:id` | — | **soft** delete → Trash, recoverable |
| DELETE | `/admin/registrations/:id/permanent` | — | permanent. Patients survive (`Patient.doctorId` → `SetNull`); that doctor's own prescriptions cascade |
| POST | `/admin/users/:id/revoke-sessions` | — | force-logout; returns the number of refresh tokens revoked |

### 5.3 Workstations — `/workstations` (JWT, own)

| Method | Path | Notes |
|---|---|---|
| GET | `/workstations` | every practice the user can work in (own + assisted) |

### 5.4 Assistants — `/assistants` (JWT, **own account only**)

| Method | Path | Body |
|---|---|---|
| GET | `/assistants` | — |
| GET | `/assistants/search?q=` | find a registered user to add |
| GET | `/assistants/defaults` | the doctor's default grant set |
| PUT | `/assistants/defaults` | `{ permissions: string[] }` |
| POST | `/assistants` | `{ assistantId }` |
| PATCH | `/assistants/:id` | `{ permissions?: string[], status?: "active" \| "suspended" }` |
| DELETE | `/assistants/:id` | — |

Deciding who may work inside a practice is the owner's call, so these routes never
take a workstation doctor id.

### 5.5 Wards & IPD teams — `/wards` (JWT, **own account only**)

| Method | Path | Body |
|---|---|---|
| GET | `/wards` | — |
| POST | `/wards` | `{ name }` (trimmed, ≤60 chars, unique per practice) |
| PATCH | `/wards/:id` | `{ name }` |
| DELETE | `/wards/:id` | — |
| GET | `/wards/:id/search?q=` | find a registered user to add to the team |
| POST | `/wards/:id/members` | `{ userId, permissions?: string[] }` — absent permissions means read-only |
| PATCH | `/wards/:id/members/:memberId` | `{ permissions?, status?: "active" \| "suspended" }` |
| DELETE | `/wards/:id/members/:memberId` | — |

⚠️ **A ward team is not a workstation.** Team members cannot yet log in and reach
the ward; that door must be built inside `ipd.service`, never by extending
`WorkstationsService.resolve` (see `server/CLAUDE.md`, Rule 2b).

### 5.6 Patients — `/patients` (JWT + WS)

| Method | Path | Notes |
|---|---|---|
| GET | `/patients?search=` | the practice's patients |
| GET | `/patients/watched` | the "keep an eye on this patient" list |
| GET | `/patients/by-mobile?mobile=` | every patient on that number, newest first — powers the prescription mobile lookup. Includes supervised patients |
| GET | `/patients/relatives-by-mobile?mobile=` | family-tree entries matching a number → `{ patientId, patientName, name, relation, sex, mobile }[]` (info only) |
| GET | `/patients/:id` | `404` if not accessible |
| POST | `/patients` | `CreatePatientDto` |
| POST | `/patients/link` | `LinkPatientDto` — creates a NEW patient related to an existing one and writes reciprocal family links to both |
| PATCH | `/patients/:id` | `UpdatePatientDto` — the **only** route that accepts it |
| DELETE | `/patients/:id` | **owner only** |

`CreatePatientDto`: `name` (required), `hospitalId?`, `bloodGroup?`, `dob?`
(ISO-8601, never in the future), `age?` (0–150), `ageAsOfYear?` (1900–2200),
`sex?`, `ethnicity?`, `religion?`, `mobile?`, `nid?`, `spouseMobile?`,
`relativeMobile?`, `relativeRelation?`, `district?`, `fullAddress?`,
`monthlyIncome?`, `pictureUrl?`, `tags?`, `watched?`, `prescriptionImages?`,
`reportImages?`. Array fields cap at 200 entries / 2000 chars each.

`UpdatePatientDto` = all of the above optional, **plus** the record fields:

| Field | Shape | Note |
|---|---|---|
| `investigationSummary` | `[{ date, category, test, value }]` | whole-value write |
| `onExaminationSummary` | `[{ date, text }]` | whole-value write |
| `drugHistory` | `string[]` (`"dd/mm/yyyy: Drug — …"`) | Current vs distant-past is derived from the date |
| `familyMembers` | `[{ name, mobile, nid, sex, relation }]` | needs `pt.family` |
| `incompleteRx` | editor snapshot, `null` clears | drives the Incomplete badge in OPD |
| `hmSelectedDrugs` | `string[]` | ticked drugs in the trend chart |
| `hmDrugDates` | `{ [drug]: { sf, upto } }` | **owner only**, display override — never rewrites `drugHistory` |
| `hmSymptomDates` | `{ [complaint]: { sf, upto } }` | **owner only**, display override — never rewrites a prescription |
| `lastRxImageKey` | SHA-256 hex string | fingerprint of the last auto gallery snapshot; travels with `prescriptionImages` |

⚠️ These JSON columns are **merged on the client and written whole on the server.**
A key the client omits is gone. Never "fix up" their contents server-side without
an explicit migration script.

`LinkPatientDto`: `existingId`, `name`, `relation` (`son` / `daughter` / `spouse` /
`father` / `mother` / `brother` / `sister`, expressed as the NEW patient's role
relative to the existing one), plus `mobile?`, `sex?`, `hospitalId?`, `dob?`,
`age?`, `ageAsOfYear?`, `fullAddress?`.

### 5.7 Patient chat & supervising doctors (JWT + WS)

Mounted on `/patients`; access (owner / assistant / assigned supervisor) is
resolved per request inside the service.

| Method | Path | Body |
|---|---|---|
| GET | `/patients/:id/chat` | — |
| POST | `/patients/:id/chat` | `{ body?, attachmentUrl? }` — at least one required; `attachmentUrl` must be `http(s)` (a `javascript:` / `data:` URL is a stored-XSS vector) |
| GET | `/patients/:id/supervisors` | — |
| POST | `/patients/:id/supervisors` | `{ identifier }` — the supervising doctor's registered email or 11-digit mobile |
| DELETE | `/patients/:id/supervisors/:doctorId` | — |
| GET | `/supervised` | JWT, **own** — patients other doctors assigned this user to supervise |

### 5.8 Prescriptions — `/prescriptions` (JWT + WS)

| Method | Path | Notes |
|---|---|---|
| POST | `/prescriptions` | `CreatePrescriptionDto`; an assistant needs `rx.savePrint` |
| GET | `/prescriptions?patientId=` | this doctor's prescriptions for that patient only |
| GET | `/prescriptions/:id` | |

`CreatePrescriptionDto`: `patientId` (required), `items` (required), and the
optional string arrays `chiefComplaints`, `previousComplaints`, `history`,
`investigation`, `drugHistory`, `onExamination`, `note`, `provisionalDiagnosis`,
`associatedIllness`, `finalDiagnosis`, `advice`, `adviceTest`, plus
`followUpNum?`, `followUpUnit?`, `followUpMandatory?`. Arrays cap at 200 entries.

`items[]` (`RxItemDto`): `drug`, `dose`, `duration`, `instruction` (all required
strings — `drug` may be empty for a note line or a tapering line), `order?`,
`isNote?`, `sf?` ("Start From", IPD pad), `isCont?` (this line is a `>>>` tapering
continuation of the line above).

`isCont` is **nullable** in storage: `null` means "written before the column
existed" and must not be read as `false`.

A successful create also teaches the prescribing-habit table (§5.14) — awaited, in
a try/catch, **after** the prescription commits, so a habit failure can never roll
back a prescription the doctor has already printed.

### 5.9 Prescription draft — `/prescription-draft` (JWT, own)

Per-user autosave of the editor. `data` is an opaque JSON object; the server
stores and returns it verbatim.

| Method | Path | Body |
|---|---|---|
| GET | `/prescription-draft` | — |
| PUT | `/prescription-draft` | `{ data: {...} }` |
| DELETE | `/prescription-draft` | — |

### 5.10 Print layout — `/prescription-layout` (JWT, own)

| Method | Path | Body |
|---|---|---|
| GET | `/prescription-layout` | — |
| PUT | `/prescription-layout` | partial `UpsertPrescriptionLayoutDto`; the service merges over current/defaults |

Fields: `rxType` (`opd` / `ipd`), `opdLayout` (`single` / `extra`), `unit`
(`in` / `cm`), `totalHeight`, `totalWidth`, `leftMargin`, `rightMargin`,
`headerHeight`, `footerHeight`, `headerSplit`, `headerAlign`
(`left` / `center` / `right`), `headerHtml`, `headerLeftHtml`, `headerRightHtml`,
`footerHtml`, `bodySplit`, `bodyLeftTopMargin`, `bodyRightTopMargin`,
`bodyBottomLine`. HTML blocks cap at 100 000 chars.

⚠️ The printed sheet is a legal medical document — test the print preview after
touching anything here.

### 5.11 Templates — `/prescription-templates` (JWT, own)

| Method | Path | Body |
|---|---|---|
| GET | `/prescription-templates?category=` | `opd` / `ipd` / `custom` |
| POST | `/prescription-templates` | `{ category, name, items: [{ drug, dose, duration, instruction, isNote? }] }` |
| PATCH | `/prescription-templates/:id` | `{ name?, items? }` |
| DELETE | `/prescription-templates/:id` | — |

### 5.12 OPD queue — `/opd` (JWT + WS)

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/opd` | **today's** queue only (`createdAt >= start of day`), oldest first |
| POST | `/opd` | `{ name, patientId?, phone?, age?, gender?, type? }`; `type` is `New` / `Follow-up` / `Urgent`. The server allocates the token |
| POST | `/opd/rx-status` | `{ patientId, rxStatus: "incomplete" \| "complete", name?, phone?, age?, gender? }` — upserts today's entry for that patient |
| PATCH | `/opd/:id/status` | `{ status: "waiting" \| "done" }` |

Tokens are `T-01`, `T-02`, … per doctor per day, derived from the **max** existing
serial inside a transaction so a mid-day deletion cannot make two visits share a
number.

### 5.13 IPD — `/ipd` (JWT + WS)

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/ipd` | the practice's admissions |
| POST | `/ipd` | `CreateAdmissionDto` |
| PATCH | `/ipd/:id` | `UpdateAdmissionDto` |
| PATCH | `/ipd/:id/status` | `{ status: "Stable" \| "Observation" \| "Critical" \| "Discharge" }` |
| GET | `/ipd/:id/events` | admission feed, oldest first |
| POST | `/ipd/:id/events` | `{ note, role?, reportUrl? }` — attributed to the signed-in user, not the workstation doctor |

`CreateAdmissionDto`: `bed`, `name` (required), `patientId?`, `hospitalId?`,
`roomNo?`, `wardNo?`, `wardId?`, `floorBuilding?`, `mobile?` (11 digits),
`diagnosis?`, `status?`.

`UpdateAdmissionDto` adds `age?` (0–150), `sex?` and `clinical?` (an object:
`chiefComplaints` — displayed as "Sign" — `symptoms`, `investigation`,
`procedure`, `followUp`, `plan`, `adviceTests`, `rxItems`).

`wardId` is validated against the doctor's **own** wards and the ward's real name
is written back into `wardNo`; an unknown id is refused, never silently dropped.
`null` clears the link.

⚠️ **`clinical` is replaced wholesale.** A key the client omits is deleted, with no
error and nothing in the feed. The client builds the payload with
`mergeIpdClinical`; the server keeps `preserveAnalogueSheets` as a backstop for
stale tabs. There is no version check yet, so two writers can clobber each other —
**new per-admission data gets its own route rather than riding this PATCH.**

#### Analogue (paper) order sheet

The ward's own paper order sheet, photographed into the admission. Per-page routes
on purpose — each re-reads the admission inside a transaction, touches one entry,
and passes every other `clinical` key through.

| Method | Path | Body / Notes |
|---|---|---|
| POST | `/ipd/:id/analogue` | `{ sheets: [{ url, thumbUrl?, label? }] }`, 1–20 per call. Saved the moment they upload |
| PATCH | `/ipd/:id/analogue/:sheetId` | `{ label }` — an empty string clears the label, which is a real edit |
| DELETE | `/ipd/:id/analogue/:sheetId` | **soft** remove: sets `removedAt` / `removedBy`, nothing leaves disk |
| POST | `/ipd/:id/analogue/:sheetId/restore` | undo a soft removal |

Stored entry: `{ id, url, thumbUrl?, addedAt, addedBy?, label?, removedAt?, removedBy? }`.
**`id` and `addedAt` are assigned by the server** — a ward PC's clock is not
something a clinical timestamp may depend on. The list cannot be reordered: its
order is the chronology of the round. Every operation files an `IpdEvent` in the
same transaction, attributed to the person who acted.

### 5.14 Prescribing habits — `/rx-habits` (JWT + WS)

The ℞ pad's "your usual" suggestions, learned from this doctor's own completed
prescriptions.

| Method | Path | Notes |
|---|---|---|
| GET | `/rx-habits?q=` | `q` needs ≥2 chars; prefix match on the normalised medicine key |
| PATCH | `/rx-habits/:id` | `{ hidden?, pinned? }` |

The response is grouped per medicine, not flat:

```ts
{
  drugKey, drugLabel,
  generic?,          // from the medicines catalogue — a SAFETY field: alert rules
                     // are written against generics while the ℞ line carries the brand
  items: [{ id, drugLabel, dose, food, duration, contLines, patientCount, lastUsedAt, pinned }],
  hidden: HabitItem[],   // so "N hidden — show" can restore them
  hiddenCount: number
}[]
```

Caps: ≤3 suggestions per medicine, ≤4 medicines per response, ≤20 hidden rows
returned per medicine (`hiddenCount` is the true number).

⚠️ **There is no DELETE route** — "deleting" a suggestion sets `hidden`, and the
prescription it was learned from stays byte-identical. `patientCount` is **distinct
patients**, not prescriptions. Nothing here is ever written back to
`Prescription` / `PrescriptionItem`, and the table is rebuildable with
`node server/scripts/rebuild-rx-habits.js`.

### 5.15 Medicines — `/medicines` (JWT)

| Method | Path | Notes |
|---|---|---|
| GET | `/medicines/search?q=` | ≥2 chars, max 10 hits |

→ `{ id, brandName, genericName, dosageForm, strength, company, priceRaw }[]`,
ranked brand-prefix → brand-contains → generic-prefix → generic-contains, then by
dosage form.

⚠️ Backed by a raw Postgres table `medicines` that is **not in `schema.prisma`** —
queried with parameterised `$queryRaw`. Don't look for a Prisma model, and keep any
new query bound.

### 5.16 Activity feed — `/activity` (JWT + WS)

| Method | Path | Notes |
|---|---|---|
| GET | `/activity?limit=&patientId=` | shared per practice, newest first |
| POST | `/activity` | `{ section, detail, patientName?, patientId?, action?, imageUrl? }` |

`section` ≤60 chars, **`detail` ≤400 chars** — trim doctor-typed free text before
interpolating, or the whole log call 400s. `action` is `added` / `saved`.
`imageUrl` must be `http(s)`.

This is the doctor-facing audit trail behind "Notifications, Chats & Reports". When
you add a feature that records clinical input, log it here.

### 5.17 Research — `/research` (JWT, own)

| Method | Path | Notes |
|---|---|---|
| GET | `/research/patients?q=` | cohort search across the signed-in user's own patients |

### 5.18 Device mirroring — `/mirror` (JWT, own)

| Method | Path | Notes |
|---|---|---|
| GET | `/mirror/stream` | **SSE**. The first event is `{ type: "hello", payload: { connId } }` |
| POST | `/mirror/publish` | `{ connId, type, payload }` → `{ ok: true }`; fanned out to the user's *other* devices |

In-memory fan-out, scoped to one user — a user only ever mirrors their own
sessions. The stream sets `X-Accel-Buffering: no`; without it nginx buffers the
response in production and mirroring "stops working". Keep that header on any new
SSE route.

### 5.19 Uploads — `/uploads` (**public**)

| Method | Path | Notes |
|---|---|---|
| POST | `/uploads/image` | `multipart/form-data`, field name `file` → `{ url }` |

Public on purpose: the registration flow uploads NID, certificate and profile
images **before any account exists**, so no JWT guard can apply. Abuse is bounded by
the global throttler, the 8 MB limit and a magic-byte check (JPEG, PNG, WEBP, GIF,
BMP, AVIF/HEIC/HEIF — iPhone report photos are routinely 3–8 MB, so the limit is
deliberately not lower). The returned URL is absolute, built from `PUBLIC_URL`, and
the file is served from the API's own disk at `/uploads/<name>`; hosted URLs are
stored in the DB, never base64.

---

## 6. Environment variables

| Variable | Used for |
|---|---|
| `DATABASE_URL` | PostgreSQL (shared VPS DB, reached locally over an SSH tunnel) |
| `JWT_SECRET` | access tokens — **must** be ≥32 random chars in production or boot fails |
| `PORT` | default `4000` |
| `NODE_ENV` | enables HSTS, secure cookies, and the JWT-secret check |
| `CORS_ORIGIN` | comma-separated allowed origins |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | cookie flags for cross-domain deployments |
| `PUBLIC_URL` | base of the URLs returned by `/uploads/image` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | OTP and notification email; unset → the transporter is null and OTPs don't send (configuration, not a bug) |
| `SMS_CUSTOMER_ID`, `SMS_API_KEY`, `SMS_API_URL` | SMS gateway. `SmsModule` is deliberately **not** wired into `AppModule` — nothing consumes it yet |
| `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD` | `npm run seed` |

---

## 7. Adding an endpoint — checklist

1. Does it touch patient data? Then `@UseGuards(JwtAuthGuard, WorkstationGuard)`
   and `@WorkstationDoctorId()` — never `req.user.id`, never a client-sent doctorId.
2. Which column of the §4 access table does it belong to? Mirror the matching
   `where` shape from `patients.service.ts`.
3. Every new field goes on a DTO, or `ValidationPipe({ whitelist: true })` drops it.
4. Does it record clinical input? Write an `ActivityLog` (and, for IPD, an `IpdEvent`).
5. New guarded module? Import `WorkstationsModule` — `npx tsc --noEmit` is green
   without it and the API then crash-loops at boot. **Start the server.**
6. Schema change? An idempotent `server/prisma/manual-<name>.sql`, applied through
   the tunnel. Prisma Migrate is not used, and the DB is shared with production.
7. Update this file and the relevant `CLAUDE.md` in the same commit.
