# Muqsit Health System — documentation

Start here. This page says what the app is, how it is put together, and where each thing is written down.

## What the app is

A prescription and practice-management platform for doctors in Bangladesh. Real physicians write real prescriptions through it every day, so it is built patient-safety first: nothing clinical is guessed, nothing entered is silently lost, and no doctor sees another practice's patients by accident.

A doctor uses it to see a patient (OPD queue or IPD ward), write the visit — complaints, history, examination, investigations, diagnosis, medicines, advice — with a live prescribing-safety check, print the prescription, and keep the patient's record. Assistants work inside a doctor's practice with the permissions they are given; a supervising doctor can be assigned to one patient; an admin approves accounts.

## How it is put together

| App | Folder | Stack | Port | For |
|---|---|---|---|---|
| Doctor app | `client/` | Next.js 14 (App Router), React 18, React Query 5 | 3000 | Prescribing, OPD, IPD, patients, settings |
| Admin console | `admin/` | Next.js 14 | 3001 | Registrations, tiers, account trash, SMS payment requests |
| API | `server/` | NestJS 10, Prisma 5, PostgreSQL | 4000 (`/api`) | REST, cookie JWT, SSE |

The repository root only orchestrates the three (`npm run dev`, `npm run build`); each has its own `package.json`.

One request, end to end:

```
client/src/lib/api.ts#apiFetch        cookies + X-Workstation (whose practice) + X-Chamber (which chamber)
  → controller  @UseGuards(JwtAuthGuard, WorkstationGuard)
  → @WorkstationDoctorId()            the only source of "which doctor"
  → service                           receives the doctorId; never resolves it again
  → PrismaService                     (parameterised $queryRaw for the raw `medicines` table)
```

Three facts shape everything else:

1. **The development database is the production database** (one shared PostgreSQL, reached through an SSH tunnel). Anything written in development is written to real records; tests and visual work use a throwaway sandbox instead ([`testing/e2e.md`](testing/e2e.md)).
2. **A push to `main` is a release.** GitHub Actions builds and restarts production in two to three minutes. Database changes are separate, manual, additive SQL files.
3. **The rules have reasons.** Most rules in this repo were paid for by a defect that reached, or nearly reached, a doctor. They are kept with their reasons in [`rules/`](rules/README.md).

More: [ARCHITECTURE.md](ARCHITECTURE.md) (how), [CODEMAP.md](CODEMAP.md) (where).

## Where to start

| You are | Read, in this order |
|---|---|
| New to the project | this page → [PRD.md](PRD.md) (what and why) → [ARCHITECTURE.md](ARCHITECTURE.md) (how) → [CODEMAP.md](CODEMAP.md) (where) → [DOMAIN.md](DOMAIN.md) (the words) |
| About to change code — a person or an AI | the root [`CLAUDE.md`](../CLAUDE.md) (prime directive, commands, rules for every change) → the `CLAUDE.md` of the app you are in → the `rules/<topic>.md` it names for the feature → `audit/<topic>.md` for what is still open there |
| The physician / product owner | [FUNCTIONAL-AUDIT.md](FUNCTIONAL-AUDIT.md): its "Open" list is what waits for your decision → [ROADMAP.md](ROADMAP.md): the order of the rest |
| Reviewing or releasing | [`rules/testing-and-verification.md`](rules/testing-and-verification.md), [`rules/deploy-and-ops.md`](rules/deploy-and-ops.md), [`testing/e2e.md`](testing/e2e.md) |

## The documents

