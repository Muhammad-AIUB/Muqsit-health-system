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

- ⚕️ Whose patient a practice can reach is asked in ONE place, `server/src/patients/reach.ts#patientReachWhere` (own / supervising / opened with the patient's code); `PatientsService`, the OPD queue, IPD admission and prescription create all use it — never a fourth hand-written `OR`.
- ⚕️ A patient of another practice opens only by the patient's own code (`/patient-access`): the code never leaves the server except in the patient's SMS, is kept only as an HMAC, lives 10 minutes, allows 5 wrong tries claimed atomically, and the gateway is refused when unconfigured (it would log the code and say "sent").
- ⚕️ Isolation (admin) is read IN the reach query, so it closes access already given: a grant counts only while neither the practice nor the patient's owner is `isolated`; it never closes the owner's own door or a supervising doctor's.
- A grant is not a `PatientSupervisor`: it never puts the practice in the owner's patient chat, and what the practice may do is what a supervising doctor may do.

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

## ⚕️ Opened with the patient's own code (physician's sheet, 16/11/2026)

_New with this feature._ The physician: "ek doctor er patient jokhon onno doctor er kase jabe tokhon doctor phone number search korbe, patient list ashbe, then enter korle ekta verification code jabe patient er phone e, oi code ta dile doctor code ta paste korle tkhon patient er info dekhte pabe". Decided with the physician (16/11/2026): the practice then sees what a supervising doctor sees, and the permission is **permanent** once the code is entered. It also settles the old open question "mobile number **and security access**" for unowned patients (`docs/audit/access-and-scoping.md`): the code is the claim.

- **One definition of reach.** `patients/reach.ts#patientReachWhere(doctorId)` is the `where` for `PatientsService.accessibleWhere`, `OpdService.decorate`, `IpdService.create` and `PrescriptionsService.create`. Three ways in: own, `PatientSupervisor`, `PatientAccessGrant`. Pinned by `reach.spec.ts` (the shape) and `test/patient-access.int-spec.ts` (real rows). A new patient-scoped endpoint takes its `where` from it.
- **A grant is NOT a supervisor.** A new table, so the practice never lands in the owner's team chat (`patient-chat.service.ts` reads `PatientSupervisor` only; pinned by an int test). Everything else is the supervising doctor's column of the Rule 2 table: reads the patient, prescribes under its OWN `doctorId`, never sees the owner's prescriptions, never edits the owner's record (`patient.doctorId !== doctorId` in the service), never deletes the patient.
- **Isolation is part of the query.** `grant.doctor.isolated = false` AND (owner is null OR owner.isolated = false). Turning `isolated` on in the admin therefore closes access already given and turning it off opens it again — nothing is grandfathered, nothing is deleted. An isolated practice is shown no other practice's patient (`search` answers `isolated: true`), cannot ask or enter a code (403), and its own patients are not listed or askable (404, the answer for no such patient).
- **The code.** Six digits from `crypto.randomInt` (never `Math.random`); stored as `HMAC-SHA256(JWT_SECRET, JSON([patient, practice, code]))` — a code for one patient or practice opens no other, and the table alone gives no codes back; 10 minutes; 5 wrong tries, **claimed atomically** (`UPDATE … SET attempts = attempts + 1 WHERE attempts < 5`) so a burst of 12 guesses counts five; the right code spends a try too; compared in constant time; a malformed code costs no try. A new code deletes the practice's earlier unused ones. Cool-down 60 s per (patient, practice) and 5 codes an hour per patient across all practices, both read under `pg_advisory_xact_lock` so two presses at once send one text; routes are throttled (20 / 10 / 20 a minute).
- **The text.** `SmsService.send` — its `{ok, detail}` is never swallowed (a lost code is the whole failure mode): a failure is a 502 and the unsent code row is removed. An unconfigured gateway is refused with 503 BEFORE anything is stored, because `send` would log the message (the code) and answer ok. The number is the PATIENT'S, through `normaliseBdMobile` (refuses rather than guesses → 422), never the asking doctor's. The wording (`code.ts#codeMessage`) is the builder's, not the physician's; the doctor's name has control characters and newlines stripped and is cut at 40. Not charged to the wallet.
- **What is shown before the code:** `{ id, name, sex, age }` and nothing else — no number, address, history, and never whose patient it is. That a name is shown to a doctor who has only typed a number is the physician's design ("patient list ashbe"); see the open thread.
- **Not built:** taking a grant away (neither the patient nor the owner can revoke it; only isolation closes it, or a delete of the row by hand); a log of access for the owner to read (the server logs `access granted patient=… practice=…`, never the code or the number).

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
