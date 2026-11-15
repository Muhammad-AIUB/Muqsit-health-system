# Muqsit Health System

**A prescription and practice-management platform for doctors in Bangladesh.** Real
physicians write real prescriptions through it every day, so every feature is built to a
patient-safety-first standard: nothing clinical is guessed, nothing entered is silently
lost, and no doctor can see another practice's patients by accident.

<p>
  <img alt="Next.js 14" src="https://img.shields.io/badge/Next.js-14-000?logo=nextdotjs&logoColor=white">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white">
  <img alt="NestJS 10" src="https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white">
  <img alt="Prisma 5" src="https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
</p>

**Live:** [muqsithealthsystem.com](https://muqsithealthsystem.com) · API at
`api.muqsithealthsystem.com/api` · admin at `admin.muqsithealthsystem.com`

**Documentation:** [`docs/README.md`](docs/README.md) is the map — what the app is, how it
is built, and where each thing is written down.

---

## What it does

| Area | Capability |
|---|---|
| **Prescribing** | Full editor with medicine search over a live drug table, dose/food/duration shorthand, the doctor's own usual lines and templates, an auto-saved draft, "save to complete later" |
| **Safety** | Drug–condition and drug–drug advisories computed live from the editor, never stored or printed, each one showing its own evidence; a patient's drug hypersensitivity and high-alert list, printed on the sheet |
| **OPD** | A queue booked by day and by chamber, with a schedule, reception marks, a status worked out from them, a printable queue and an appointment SMS to the day's patients |
| **IPD** | Ward board, admissions, bed occupancy, a clinical sheet per admission, the ward's paper order sheets photographed into it, ward teams |
| **Patients** | Mobile-first lookup, family tree with reciprocal links, supervising-doctor sharing, a records page with the drug history as a table, report galleries, permission documents and (premium) DICOM imaging |
| **Clinical tools** | 75 published clinical calculators (scores, formulas, reference ranges) wired into the investigation flow |
| **Collaboration** | Per-patient team chat, an activity feed, real-time device mirroring over SSE |
| **Output** | Print/PDF prescriptions, privacy copies, an image of every printed sheet filed with the patient |
| **Practice** | Assistants with section-level permissions, chambers, Settings → Statistics, an SMS wallet with payment requests |

The full list, with what is deliberately not built: [`docs/PRD.md`](docs/PRD.md).

---

## Problems worth reading about

These are the parts that were genuinely hard. The reasoning is kept with the rule it
produced, in [`docs/rules/`](docs/rules/README.md).

**Dates that lie.** `new Date("25/07/2026")` is `Invalid Date`, and `03/06/2026` silently
becomes 6 March — JavaScript reads slashes as month/day/year. Doctors here type `030626`.
Both problems are solved once, in [`lib/dateInput.ts`](client/src/lib/dateInput.ts): an
explicit `dd/mm/yyyy` parser with calendar validation, and a sliding two-digit-year window
with a **per-field policy** — a date of birth may never be in the future (`030398` is 1998,
not 2098), while a follow-up date legitimately may be. A global "never future" rule would
have been the same bug pointing backwards. → [`docs/rules/dates.md`](docs/rules/dates.md)

**A blank safety banner must mean "checked".** The prescribing check reads values that come
out of JSON columns and older drafts, so a field typed `string` can arrive as `null` or a
number. The matcher is therefore total: it coerces what it can, skips what it cannot, and
returns a count of unreadable values that the UI turns into a visible *"check was
incomplete"* notice. It renders inside an error boundary, because the banner lives in the
screen a doctor prescribes through and React unmounts the whole tree on a render error.
→ [`docs/rules/rx-alerts.md`](docs/rules/rx-alerts.md)

**Scoping is a safety boundary, not a filter.** Several relationships can reach a patient —
owner, assistant working inside a practice, supervising doctor assigned to one patient —
and each sees a deliberately different slice. A supervisor never sees the owner's
prescriptions; patient deletion is owner-only, always. When ward teams were added, the
obvious implementation would have routed a ward member's login through the existing
workstation resolver — and quietly handed a ward nurse the practice's entire OPD. That
route is ruled out; a separate, narrower door is the design, and the ward member's own
login is not built yet. → [`docs/rules/access-and-scoping.md`](docs/rules/access-and-scoping.md)

**A patient is not the property of a doctor.** The same person returns to a different
clinic and is found again by mobile number, so deleting a doctor's account keeps their
patients and demographics (`onDelete: SetNull`) while cascading only that doctor's own
prescriptions. → [`docs/SCHEMA.md`](docs/SCHEMA.md)

**Migrations against a live shared database.** Prisma Migrate is not used. Every schema
change ships as a hand-written idempotent SQL file (`ADD COLUMN IF NOT EXISTS …`), applied
through an SSH tunnel — 39 of them so far — because the same PostgreSQL instance serves
development and production. Only additive changes are ever allowed.
→ [`docs/rules/db-and-prisma.md`](docs/rules/db-and-prisma.md)

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  client/     │     │  admin/      │     │  server/     │
│  Next.js 14  │     │  Next.js 14  │     │  NestJS 10   │
│  :3000       │     │  :3001       │     │  :4000       │
│  doctor app  │     │  back office │     │  REST /api   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └── cookie auth, X-Workstation, X-Chamber ┤
                                                 │
                                        ┌────────▼────────┐
                                        │   PostgreSQL    │
                                        │   Prisma 5      │
                                        │   35 models     │
                                        └─────────────────┘
```

- **`client/`** — App Router shell, one React Query layer, a single context store for
  editor state. Inline styling against a fixed clinical palette; no UI framework.
- **`server/`** — 31 NestJS modules. Cookie JWT with rotating refresh tokens (and a
  10-second grace window so concurrent tabs don't log each other out), a workstation guard
  that resolves whose practice a request acts on, SSE fan-out for device mirroring.
- **`admin/`** — registration review, account tiers, the account trash, SMS payment requests.

**As of 2026-11-15:** 31 server modules · 35 data models · 39 manual SQL files · 75 clinical
calculators · 213 client unit-test files · 38 server unit specs · 25 integration specs ·
26 browser journeys.

**Delivery:** every push to `main` builds and deploys to the VPS through GitHub Actions;
database migrations stay manual and reviewed, on purpose.

More: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (how it is built) ·
[`docs/CODEMAP.md`](docs/CODEMAP.md) (where each thing lives).

---

## Running it locally

```bash
npm run install:all      # install client, server and admin
npm run dev              # api :4000 + web :3000 + admin :3001
```

The server expects a PostgreSQL connection string in `server/.env`, and the client needs
`NEXT_PUBLIC_API_URL` in both `.env.local` and `.env.production`.

> **The development database is the production database.** `server/.env` points, through
> an SSH tunnel, at the one shared PostgreSQL: anything written while developing is written
> to real records. Tests and visual work use a throwaway sandbox instead —
> [`docs/testing/e2e.md`](docs/testing/e2e.md).

Before any commit — typecheck in all three apps, both server suites, the client suite:

```bash
cd server && npx tsc --noEmit -p tsconfig.json && npm test
```

```bash
docker compose -f docker-compose.test.yml up -d
```

```bash
cd server && npm run test:db && npm run test:int
```

```bash
cd client && npx tsc --noEmit && npm test
```

```bash
cd admin && npx tsc --noEmit
```

The browser journeys, and what each layer covers:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#9-testing-strategy).

---

## Repository guide

| Path | What lives there |
|---|---|
| [`docs/`](docs/README.md) | All documentation: product, architecture, code map, domain, rules, open threads |
| [`CLAUDE.md`](CLAUDE.md), [`client/CLAUDE.md`](client/CLAUDE.md), [`server/CLAUDE.md`](server/CLAUDE.md), [`admin/CLAUDE.md`](admin/CLAUDE.md) | What an AI session loads by itself: the prime directive, the commands, and one line per rule pointing into `docs/rules/` |
| `client/` | The doctor app |
| `server/` | The API; `server/prisma/manual-*.sql` is the real migration history |
| `admin/` | The admin console |
| `e2e/`, `load/` | Browser journeys (Playwright) and load tests (k6), both against throwaway databases |
| `client/src/lib/calculators/` | The 75 clinical scores and formulas |

---

<sub>Built for a practising physician. Not open for redistribution.</sub>