| Document | What it answers |
|---|---|
| [PRD.md](PRD.md) | What the product is for, who uses it, every feature, what it deliberately does not do |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The three apps, the request path, auth, access control, the client's design, environments, deploy, the test layers, known technical gaps |
| [CODEMAP.md](CODEMAP.md) | Where each module, screen, hook, lib group and test lives; "where do I change X?" |
| [APP-FLOW.md](APP-FLOW.md) | What a user does on each screen, step by step |
| [UI-SPEC.md](UI-SPEC.md) | What each screen and component looks like: colour, type, layout, the printed sheet |
| [SCHEMA.md](SCHEMA.md) | Every table and column, the JSON shapes, delete behaviour, the manual SQL files |
| [API.md](API.md) | Every route: path, DTO, scoping, permission keys. `server/test/contract-routes.int-spec.ts` fails when it and the code disagree |
| [DOMAIN.md](DOMAIN.md) + [`domain/`](domain/) | The vocabulary: one line per concept, then each concept with the physician's decision behind it |
| [`rules/`](rules/README.md) | What must and must not be done, each with its reason — one file per topic |
| [FUNCTIONAL-AUDIT.md](FUNCTIONAL-AUDIT.md) + [`audit/`](audit/) | What is open, to do, a known limit, or closed — by area, under the same file names as `rules/` |
| [ROADMAP.md](ROADMAP.md) | The order of the remaining work, and what each item waits for |
| [`decisions/`](decisions/) | The design of each larger feature as agreed with the physician before it was built (dated; a record, not kept current) |
| [`testing/e2e.md`](testing/e2e.md), [`testing/load.md`](testing/load.md) | How to run the browser suite and the load tests; how to open the sandbox by hand |
| [`../CLAUDE.md`](../CLAUDE.md), [`../client/CLAUDE.md`](../client/CLAUDE.md), [`../server/CLAUDE.md`](../server/CLAUDE.md), [`../admin/CLAUDE.md`](../admin/CLAUDE.md) | What an AI session loads by itself: the prime directive, the commands, and one line per rule pointing into `rules/` |

### One topic, three files

The same topic name is used in three folders, so that everything about a feature is found by its name. For the OPD queue:

- [`domain/opd-and-ipd.md`](domain/opd-and-ipd.md) — what the queue **is**, and what the physician decided about it;
- [`rules/opd.md`](rules/opd.md) — what the code **must and must not do**, and why;
- [`audit/opd.md`](audit/opd.md) — what is **still open**: questions for the physician, known limits, what was closed.

Each `rules/` and `audit/` file opens with "At a glance" — one line per entry, to find the one you need — and then holds the entries in full. The line is an index; the entry is what counts.

## Which document wins

- The **code**, and the entries in `domain/` and `rules/`, win over the summaries (PRD, ARCHITECTURE, APP-FLOW, UI-SPEC, SCHEMA, ROADMAP). `API.md` is held to the code by a test.
- **Clinical content** — a dose, a unit, a cut-off, the wording of an alert — is never settled by a document: it is verified against the physician's source, or the physician is asked.
- A status in `audit/` is how the thread reads, not a check of the code.

## Keeping it current

In the same commit as the code (PRIME DIRECTIVE, rule 7):

| When this changes | Write it here |
|---|---|
| A rule is learned, or an implementation is rejected or corrected | the entry and its reason in `rules/<topic>.md`, its line under "At a glance", and a line in the app's `CLAUDE.md` if it bears on every change or on what a patient is given |
| The physician decides something | the entry in `domain/<group>.md` and its line in `DOMAIN.md` |
| A question is left open, a limit is accepted, a thread is closed | `audit/<topic>.md` and, for an open or to-do thread, its title in `FUNCTIONAL-AUDIT.md` |
| A route | `API.md` |
| A table or column | `SCHEMA.md`, with the `manual-<name>.sql` file |
| A module, tab, Settings page, hook family, test layer | `CODEMAP.md` |
| A screen or a flow | `UI-SPEC.md`, `APP-FLOW.md` |

The `CLAUDE.md` files are loaded into every AI session in full, so they stay short: a rule's reason and its story belong in `rules/`.

## What changed on 2026-11-15

The documentation was reorganised; the rules and decisions themselves were not changed.

- The three `CLAUDE.md` files (475 KB between them) became indexes (61 KB); their sections were moved, word for word, into `rules/` — 35 topic files. [`rules/README.md`](rules/README.md) says where each old section went.
- `FUNCTIONAL-AUDIT.md` (144 KB) became an index by area with the threads, word for word, in `audit/`; `DOMAIN.md` (62 KB) became a glossary with the entries, word for word, in `domain/`.
- New: this page and `CODEMAP.md`. Renamed: `TRD.md` → `ARCHITECTURE.md`, `AppFlow.md` → `APP-FLOW.md`, `UI_Spec.md` → `UI-SPEC.md`, `Schema.md` → `SCHEMA.md`, `Plan.md` → `ROADMAP.md`; the READMEs of `e2e/` and `load/` → `testing/e2e.md` and `testing/load.md`; the design specs under `docs/superpowers/` → `decisions/`.
- PRD, ARCHITECTURE, APP-FLOW, UI-SPEC, SCHEMA and ROADMAP were corrected against the code (`dev` @ 9be6e72): the work since 28/10/2026 — chambers, the queue booked by day, presence and Print Queue, SMS and payment requests, Statistics, patient files and DICOM, the drug hypersensitivity list — was missing from them. APP-FLOW and UI-SPEC name, at their top, the sections that were not re-checked.
- Removed: the seven implementation plans of features that are built (they remain in git history), and — by the owner — the README screenshots, the Bangla test report of 07/10/2026 and the PDF report on duplicate investigation names.

