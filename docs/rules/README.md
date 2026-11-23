# Rules — what must and must not be done here, and why

One file per topic. These are the rules that used to fill the three `CLAUDE.md` files (468 KB between them, loaded in full by every AI session). On 2026-11-15 they were moved here **word for word**, and each `CLAUDE.md` now carries one line per rule and the name of the file to read.

## How a file is built

1. **At a glance** — one line per entry. It is an index, written on 2026-11-15, to find the entry you need. It is not the rule.
2. **The rules, in full** — the entries themselves, under the heading of the section they came from. This is what counts. Most carry the incident that produced them: a rule without its reason gets "simplified" away by the next person who does not know why it is there.

## How to use them

- **Changing code:** open the `CLAUDE.md` of the app you are in. Its first list holds the rules for every change there; its second names the file to read before touching each feature. Read that file before you change the code — not after a review finds the rule.
- **Looking for a rule you remember from the old files:** the table at the end of this page says where each of their sections went.
- **The same file name under [`docs/audit/`](../audit/)** holds that topic's open questions, known limits and the physician's answers ([index](../FUNCTIONAL-AUDIT.md)); the concepts and the decisions behind them are in [`docs/domain/`](../domain/) ([glossary](../DOMAIN.md)).

## How to add or change a rule

1. Write the entry — the rule **and its reason**; who decided and when, if the physician or the product owner did — in the right file, under "The rules, in full", beside the entries it belongs with.
2. Add or correct its line under "At a glance" in the same file.
3. If it bears on every change in an app, or on what a patient is given (the entries marked ⚕️), add its line to that app's `CLAUDE.md` — the root `CLAUDE.md` for what bears on the whole repo.
4. Do it in the same commit as the code (PRIME DIRECTIVE, rule 7).

An entry that an indexing line gets wrong is corrected in the line, never in the entry: the entry is the record.

## Files

