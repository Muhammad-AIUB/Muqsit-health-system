# Access and scoping (workstation, assistants, supervised doctor)

> **Read this before changing the code it covers.** Named in these rules: `components/tabs/permissionUi.tsx`, `patients.service.ts#update`, `patients.controller.ts#update`, `PATCH /patients/:id`, `hmDrugDates`, `Lock`, `WorkstationGuard`, `accessibleWhere`, `assertMayEditAnalogue`, `can`, `canEditLabel`, `hmSymptomDates`, `IPD_PERMISSION_GROUPS`, `ipd.analogue`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `server/CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- The doctor is never taken from `req.user.id` or a request body: use `@WorkstationDoctorId()` — `WorkstationGuard` is the only place that decides whose practice a request acts on.
- A practice is never resolved again inside a service: pass the resolved `doctorId` in (a second resolver leaked another practice's activity feed).
- `WorkstationsService.resolve` is never extended for IPD ward-team logins: that would hand a ward nurse the whole practice's OPD records.
- Practice-data controllers use `JwtAuthGuard, WorkstationGuard` and take the doctor from `@WorkstationDoctorId()` — never from `req.user.id`, never a client-sent doctorId in the body.
- Patient access table (owner / assistant / supervisor): DELETE patient is owner-only, always; a new patient-scoped endpoint must pick its column and mirror the `where` of `patients.service.ts`.
- `hmDrugDates` / `hmSymptomDates` are owner-only, denied by two layers: the controller stops an assistant, the service's `patient.doctorId !== doctorId` check stops a supervisor — both load-bearing.
- Do not put `hmDrugDates` back in `RX_LIFECYCLE` without a permission key; `PATCH /patients/:id` is the only route accepting `UpdatePatientDto` — keep that one door.
- An assistant without `rx.drugHistory` sees the drug safety list (it is not behind `Lock`) but gets no + / ✎ Edit.
- `ipd.analogue` is enforced server-side but deliberately not against assistants (they hold no `ipd.*` key at all); see `assertMayEditAnalogue`.
- Keep the `ipd.*` keys in `IPD_PERMISSION_GROUPS`, OUT of `PERMISSION_GROUPS` — folding them in would revoke IPD access from every existing assistant.
- A new ward team member starts with nothing ticked: on a ward, silence must mean "cannot", never "can".
- Permission gating uses `can(key)` / `canEditLabel(label)` from context and `<Lock>` around read-only sections; tier gating reads `user.accountTier`

Filed with the entry they belong to, in another file:

- The `Lock` in `LeftColumn` stays: an assistant without `rx.drugHistory` must not be handed a patient's medications by the read-only view. → [`drug-history.md`](drug-history.md)
- Note and Plan both carry `rx.note` via explicit `permKey`; never put "Plan" into `PERM_KEY_OF_LABEL` (IPD label); a label colliding across screens must pass `permKey` → [`visit-sheet.md`](visit-sheet.md)

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not take the doctor from `req.user.id` or a request body. Use `@WorkstationDoctorId()` — `WorkstationGuard` is the only place that decides whose practice a request acts on.
- We do not resolve a practice again inside a service. Pass the resolved `doctorId` in — a second resolver leaked another practice's activity feed (fixed 2026-08-27).

- We do not extend `WorkstationsService.resolve` for IPD ward-team logins. That would hand a ward nurse the whole practice's OPD records.

## ⚠️ Rule 1 — every patient-data query is doctor-scoped

_From `server/CLAUDE.md`._

Controllers touching practice data use `@UseGuards(JwtAuthGuard, WorkstationGuard)` and take the doctor from `@WorkstationDoctorId()` — **never** from `req.user.id` directly, and never trust a client-sent doctorId in the body. `WorkstationGuard` resolves the `X-Workstation` header: absent/own id → own context; a doctor the user actively assists → that doctor + granted permission keys; anything else → 403.

## ⚠️ Rule 2 — the patient access model (do not widen casually)

_From `server/CLAUDE.md`._

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

## ⚕️ H/O drug hypersensitivity and High-Alert Medication (physician's sheet, 31/10/2026)

_From `client/CLAUDE.md`._

- **An assistant without `rx.drugHistory`** sees the list (it is not behind `Lock`) but gets no + / ✎ Edit.

## Analogue order sheet — the ward's paper sheet, photographed (2026-08-26)

_From `client/CLAUDE.md`._

- `ipd.analogue` exists as a permission key and is enforced **server-side**, but
  deliberately not against assistants — they hold no `ipd.*` key at all, so
  requiring one would take away something they can already do on every other
  field of this screen. See `assertMayEditAnalogue`.

## IPD wards and their teams

_From `client/CLAUDE.md`._

- **The `ipd.*` keys live in `IPD_PERMISSION_GROUPS`, deliberately OUT of
  `PERMISSION_GROUPS`.** That second list drives the assistant editor and the
  assistant gating, and an assistant reaches IPD today with no key at all — so
  folding the IPD keys in would revoke access every existing assistant already
  has. The two editors share their look through `components/tabs/permissionUi.tsx`,
  not their key list.
- A new team member starts with **nothing ticked**. On a ward, silence has to
  mean "cannot", never "can".

## UI conventions

_From `client/CLAUDE.md`._

- Permission gating: `can(key)` / `canEditLabel(label)` from context (assistant permissions); wrap read-only sections in `<Lock>`. Tier gating reads `user.accountTier`.
