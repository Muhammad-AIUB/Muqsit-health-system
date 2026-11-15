# Server architecture

> **Read this before changing the code it covers.** Named in these rules: `catalogue.ts`, `manual-revision-notes.sql`, `expectedUserId`, `revision-notes`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- How it works — Module map of `src/`; `revision-notes` is keyed by the authenticated user: a stale save, a wrong `expectedUserId` or a save with no id is a 409 (+N more).

---

# The rules, in full

## Module map (src/)

_From `server/CLAUDE.md`._

`auth` (cookie JWT + refresh rotation + OTP email verify) · `users` · `admin` (registrations, tier changes, evict) · `assistants` (doctor→assistant links + permission keys) · `wards` (IPD wards + their teams) · `workstations` (X-Workstation resolution) · `patients` (records, galleries, summaries, family tree, supervised access) · `prescriptions` + `prescription-draft` + `prescription-layout` + `templates` · `opd` / `ipd` (queues, admissions, follow-ups) · `patient-chat` (per-patient team chat + PatientSupervisor + `/supervised`) · `activity` (audit feed) · `medicines` (search; the chart's rows by brand for the monthly-cost box and, with `genericName` since 02/11/2026, for Drug history's generic names — `catalogue.ts` holds the one query by a brand's first word, shared with `rx-habits`) · `statistics` (Settings → Statistics, read only, below) · `sms` (the SMS gateway, the practice's SMS wallet, the appointment SMS to a day's queue, payment requests) · `patient-drug-safety` (a patient's drug hypersensitivity / high-alert list, below) · `patient-notes` (a user's PRIVATE note per patient) · `revision-notes` (a user's own notebook, keyed by the AUTHENTICATED user, no workstation; a save from a stale copy is a 409, and so is a save or a read whose `expectedUserId` is not `@CurrentUser().id` — two tabs share one cookie, checked here so it does not depend on the page; a save with NO id is a 409 too (not a 400 — an old tab shows a 409's sentence and keeps the typing), a read with none is answered as before — `manual-revision-notes.sql`, applied 2026-10-18) · `drug-advice` (the doctor's own ••• advice per medicine/generic) · `mirror` (SSE device mirroring) · `uploads` · `mail` · `research` · `prisma`.