| File | Entries | Size | Covers |
|---|---|---|---|
| [`access-and-scoping.md`](access-and-scoping.md) | 16 | 12 KB | Access and scoping (workstation, assistants, supervised doctor, opened with the patient's own code) |
| [`auth.md`](auth.md) | 5 | 3 KB | Authentication and sessions |
| [`validation-and-dto.md`](validation-and-dto.md) | 2 | 2 KB | Validation and DTOs |
| [`db-and-prisma.md`](db-and-prisma.md) | 12 | 7 KB | Database, manual SQL and Prisma |
| [`server-architecture.md`](server-architecture.md) | 1 | 3 KB | Server architecture |
| [`editor-lifecycle.md`](editor-lifecycle.md) | 18 | 33 KB | Editor lifecycle: drafts, reload, visit state, device mirror |
| [`rx-pad.md`](rx-pad.md) | 20 | 38 KB | The ℞ pad and Save & print |
| [`drug-history.md`](drug-history.md) | 28 | 50 KB | Drug history |
| [`rx-alerts.md`](rx-alerts.md) | 34 | 25 KB | Prescribing alerts, drug hypersensitivity, high-alert medication |
| [`habits-and-phrases.md`](habits-and-phrases.md) | 61 | 53 KB | "Your usual", learned phrases, Add Bulk Medicine, drug advice |
| [`investigation.md`](investigation.md) | 26 | 26 KB | Investigations: popup, findings, catalog, units |
| [`health-trends.md`](health-trends.md) | 24 | 48 KB | Health monitoring and the trend chart |
| [`calculators.md`](calculators.md) | 1 | 1 KB | Clinical calculators |
| [`visit-sheet.md`](visit-sheet.md) | 12 | 18 KB | The visit sheet and the app shell |
| [`printing.md`](printing.md) | 63 | 54 KB | Printing |
| [`screen-capture.md`](screen-capture.md) | 6 | 2 KB | Screenshots and screen recording (production only) |
| [`patient-identity.md`](patient-identity.md) | 7 | 6 KB | Patient identity: sex, age, NID, family tree, photo |
| [`records-page.md`](records-page.md) | 8 | 15 KB | Patient Records page and files |
| [`opd.md`](opd.md) | 18 | 25 KB | OPD queue, chambers, appointment SMS |
| [`ipd.md`](ipd.md) | 31 | 21 KB | IPD: ward sheet, order sheets, wards and their teams |
| [`chat-and-notes.md`](chat-and-notes.md) | 7 | 16 KB | Patient chat, notes, activity feed |
| [`statistics.md`](statistics.md) | 14 | 9 KB | Settings → Statistics |
| [`sms-and-payment.md`](sms-and-payment.md) | 2 | 7 KB | SMS and payment |
| [`settings.md`](settings.md) | 2 | 2 KB | Settings |
| [`uploads.md`](uploads.md) | 20 | 23 KB | Uploads |
| [`dates.md`](dates.md) | 15 | 10 KB | Dates |
| [`forms-and-input.md`](forms-and-input.md) | 14 | 13 KB | Forms, typing, BAN / EN, number formats |
| [`dialogs-and-focus.md`](dialogs-and-focus.md) | 11 | 18 KB | Popups, focus, keyboard, accessibility |
| [`lists-loading-errors.md`](lists-loading-errors.md) | 5 | 5 KB | Lists: loading, empty and error states |
| [`theme-and-colour.md`](theme-and-colour.md) | 21 | 17 KB | Theme, colour, night mode, icons, fonts |
| [`layout-and-zoom.md`](layout-and-zoom.md) | 11 | 10 KB | Layout, page zoom, responsive |
| [`naming-and-wording.md`](naming-and-wording.md) | 3 | 2 KB | Naming and wording |
| [`admin.md`](admin.md) | 5 | 6 KB | Admin console (the account page: Profile, Dr's patient data, Profile settings, Point system) |
| [`testing-and-verification.md`](testing-and-verification.md) | 18 | 12 KB | Testing and verification |
| [`deploy-and-ops.md`](deploy-and-ops.md) | 16 | 12 KB | Build, deploy, dependencies, git |
| [`ai-tooling.md`](ai-tooling.md) | 2 | 1 KB | AI tooling |

## Where the sections of the old `CLAUDE.md` files went

The number after a file is how many entries of that section it holds. A nested entry was kept with the entry it hangs from.

| Was in | Section | Now in `docs/rules/` |
|---|---|---|
| `CLAUDE.md` | Patterns We Do Not Use | [`testing-and-verification.md`](testing-and-verification.md) (11), [`health-trends.md`](health-trends.md) (9), [`db-and-prisma.md`](db-and-prisma.md) (7), [`habits-and-phrases.md`](habits-and-phrases.md) (7), [`dialogs-and-focus.md`](dialogs-and-focus.md) (6), [`rx-pad.md`](rx-pad.md) (6), [`deploy-and-ops.md`](deploy-and-ops.md) (5), [`theme-and-colour.md`](theme-and-colour.md) (5), [`editor-lifecycle.md`](editor-lifecycle.md) (4), [`access-and-scoping.md`](access-and-scoping.md) (3), [`forms-and-input.md`](forms-and-input.md) (3), [`lists-loading-errors.md`](lists-loading-errors.md) (3), [`layout-and-zoom.md`](layout-and-zoom.md) (3), [`investigation.md`](investigation.md) (3), [`chat-and-notes.md`](chat-and-notes.md) (3), [`rx-alerts.md`](rx-alerts.md) (2), [`ipd.md`](ipd.md) (2), [`drug-history.md`](drug-history.md) (2), [`ai-tooling.md`](ai-tooling.md) (2), [`opd.md`](opd.md) (2), [`validation-and-dto.md`](validation-and-dto.md) (1), [`dates.md`](dates.md) (1), [`uploads.md`](uploads.md) (1), [`printing.md`](printing.md) (1) |
| `client/CLAUDE.md` | (opening lines) | [`deploy-and-ops.md`](deploy-and-ops.md) |
| `client/CLAUDE.md` | ⚕️ Clinical-accuracy rules specific to the client | [`rx-alerts.md`](rx-alerts.md) (21), [`habits-and-phrases.md`](habits-and-phrases.md) (10), [`investigation.md`](investigation.md) (2), [`rx-pad.md`](rx-pad.md) (2), [`calculators.md`](calculators.md) (1), [`forms-and-input.md`](forms-and-input.md) (1), [`patient-identity.md`](patient-identity.md) (1) |
| `client/CLAUDE.md` | Storage string protocols (the data model hiding in strings) | [`drug-history.md`](drug-history.md) (26), [`investigation.md`](investigation.md) (15), [`editor-lifecycle.md`](editor-lifecycle.md) (1), [`records-page.md`](records-page.md) (1), [`health-trends.md`](health-trends.md) (1) |
| `client/CLAUDE.md` | ⚕️ H/O drug hypersensitivity and High-Alert Medication (physician's sheet, 31/10/2026) | [`rx-alerts.md`](rx-alerts.md) (7), [`printing.md`](printing.md) (1), [`access-and-scoping.md`](access-and-scoping.md) (1) |
| `client/CLAUDE.md` | ⚠️ Patient sex: one word, one vocabulary, never a guess | [`patient-identity.md`](patient-identity.md) (5), [`opd.md`](opd.md) (3), [`records-page.md`](records-page.md) (1) |
| `client/CLAUDE.md` | ⚠️ Date parsing: `new Date("25/07/2026")` is Invalid Date | [`dates.md`](dates.md) (14), [`patient-identity.md`](patient-identity.md) (1) |
| `client/CLAUDE.md` | Chambers — "My Chamber" (physician's sheet 28/10/2026, item 8; 01/11/2026) | [`opd.md`](opd.md) (5), [`settings.md`](settings.md) (2), [`printing.md`](printing.md) (1) |
| `client/CLAUDE.md` | Settings → Statistics (physician's sheet, 11/11/2026) | [`statistics.md`](statistics.md) |
| `client/CLAUDE.md` | Health monitoring tab (idsp) | [`health-trends.md`](health-trends.md) |
| `client/CLAUDE.md` | Learned phrases: what this doctor has written before (2026-09-21) | [`habits-and-phrases.md`](habits-and-phrases.md) |
| `client/CLAUDE.md` | BAN / EN — phonetic Bangla typing (2026-09-23) | [`forms-and-input.md`](forms-and-input.md) (6), [`rx-pad.md`](rx-pad.md) (2), [`printing.md`](printing.md) (1) |
| `client/CLAUDE.md` | Editor lifecycle (easy to break — know it) | [`editor-lifecycle.md`](editor-lifecycle.md) (9), [`printing.md`](printing.md) (6), [`rx-alerts.md`](rx-alerts.md) (3), [`ipd.md`](ipd.md) (1), [`rx-pad.md`](rx-pad.md) (1), [`records-page.md`](records-page.md) (1), [`dialogs-and-focus.md`](dialogs-and-focus.md) (1) |
| `client/CLAUDE.md` | Naming: "Prescription" wherever the ℞ pad appears — "order sheet" now means the PAPER one | [`naming-and-wording.md`](naming-and-wording.md) |
| `client/CLAUDE.md` | Analogue order sheet — the ward's paper sheet, photographed (2026-08-26) | [`ipd.md`](ipd.md) (10), [`access-and-scoping.md`](access-and-scoping.md) (1) |
| `client/CLAUDE.md` | IPD wards and their teams | [`ipd.md`](ipd.md) (5), [`access-and-scoping.md`](access-and-scoping.md) (2), [`editor-lifecycle.md`](editor-lifecycle.md) (1) |
| `client/CLAUDE.md` | Night mode — ☀ / ☾ (physician's request, 2026-10-15) | [`theme-and-colour.md`](theme-and-colour.md) |
| `client/CLAUDE.md` | UI conventions | [`printing.md`](printing.md) (46), [`habits-and-phrases.md`](habits-and-phrases.md) (19), [`visit-sheet.md`](visit-sheet.md) (11), [`theme-and-colour.md`](theme-and-colour.md) (11), [`uploads.md`](uploads.md) (11), [`rx-pad.md`](rx-pad.md) (7), [`investigation.md`](investigation.md) (5), [`forms-and-input.md`](forms-and-input.md) (4), [`dialogs-and-focus.md`](dialogs-and-focus.md) (4), [`chat-and-notes.md`](chat-and-notes.md) (2), [`layout-and-zoom.md`](layout-and-zoom.md) (2), [`lists-loading-errors.md`](lists-loading-errors.md) (2), [`records-page.md`](records-page.md) (2), [`ipd.md`](ipd.md) (1), [`access-and-scoping.md`](access-and-scoping.md) (1), [`editor-lifecycle.md`](editor-lifecycle.md) (1) |
| `client/CLAUDE.md` | Responsive layout | [`layout-and-zoom.md`](layout-and-zoom.md) (6), [`investigation.md`](investigation.md) (1) |
| `client/CLAUDE.md` | Verification checklist for client changes | [`testing-and-verification.md`](testing-and-verification.md) |
| `client/CLAUDE.md` | (opening lines, 1 kept) | still in `client/CLAUDE.md` |
| `server/CLAUDE.md` | Module map (src/) | [`server-architecture.md`](server-architecture.md) |
| `server/CLAUDE.md` | ⚠️ Rule 1 — every patient-data query is doctor-scoped | [`access-and-scoping.md`](access-and-scoping.md) |
| `server/CLAUDE.md` | ⚠️ Rule 2 — the patient access model (do not widen casually) | [`access-and-scoping.md`](access-and-scoping.md) (3), [`records-page.md`](records-page.md) (2), [`editor-lifecycle.md`](editor-lifecycle.md) (1), [`db-and-prisma.md`](db-and-prisma.md) (1), [`admin.md`](admin.md) (1) |
| `server/CLAUDE.md` | ⚠️ Rule 2b — an IPD team is NOT a workstation | [`ipd.md`](ipd.md) |
| `server/CLAUDE.md` | ⚠️ Rule 2c — `DoctorRxHabit` is DERIVED, and its write path is load-bearing | [`habits-and-phrases.md`](habits-and-phrases.md) (19), [`rx-pad.md`](rx-pad.md) (2) |
| `server/CLAUDE.md` | `drug-advice` — the doctor's own standing advice (2026-09-24) | [`habits-and-phrases.md`](habits-and-phrases.md) |
| `server/CLAUDE.md` | ⚕️ `patient-drug-safety` — H/O drug hypersensitivity and High-Alert Medication (31/10/2026) | [`rx-alerts.md`](rx-alerts.md) |
| `server/CLAUDE.md` | `statistics` — Settings → Statistics (physician's sheet, 11/11/2026) | [`statistics.md`](statistics.md) |
| `server/CLAUDE.md` | `patient-files` — Permissions and Imaging DICOM (07/11/2026) | [`records-page.md`](records-page.md) |
| `server/CLAUDE.md` | ⚠️ `patient-notes` — keyed by the SIGNED-IN USER, on purpose (2026-09-24) | [`chat-and-notes.md`](chat-and-notes.md) |
| `server/CLAUDE.md` | ⚠️ Rule 2d — the IPD `clinical` column is REPLACED, so new per-admission data gets its own route | [`ipd.md`](ipd.md) |
| `server/CLAUDE.md` | ⚠️ `opd` — the queue is booked by DAY (28/10/2026) | [`opd.md`](opd.md) (8), [`sms-and-payment.md`](sms-and-payment.md) (1) |
| `server/CLAUDE.md` | ⚠️ Rule 3 — ValidationPipe strips unknown fields | [`validation-and-dto.md`](validation-and-dto.md) |
| `server/CLAUDE.md` | Auth architecture (don't regress these) | [`auth.md`](auth.md) |
| `server/CLAUDE.md` | Prisma specifics | [`db-and-prisma.md`](db-and-prisma.md) (3), [`visit-sheet.md`](visit-sheet.md) (1) |
| `server/CLAUDE.md` | SSE mirror | [`editor-lifecycle.md`](editor-lifecycle.md) |
| `server/CLAUDE.md` | ⚠️ Adding a `.ts` file OUTSIDE `src/` can take production down | [`deploy-and-ops.md`](deploy-and-ops.md) |
| `server/CLAUDE.md` | Gotchas | [`uploads.md`](uploads.md) (8), [`db-and-prisma.md`](db-and-prisma.md) (1), [`auth.md`](auth.md) (1), [`sms-and-payment.md`](sms-and-payment.md) (1), [`deploy-and-ops.md`](deploy-and-ops.md) (1), [`chat-and-notes.md`](chat-and-notes.md) (1) |
| `server/CLAUDE.md` | (opening lines, 2 kept) | still in `server/CLAUDE.md` |
