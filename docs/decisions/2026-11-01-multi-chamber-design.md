# Multiple chambers (OPD) — design, 2026-11-01

Physician's sheet 28/10/2026, item 8 (Banglish): *"Chamber logo. Prescription lekhar pashe 'My Chamber'
option add hobe. Dhoro ami Labaid boshi abar Ibn Sina o boshi. Settings er add chamber dia chamber add kora
jabe. Note Ibn Sina and Labaid er OPD list kintu different hobe. User can set multiple chamber er jonno
different prescription settings (OPD only)."*

## What exists and why it is not reused

`Chamber` (schema.prisma) is the PROFILE's list of practice locations (address + map link). Every profile
save **deletes and recreates** those rows (`users.service.ts`), so their ids are not stable and nothing may
point at them. A queue row pointing at one would lose its chamber on the next profile edit. So the OPD
chamber is a **new table, `OpdChamber`**; the profile list is left exactly as it is.

## Data (all additive — `server/prisma/manual-opd-chambers.sql`, idempotent, NOT applied by this change)

- `OpdChamber` — `id`, `doctorId` (the PRACTICE doctor, `@WorkstationDoctorId()`), `name`, `address`,
  `isDefault`, `createdAt`, `updatedAt`, `removedAt` (soft removal). One default per doctor (partial unique
  index). `OWNER TO exhort_user`.
- `OpdChamberLayout` — `chamberId` (PK), `doctorId`, `layout` (JSON, the same fields as `PrescriptionLayout`),
  `updatedAt`. A chamber with no row prints with the doctor's own settings (fallback).
- `OpdVisit.chamberId`, `OpdDaySetting.chamberId` — nullable. **NULL = the default chamber** — the single
  chamber every row before this release belongs to. A visit or schedule of the default chamber is always
  stored with NULL (never its id), so "the default chamber's rows" is one predicate and old rows need no
  backfill.
- Indexes REPLACED (additively, idempotently, a duplicate reported with a NOTICE, never forced):
  `OpdVisit_doctorId_queueDate_token_key` → `OpdVisit_doctor_chamber_day_token_key` on
  `(doctorId, COALESCE(chamberId, ''), queueDate, token)`; `OpdDaySetting_doctorId_day_key` →
  `OpdDaySetting_doctor_chamber_day_key` on `(doctorId, COALESCE(chamberId, ''), day)`. For default-chamber
  rows the guarantee is exactly the old one; two chambers may each have a `T-01` on one day.

## The default chamber

Made on first read of the list (`GET /chambers`) if the practice has none: named "Main chamber", with the
address of the doctor's FIRST profile chamber (copied once, never overwritten later — the doctor edits it
here). It cannot be removed (it holds every visit from before chambers). The doctor can rename it.

## Choosing the active chamber

"My Chamber" — a chip with a doctor-at-desk icon beside the prescription writing area (desktop and the OPD
tab). The choice is per signed-in user, per practice, per device (`localStorage`
`mhs_chamber:<userId>:<practiceDoctorId>`); none chosen = the default chamber. Every request carries it as
the `X-Chamber` header (like `X-Workstation`). Switching drops the cached OPD queue, schedule and chamber
layout so nothing of the last chamber is shown under the new one.

## Server rules

- `ChambersService.resolve(doctorId, header)` is the ONE place that decides the chamber: absent/empty → NULL
  (default); the default chamber's id → NULL; another live chamber of THIS doctor → its id; anything else
  (another practice's chamber, a removed one, garbage) → **404**, never trusted, never "fall back".
- OPD: list / add / schedule (read and save) / rx-status (Save & print) act on the resolved chamber.
  Status, presence and move act on a visit by id (doctor-scoped as before); move reorders within the
  visit's OWN chamber and day. A day that has passed stays locked as before. Inheriting a schedule looks
  only at earlier days of the SAME chamber.
- `GET|PUT|DELETE /chambers/:id/layout` — the chamber's own print settings (OPD only). PUT starts from the
  doctor's current settings the first time. Writing chambers and their settings is for the practice OWNER
  (an assistant may read and choose a chamber).

## Client

- Settings → Chambers: list, add, rename, edit address, remove (soft, `confirmAction`). Default marked.
- Prescription settings: a "Settings for" selector (General / each chamber). A chamber with none of its own
  shows "Using the general settings" until saved; "Use general settings" removes the chamber's own.
- Printing in the OPD editor uses the active chamber's settings, else the doctor's. IPD untouched.

## Tests

Unit: `resolve` cases; queue where-clause. Integration: two chambers, same day, each gets `T-01`; a foreign
chamber id → 404; legacy NULL rows listed in the default chamber and not in another; schedules per
chamber; layout fallback; owner-only writes. Scratch-DB check of the SQL with old-shape rows.

## Not in this change

SMS per chamber (the address is stored for it); IPD; moving a visit between chambers.