## Known problems in the documentation

Found on 2026-11-15 while indexing, by reading the text. None was resolved: each needs the code checked, or the physician asked. Read both sides before relying on either.

**Entries that disagree with each other**

- [`rules/printing.md`](rules/printing.md) holds entries of different dates that contradict each other: the print type size ("nothing is ever printed under 14px" against `MID_PX` 11 and `DRUG_PX` 13), `MAX_SCALE` (1.25 against 1.15), whether a row may shrink (`midSize` against `rowPx` = `DRUG_PX`), column widths (px against percentage shares), a dose column that another entry says no longer exists, the split of the clinical column, and a block heading called green where the print accents are now blue. Check `client/src/lib/prescriptionDoc.ts` before relying on any size.
- [`domain/prescribing.md`](domain/prescribing.md) ("Visit-date model") and [`domain/drug-history.md`](domain/drug-history.md) ("Current medications = the PREVIOUS visit", "℞ → Drug history mirror") do not say the same thing about where today's ℞ is shown in Drug history.
- [`domain/investigations-and-monitoring.md`](domain/investigations-and-monitoring.md) describes Disease / Surgical history three times, as it was built three times (lists in the On-examination popup, then the sidebar's History, then the patient's shared history). The last one stands, by its own words; the first two still read as current.
- [`rules/drug-history.md`](rules/drug-history.md): one entry names `rxDerivedRef` as what the mirror remembers; another says `rxMirrorOwned` replaced it on 18/10/2026.
- [`rules/dates.md`](rules/dates.md): one entry says `HealthTrendsChart` validates the calendar with `ddmmyyyyMs`; another says the chart uses `ddmmyyyyMsStrict` and calls `ddmmyyyyMs` the lenient one.
- [`rules/testing-and-verification.md`](rules/testing-and-verification.md): the client checklist says to check that "a supervised patient stays blank"; [`rules/editor-lifecycle.md`](rules/editor-lifecycle.md) says that since 19/10/2026 a supervised patient reloads its own practice's draft.
- [`rules/db-and-prisma.md`](rules/db-and-prisma.md) says the medical-history JSON columns are written whole by the server; later entries describe server-side appends under a row lock for `drugHistory` and `onExaminationSummary`.
- [`rules/habits-and-phrases.md`](rules/habits-and-phrases.md): learned phrases are said to be "built to the same five rules" as "Your usual", whose list of rules has since grown.

**Statuses that may be out of date**

- "Not applied" is written of several `manual-*.sql` files ([`rules/opd.md`](rules/opd.md), [`rules/rx-alerts.md`](rules/rx-alerts.md), [`rules/sms-and-payment.md`](rules/sms-and-payment.md), [`audit/db-and-prisma.md`](audit/db-and-prisma.md), [`audit/records-page.md`](audit/records-page.md)). The repository does not record what has been applied to the shared database: check it. [SCHEMA.md](SCHEMA.md#migrations) lists the files.
- The threads that a later thread seems to overtake are listed at the end of [FUNCTIONAL-AUDIT.md](FUNCTIONAL-AUDIT.md).
- [PRD.md](PRD.md) §7 still proposes "Visits left Incomplete" as a measure, and [APP-FLOW.md](APP-FLOW.md) §3.6 still says Save to complete later flags the OPD row Incomplete; the queue no longer shows that badge.

**In the code's own comments** (not changed — reported)

- `server/prisma/schema.prisma`: the comment on `User.accountTier` lists `secondary | primary` though `premium` is used; the upload URLs are commented "Cloudinary" though uploads are self-hosted; the comment on `PaymentRequest.quantity` ("renew: unused") disagrees with [`rules/sms-and-payment.md`](rules/sms-and-payment.md); two indexes created by `manual-ipd-teams.sql` and `manual-opd-chambers.sql` are not in the schema file.
