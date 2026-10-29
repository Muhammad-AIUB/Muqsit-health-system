# Muqsit Health System — Database Schema

Source of truth: [`server/prisma/schema.prisma`](../server/prisma/schema.prisma) (26 models) plus one raw table, `medicines`, that is deliberately not in the schema file. This document describes the schema as it is in `dev`; the live database is whatever the `manual-*.sql` files have actually been applied to (see [Migrations](#migrations)).

> ⚕️ The database is **one shared PostgreSQL on the VPS, reached through an SSH tunnel**, and the development database *is* production. Every change is additive and idempotent. Nothing here may be dropped, renamed or reshaped without the product owner (a physician) saying so.

Related: [PRD.md](PRD.md) · [TRD.md](TRD.md) · [DOMAIN.md](DOMAIN.md) (why each rule exists) · [API.md](API.md) (how the tables are reached).

---

## 1. Entity map

```
                              ┌────────────┐
              ┌───────────────│    User    │───────────────────────────────┐
              │ owns          └─────┬──────┘                                │
              ▼                     │                                       │ per-user, 1:1 or 1:N
        ┌───────────┐     assistant │ link                                  ▼
        │  Patient  │◄──────┐  ┌────▼─────┐        ┌───────────────────────────────────────────┐
        └─┬──┬──┬───┘       │  │Assistant │        │ RefreshToken · Chamber · OtherCertificate │
          │  │  │           │  └──────────┘        │ PrescriptionLayout (1:1) · PrescriptionDraft (1:1)
          │  │  │           │                      │ PrescriptionTemplate · ActivityLog        │
          │  │  │      ┌────┴─────────┐            │ DoctorRxHabit · DoctorPhraseHabit         │
          │  │  │      │PatientSuper- │            │ DoctorDrugAdvice · DoctorPatientNote      │
          │  │  │      │visor (M:N)   │            │ DoctorRevisionNote (1:1) · SupervisedDraft│
          │  │  │      └──────────────┘            └───────────────────────────────────────────┘
          │  │  │
          │  │  └──► PatientChatMessage
          │  │
          │  ├──► Prescription ──► PrescriptionItem
          │  ├──► OpdVisit                                   Ward ──► IpdTeamMember ──► User
          │  └──► IpdAdmission ──► IpdEvent                   ▲
          │            └──────────── wardId ──────────────────┘
          ▼
   (JSON columns: drugHistory, investigationSummary, onExaminationSummary,
    familyMembers, incompleteRx, hmDrugDates, hmSymptomDates, imageThumbs)

   medicines  — raw table, no relations, read-only for the app
```

## 2. Conventions

| Convention | Rule |
|---|---|
| Ids | `String @id @default(cuid())` everywhere |
| Timestamps | `createdAt @default(now())`, `updatedAt @updatedAt` on most models. `OpdVisit`, `IpdAdmission`, `IpdEvent`, `PatientChatMessage`, `ActivityLog`, `RefreshToken`, `PatientSupervisor` have `createdAt` only |
| Clinical text | Stored as `String[]` (one line per entry) on `Prescription`, or as `Json` on `Patient` where a record outlives one visit |
| Clinical dates in strings | `dd/mm/yyyy`. Never parse with `new Date(str)`; use `client/src/lib/dateInput.ts` |
| Real dates | `DateTime` (`Patient.dob`, every `createdAt`) is ISO |
| Enums | **None.** Every closed set is a `String` with its values listed in a comment; validation lives in DTOs |
| Owner column | `doctorId` (practice owner) on patient-data tables; `userId` on tables private to one signed-in person |
| Scoping | Every patient-data query is filtered by the workstation doctor. See [TRD.md §5](TRD.md#5-access-control) |

## 3. Models

### 3.1 Identity and access

#### `User`
Every login. Doctors, nurses, technologists, computer operators and back-office admins share the table.

| Field | Type | Notes |
|---|---|---|
| `id` | String | cuid |
| `email` | String, **unique** | matched case-insensitively at the API |
| `passwordHash` | String | |
| `name` / `displayName?` | String | `displayName` is the editable signature; falls back to `name` |
| `role` | String, default `professional` | `admin` for back office |
| `mobile?` | String | exactly 11 digits, enforced by DTO |
| `profession?` | String | `doctor` · `intern_doctor` · `nurse` · `medical_technologist` · `computer_operator` |
| `registrationNo?`, `nidNo?`, `designation?`, `specialty?`, `institutionCode?` | String | `registrationNo` is null for `computer_operator` |
| `profilePictureUrl?`, `registrationCertUrl?`, `nidFrontUrl?`, `nidBackUrl?` | String | URLs returned by `POST /uploads/image` |
| `emailVerified` | Boolean, default `false` | set by the OTP flow |
| `approvalStatus` | String, default `pending` | `pending` · `approved` · `suspended` · `rejected` |
| `rejectionReason?` | String | |
| `accountTier` | String, default `secondary` | `secondary` (new sign-ups; may only work as someone's assistant) · `primary` / `premium` (admin-promoted; own a practice) |
| `deletedAt?` | DateTime | non-null = in Trash, recoverable; an approve or tier change clears it (`manual-soft-delete.sql`) |
| `assistantDefaultPermissions` | String[] | applied to every new assistant this doctor adds |
| `favouriteInvestigations` | String[] | |
| `investigationUnitPrefs` | Json, default `{}` | `{ [testName]: "u1" \| "u2" }` |
| `fieldRecents` | Json, default `{}` | `{ [fieldLabel]: string[] }` — recently typed chip entries |
| `investigationGroups` | Json, default `[]` | `[{ name, tests: string[] }]` — the user's own test groups |

Indexes: `approvalStatus`, `deletedAt`.
Relations: owns `Patient`, `Prescription`, `Chamber`, `OtherCertificate`, `PrescriptionTemplate`, `ActivityLog`, `Ward`, the learned/advice tables below, and has at most one `PrescriptionLayout`, `PrescriptionDraft` and `DoctorRevisionNote`.

#### `RefreshToken`
Opaque tokens stored as SHA-256 hashes. A login starts a *family*; each rotation issues a new token in the family and revokes the old one. A revoked token presented again revokes the whole family — except inside the 10-second same-User-Agent grace window that stops concurrent tabs signing each other out.

| Field | Type | Notes |
|---|---|---|
| `tokenHash` | String, **unique** | |
| `family` | String | indexed |
| `expiresAt` / `revokedAt?` | DateTime | |
| `userAgent?`, `ip?` | String | |

Index: `userId`, `family`. Cascades with `User`.

#### `EmailOtp`
Six-digit sign-up codes. `codeHash`, `expiresAt`, `attempts` (max 5 per code, claimed atomically), `consumed`. Index `email`. No relation to `User` — a code exists before the account is verified.

#### `Assistant`
Links a doctor to a user who works in that doctor's practice.

| Field | Type | Notes |
|---|---|---|
| `doctorId` → `User` | String | cascade |
| `assistantId` → `User` | String | cascade |
| `permissions` | String[] | `rx.*`, `pt.*` keys — catalogue in `client/src/lib/permissions.ts`, enforced in the API |
| `status` | String, default `active` | `active` · `suspended` |

Unique `(doctorId, assistantId)`. Indexes on both ids.

#### `PatientSupervisor`
A **per-patient** link giving another doctor access to that one patient. Not a workstation.
Unique `(patientId, doctorId)`. Cascades with `Patient` and `User`.

### 3.2 Patients

#### `Patient`
One person, found again by mobile number. **Not the property of a doctor** — deleting a doctor sets `doctorId` to null and keeps the row.

| Group | Fields |
|---|---|
| Identity | `name`, `hospitalId?`, `bloodGroup?`, `sex?`, `ethnicity?`, `religion?`, `nid?`, `pictureUrl?`, `tags String[]` |
| Age | `dob?` (DateTime), `age?` (Int), `ageAsOfYear?` (Int). With no `dob`, displayed age = `age + (currentYear − ageAsOfYear)`; null/0 means no auto-increment |
| Contact | `mobile?`, `spouseMobile?`, `relativeMobile?`, `relativeRelation?`, `district?`, `fullAddress?`, `monthlyIncome?` |
| Flags | `watched` (Boolean, "Keep eye on this patient") |
| Galleries | `prescriptionImages String[]`, `reportImages String[]` (self-hosted `/uploads` URLs; array order is the doctor's order), `imageThumbs Json?` (`{ [fullUrl]: thumbUrl }` side map, 400 px), `lastRxImageKey String?` (SHA-256 of the printed sheet behind the newest auto snapshot) |
| Durable history (Json) | `drugHistory` · `investigationSummary` · `onExaminationSummary` · `familyMembers` — see [§4](#4-json-column-shapes) |
| Health-trend chart | `hmSelectedDrugs String[]`, `hmDrugDates Json?`, `hmSymptomDates Json?` (display-only duration overrides; **owner only**) |
| Parked visit | `incompleteRx Json?` — the owner practice's unprinted editor snapshot; null = nothing pending |
| Owner | `doctorId String?` → `User`, `onDelete: SetNull` |

Indexes: `doctorId`, `name`.
Relations: `Prescription[]`, `OpdVisit[]`, `IpdAdmission[]`, `PatientChatMessage[]`, `PatientSupervisor[]`, `SupervisedDraft[]`, `DoctorPatientNote[]`.

**Open gap:** a patient with `doctorId = null` is retained but unreachable, because the lookup matches owner-or-supervisor. Making it reachable exposes personal data across practices and needs a product decision (`FUNCTIONAL-AUDIT.md`, open threads).

#### `PatientChatMessage`
One message in a patient's team chat. `authorId` → `User` (cascade), `authorName` is a snapshot at send time, `body` (default `""`), `attachmentUrl?`. Index `patientId`. Cascades with `Patient`.

#### `SupervisedDraft`
A supervising practice's own unprinted visit for a patient it supervises — what `Patient.incompleteRx` is for the owner's practice. A supervisor may never write the owner's `incompleteRx`.
`doctorId` (the supervising *practice*), `patientId`, `data Json` (opaque editor snapshot). Unique `(doctorId, patientId)`. Cascades with both.

### 3.3 Prescriptions

#### `Prescription`
One completed visit, created by Save & print (`POST /prescriptions`). The API exposes create and read only (`GET /prescriptions?patientId=`, `GET /prescriptions/:id`); there is no update or delete route.

| Field | Type | Notes |
|---|---|---|
| `patientId` → `Patient` | String | cascade |
| `doctorId` → `User` | String | cascade. For a supervising doctor this is **their own** id |
| `chiefComplaints`, `previousComplaints`, `history`, `investigation`, `drugHistory`, `onExamination`, `note`, `plan`, `provisionalDiagnosis`, `associatedIllness`, `finalDiagnosis` | String[] | one entry per line |
| `advice`, `adviceTest` | String[] | |
| `followUpNum?`, `followUpUnit?` | String | |
| `followUpMandatory` | Boolean, default `false` | |
| `items` | `PrescriptionItem[]` | |

`note` and `plan` were one field until 2026-09-07. Rows from before keep everything in `note`; nothing was moved, because which line was a plan is a clinical judgement.
Indexes: `patientId`, `doctorId`.

#### `PrescriptionItem`
One line of the ℞ pad.

| Field | Type | Notes |
|---|---|---|
| `prescriptionId` | String | cascade |
| `drug` | String | may be empty on a note line or a tapering line |
| `dose`, `duration`, `instruction` | String | `instruction` is the food/timing cell |
| `order` | Int, default 0 | |
| `isNote` | Boolean, default `false` | free-typed note line, not a medicine |
| `sf?` | String | "Start From" date (IPD pad), e.g. `17 June 2026` |
| `isCont` | **Boolean?** | this line is a `>>>` tapering continuation of the line above |

`isCont` is nullable on purpose. `null` means "written before the column existed" and must **not** be read as `false`: on those rows the only signal is a blank `drug`, and guessing would invent a tapering schedule nobody prescribed.
Index: `prescriptionId`.

#### `PrescriptionDraft`
The doctor's auto-saved editor state, one row per user. `userId` unique, `data Json` stored and returned verbatim. Deleted when the prescription is saved or the form is reset.

#### `PrescriptionTemplate`
`doctorId`, `category` (`opd` · `ipd` · `custom`), `name`, `items Json` (an `RxItem[]`, including `generic` so alerts keep working), `order`. Index `(doctorId, category)`.

#### `PrescriptionLayout`
Print setup, one row per user (`userId` unique). Numbers are strings because they mirror form inputs.

| Group | Fields (defaults) |
|---|---|
| Page | `unit` `in`\|`cm` (`in`), `totalHeight` (11), `totalWidth` (8.25), `leftMargin` (0.3), `rightMargin` (0.2), `headerHeight` (1.7), `footerHeight` (0.8) — shown as **Top margin** / **Bottom margin** |
| Type | `rxType` `opd`\|`ipd` (`ipd`), `opdLayout` `single`\|`extra` (`single`; `extra` adds a privacy page) |
| Header | `headerSplit` (false), `headerAlign` `left`\|`center`\|`right`, `headerHtml`, `headerLeftHtml`, `headerRightHtml` (all `""`) |
| Footer | `footerHtml` (`""`) |
| Body | `bodySplit` (`""` = auto), `bodyLeftTopMargin` (0), `bodyRightTopMargin` (0), `bodyBottomLine` (false) |

HTML blocks are capped at 100 000 characters by the DTO and sanitised on the client before printing.

### 3.4 OPD and IPD

#### `OpdVisit`
A row in today's queue.

| Field | Type | Notes |
|---|---|---|
| `doctorId` | String | practice owner; no FK |
| `patientId?` → `Patient` | String | `onDelete: SetNull` |
| `name`, `phone?`, `age?`, `gender?` | | snapshot, so the row survives without a saved patient |
| `type` | String, default `New` | `New` · `Follow-up` · `Urgent` |
| `token` | String | `T-01`, `T-02`… per doctor per day, from the max existing serial inside a transaction |
| `status` | String, default `waiting` | `waiting` · `done` |
| `rxStatus?` | String | `incomplete` (started, not printed) · `complete` (Save & print done); null for manually queued visits |

Index `(doctorId, createdAt)`. `manual-opd-token-unique.sql` (a uniqueness backstop) is committed and **may be unapplied**.

#### `Ward`
A named group of admissions inside one practice. `doctorId` → `User` (cascade), `name`. Unique `(doctorId, name)`.

#### `IpdTeamMember`
One user on one ward's team. `wardId` (cascade), `userId` (cascade), `permissions String[]` (`ipd.*`), `status` `active`\|`suspended`. Unique `(wardId, userId)`. **Deliberately not `Assistant`**: an assistant link grants the whole practice; a ward team must never widen into that.

#### `IpdAdmission`

| Field | Type | Notes |
|---|---|---|
| `doctorId` | String | practice owner; no FK |
| `patientId?` → `Patient` | String | `SetNull`. Must be a patient the practice can reach |
| `bed`, `name` | String | `manual-ipd-bed-unique.sql` may be unapplied |
| `hospitalId?`, `roomNo?`, `floorBuilding?`, `mobile?`, `age?`, `sex?`, `diagnosis?` | | |
| `wardNo?` | String | the ward's *name* — what prints and displays |
| `wardId?` → `Ward` | String | `SetNull`; null on admissions that pre-date wards or free-typed a ward. Never derive access from `wardNo` |
| `status` | String, default `Stable` | `Stable` · `Observation` · `Critical` · `Discharge` |
| `clinical` | Json, default `{}` | the per-admission sheet — see [§4](#4-json-column-shapes) |
| `admittedAt`, `createdAt` | DateTime | |

Index `doctorId`.

#### `IpdEvent`
Admission feed. `admissionId` (cascade), `author`, `role?`, `note`, `reportUrl?`, `createdAt`. Index `(admissionId, createdAt)`. Every analogue-sheet operation files one in the same transaction.

### 3.5 Learned and personal tables

These are per signed-in person or per practice and **never shared across doctors**.

| Model | Key | What it holds | Derived? |
|---|---|---|---|
| `DoctorRxHabit` | unique `(doctorId, drugKey, signature)` | A doctor's repeated instruction block for a medicine **including strength**: `drugKey`, `searchKey`, `drugLabel`, `signature`, `algoVersion`, `dose`, `food`, `duration`, `contLines Json` (`[{dose, food, duration}]`), `patientCount`, `lastUsedAt`, `pinned`, `hidden` | Yes — rebuildable with `server/scripts/rebuild-rx-habits.js` |
| `DoctorPhraseHabit` | unique `(doctorId, source, signature)` | Free-text sibling: `source` = `advice` \| `rxNote`, `signature`, `text`, `patientCount`, `lastUsedAt`, `hidden` | Yes — `rebuild-doctor-phrases.js` |
| `DoctorDrugAdvice` | unique `(doctorId, scope, key)` | The doctor's own standing advice: `scope` = `medicine` \| `generic` \| `diagnosis`, `key`, `label`, `lines String[]` | No — typed by the doctor |
| `DoctorPatientNote` | unique `(userId, patientId)` | Private formatted note: `patientInfo Json` (name/age/sex/address/mobile, **frozen at first save**), `html` | No |
| `DoctorRevisionNote` | `userId` unique | One notebook per user: `html`. No patient data. A save is accepted only over the copy it was written from (`updatedAt`) | No |

Rules that shape these tables (full reasoning in [DOMAIN.md](DOMAIN.md)):

- **`patientCount` counts distinct patients, never `increment: 1`.** It is the only signal separating routine practice from a one-off.
- **They never originate clinical content.** Every character is echoed from a prescription the doctor already saved and printed.
- **No DELETE route.** "Deleting" a suggestion sets `hidden`.
- **Only completed prescriptions teach.** Drafts and parked visits never count; an empty block is not a habit.
- `DoctorRxHabit` additionally relies on a `("doctorId","searchKey" text_pattern_ops)` index that Prisma cannot express; it is created in `manual-rx-habits.sql`. This database's collation is `C.UTF-8`, which Postgres does not treat as pattern-safe, so the plain btree does not serve `LIKE 'prefix%'`.

### 3.6 Practice settings and audit

| Model | Fields | Notes |
|---|---|---|
| `Chamber` | `userId`, `address`, `mapLink?`, `order` | Index `userId` |
| `OtherCertificate` | `userId`, `url`, `details?`, `order` | Index `userId` |
| `ActivityLog` | `doctorId`, `actorName`, `patientId?`, `patientName?`, `section` (≤60), `detail` (≤400), `action` `added`\|`saved`, `imageUrl?`, `createdAt` | Index `(doctorId, createdAt)`. The audit trail behind "Notifications, Chats & Reports", shared per practice |

### 3.7 The `medicines` table (raw)

Not in `schema.prisma`, not managed by Prisma. Queried with parameterised `$queryRaw` only.

Columns the app reads: `id`, `"brandName"`, `"genericName"`, `"dosageForm"`, `strength`, `company`, `"priceRaw"` (the chart's own price text, read on the client in `lib/monthlyCost.ts`).

| Used by | Query shape |
|---|---|
| `GET /medicines/search` | `ILIKE` over brand/generic, ranked brand-prefix → brand-contains → generic-prefix → generic-contains |
| `POST /medicines/by-brand`, `rx-habits` generic lookup | **equality** on the brand's first word (`catalogue.ts`), never a per-brand pattern — a pattern is tried against every row and took 5–7 s at 35 000 rows |

The generic name is a safety field: prescribing-alert rules are written against generics, while the ℞ line carries a brand.
The physician's medicine chart has no drug-class column, and none is invented.

## 4. JSON column shapes

JSON columns are unknown at every boundary. Readers coerce what they can, drop what they cannot, and never read a missing value as a clinical "no".

| Column | Shape | Notes |
|---|---|---|
| `Patient.drugHistory` | `string[]` of date-stamped lines, `"dd/mm/yyyy: Drug — …"` | Current vs Distant past is **derived at read time** from the date (`lib/drugHistorySplit.ts`): Current = every entry of the latest dated visit before today plus what was added to Current today. `01/01/2000` is the no-date marker. Lines are appended by the server under the row lock (`POST /patients/:id/drug-history`), never replaced from a device |
| `Patient.investigationSummary` | `[{ date, category, test, value }]` | Merged from saved prescriptions and the records-page Add. A multi-box result's parts are joined by a comma and nothing else |
| `Patient.onExaminationSummary` | `[{ date, text }]` | |
| `Patient.familyMembers` | `[{ name, mobile, nid, sex, relation }]` | Reciprocal links are written under a row lock |
| `Patient.incompleteRx` | opaque editor snapshot | Carries its own fingerprint of "what was printed" (`lib/visitSig.ts`). The owner practice's value only; a supervising practice reads `SupervisedDraft` instead |
| `Patient.hmDrugDates` / `hmSymptomDates` | `{ [name]: { sf, upto } }` | Blank side = keep the derived date. An override equal to the record is dropped, so "dashed" always means "moved away from the record" |
| `Patient.imageThumbs` | `{ [fullUrl]: thumbUrl }` | A URL with no entry falls back to the full image |
| `IpdAdmission.clinical` | `{ chiefComplaints` (shown as "Sign")`, symptoms, investigation, procedure, followUp, plan, adviceTests, rxItems, analogueSheets }` | **`PATCH /ipd/:id` replaces the whole column.** A key the client omits is deleted. New per-admission data gets its own route |
| `IpdAdmission.clinical.analogueSheets` | `[{ id, url, thumbUrl?, addedAt, addedBy?, label?, removedAt?, removedBy? }]` | Written only by `/ipd/:id/analogue*`. `id` and `addedAt` are assigned by the server. Soft removal. The order is the chronology of the round and cannot change |
| `User.investigationGroups` | `[{ name, tests: string[] }]` | |
| `User.investigationUnitPrefs` | `{ [testName]: "u1" \| "u2" }` | |
| `User.fieldRecents` | `{ [fieldLabel]: string[] }` | |
| `DoctorRxHabit.contLines` | `[{ dose, food, duration }]` | A block whose lines cannot be read is dropped **whole**, never partly |

## 5. Delete behaviour

| Parent | Child | On delete |
|---|---|---|
| `User` | `Prescription`, `ActivityLog`, `Assistant` (both sides), `Chamber`, `OtherCertificate`, `PrescriptionTemplate`, `PrescriptionLayout`, `PrescriptionDraft`, `RefreshToken`, `Ward`, `IpdTeamMember`, `PatientChatMessage`, `PatientSupervisor`, all `Doctor*` tables, `SupervisedDraft` | **Cascade** |
| `User` | `Patient.doctorId` | **SetNull** — the patient and their history survive |
| `Patient` | `Prescription`, `PatientChatMessage`, `PatientSupervisor`, `SupervisedDraft`, `DoctorPatientNote` | **Cascade** |
| `Patient` | `OpdVisit.patientId`, `IpdAdmission.patientId` | **SetNull** |
| `Ward` | `IpdTeamMember` | Cascade |
| `Ward` | `IpdAdmission.wardId` | SetNull |
| `IpdAdmission` | `IpdEvent` | Cascade |
| `Prescription` | `PrescriptionItem` | Cascade |

Deleting a **patient** is owner-only and answers 409 while another doctor (a supervisor) holds prescriptions for them, because those would cascade away unseen. A user "delete" from the admin app is first a soft delete (`deletedAt`); a hard delete is a separate admin action.

Clinical documents are never hard-deleted by a feature: analogue sheets use `removedAt`/`removedBy`, learned suggestions use `hidden`.

## Migrations

**Prisma Migrate is not used.** Against this database it finds a schema with no migration history and offers to reset it.

1. Edit `server/prisma/schema.prisma`.
2. Write an idempotent `server/prisma/manual-<name>.sql` (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
3. Table created as `postgres`? `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.
4. Apply from `server/`:
   ```bash
   npx prisma db execute --file prisma/manual-<name>.sql --schema prisma/schema.prisma
   ```
5. Stop the API on `:4000`, then `npx prisma generate` (Windows locks the query-engine DLL otherwise).
6. Additive only. The next deploy does **not** run migrations; the SQL must be applied **before** the release that reads it.

Do not assume a `manual-*.sql` file was applied — check the database. `manual-opd-token-unique.sql` and `manual-ipd-bed-unique.sql` are noted in the repo as possibly unapplied; this document did not verify that against the live database.

Tests never touch this database. Database-backed tests use the throwaway container on `127.0.0.1:5544`, built by `cd server && npm run test:db` (the one place `prisma db push` is allowed, forced to that container).

## Related

- [TRD.md](TRD.md) — how requests reach these tables and which guard decides whose rows they are
- [AppFlow.md](AppFlow.md) — which screen writes which table
- [DOMAIN.md](DOMAIN.md) — the physician's decisions behind the shapes above
