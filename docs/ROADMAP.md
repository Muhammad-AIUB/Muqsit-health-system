# Muqsit Health System — Roadmap

Phase 0 (land the save-again and IPD Save work in the tree) was completed on 29/10/2026 in commit `c279976`; its snapshot (§1) and checklist (§2) are removed, and the sections below keep their numbers.

What is done, what is waiting, and the order to do the rest. Built from the repository's own audit notes ([`FUNCTIONAL-AUDIT.md`](FUNCTIONAL-AUDIT.md), an index of the threads in [`audit/`](audit/); the rules in [`rules/`](rules/README.md)) and `git` state on 2026-10-28, corrected against the code on 2026-11-15 (`dev` @ 9be6e72). It adds no new findings; it sequences the existing ones.

Related: [README.md](README.md) (map of the documentation) · [PRD.md](PRD.md) (what and why) · [ARCHITECTURE.md](ARCHITECTURE.md) (how) · [SCHEMA.md](SCHEMA.md) · [APP-FLOW.md](APP-FLOW.md) · [UI-SPEC.md](UI-SPEC.md) · [CODEMAP.md](CODEMAP.md)

> **Dates and sizes.** The repository has no calendar commitments, so none are invented. Size is a rough engineering estimate only — **S** under a day, **M** a few days, **L** a week or more of focused work including review — and is not a promise. Items marked **Decision** wait for the physician; engineering will not pick an answer for them.

---

## 3. Order of work after Phase 0

```
Phase 0  land current work                        (done 29/10/2026, c279976)
   │
   ├─ Phase 1  small safety / wording fixes        (no decision needed)
   ├─ Phase 2  deploy hardening + dependency upgrades   (independent of Phase 1)
   └─ Phase 3  decisions from the physician        (can run in parallel; gates Phase 4)
                    │
                Phase 4  build-outs the decisions unlock
                    │
                Phase 5  engineering quality
```

## 4. Phase 1 — small safety and wording fixes (no decision needed)

| # | Item | Why | Size |
|---|---|---|---|
| 1.1 | **Assistant without `rx.medicines`** who opens a visit parked with a held `>>>` line is told to type the medicine's name, which they are not permitted to do. Word the refusal for them | Refusing is right; the sentence is wrong for this role | S |
| 1.2 | **IPD Save on a 404** (admission or ward no longer reachable) says "try again in a moment" | Retrying will not help; say it is no longer reachable | S |
| 1.3 | **Two ward lines show the server's own words**: the ward note beside Send, and the admit form's error | Never show raw server text to a doctor | S |
| 1.4 | **"Add New" patient whose answer was lost**, pressed again, makes a second patient on the number | Same class as the prescription double-file; needs an idempotent create or a mobile check | M |
| 1.5 | **IPD Save** whose stored answer was lost is said "not saved" | Pressing again is safe (the whole `clinical` is replaced), but the wording should say it *may* have been saved, as Save & print does | S |
| 1.6 | **Verify which `manual-*.sql` files are applied** to the shared database, then apply them through the tunnel. Recorded as NOT applied and needed before the release that reads them: `manual-opd-presence.sql`, `manual-opd-chambers.sql` (after the queue-date script), `manual-sms-wallet.sql`, `manual-patient-files.sql`, `manual-patient-drug-safety.sql`. `manual-opd-queue-date.sql` was applied on 29/10/2026 but its unique index was not created (duplicate tokens already existed); it superseded `manual-opd-token-unique.sql`, and `manual-opd-chambers.sql` replaces that index again. `manual-ipd-bed-unique.sql` is optional and recorded as not applied | The repository records these states ([`audit/db-and-prisma.md`](audit/db-and-prisma.md), [`audit/records-page.md`](audit/records-page.md), [`audit/rx-alerts.md`](audit/rx-alerts.md)); this plan did not check the database | S |
| 1.7 | **Test data left on a real record**: patient *muhammad jubayer* carries two invented drug-history entries added for testing | Remove them from Drug history when no longer wanted — a deliberate, confirmed action, never a script | S |

Each item: a unit test (clinical logic gets one), the flow exercised in the browser sandbox, and `docs/API.md` / the matching `docs/rules/<topic>.md` updated in the same commit.

## 5. Phase 2 — deploy hardening and dependency upgrades

| # | Item | Why | Size |
|---|---|---|---|
| 2.1 | **Build into a separate folder and swap on success** (client `.next`, server `dist`) | Both builds empty their output first; after a failed build the running app may already be missing files, and the next API restart finds no `dist/main.js` | M |
| 2.2 | **`npm audit fix` without `--force`** — `qs`, `proxy-addr`, `file-type`, `nanoid`, `source-map-js` | One lockfile change per app, each verified. `proxy-addr` and `file-type` are not reachable in this app, per the audit | S per app |
| 2.3 | **nodemailer 6.10.1 → 10.1.2+** | Seventeen advisories; exposure is low because every address passes `@IsEmail()`; major version needs a real SMTP send to verify OTP mail | M |
| 2.4 | **Nest 10 → 12** | Injection advisory in `@nestjs/core`, plus the multer override that is a stopgap and comes out with this | L |
| 2.5 | **Next 14 → 15.5.24+ in both apps** (brings React 19 and async request APIs) | Advisories with no 14.x fix: an unauthenticated RCE on **Windows-hosted** servers (a Windows dev machine whose `next dev` port is reachable), and RSC denial-of-service on any App Router app | L |
| 2.6 | **Upload route can fill the disk** (100 req/min/address × 8 MB, kept forever) | **Decision** on the bound: a quota, a per-address cap, or authentication once an account exists | M after the decision |

Rules for every upgrade: its own commit and its own verification pass; production build of the doctor app (`NEXT_DIST_DIR=.next-verify npm run build`) because `layout.tsx` is a server component and a hook reached from it fails only the production build; browser journeys; check print preview; state what was not run.

## 6. Phase 3 — decisions owed by the physician

| # | Decision | What engineering needs back | Unlocks |
|---|---|---|---|
| 3.1 | **Unowned patients** — after a doctor's account is deleted, their patients are kept but not findable. What does "mobile number *and security access*" mean? Claim by the next doctor, consent by OTP, visible to all? Does claiming expose prior history or only new visits? | A rule | Access design (4.2) |
| 3.2 | **Ward team login** — confirm the intended model for a nurse or doctor on a ward team | Confirmation of the narrow IPD-only door | 4.1 |
| 3.3 | **A comma-and-space inside a number** (`1, 200/cmm`) and numbers typed with grouping (`12,000`, `1,50,000`) which are not plotted | What a typed comma means in each result box | Trend-chart parsing |
| 3.4 | **Save to complete later while a red held line is on the pad** — park the visit with the line, or keep refusing? | Yes/no | `saveDraftNow` |
| 3.5 | **"Your usual" onto a medicine that already has `>>>` lines** — add after the old lines (today), or replace them? | Yes/no | `rxHabitRows` insertion |
| 3.6 | **BAN / EN on a printed visit** — decided in the physician's stead; confirm | Confirm or change | `Muqsit` language switch |
| 3.7 | **30-minute repeat window** — a choice made by engineering, not the physician | Confirm or change | `REPEAT_WINDOW_MS` |
| 3.8 | **No answer through all three re-sends, then a corrected save** files a second visit | Whether the record should keep a visit's copies together (a change to how a visit is held) | A visit-copies model |
| 3.9 | **Supervising doctor's Save & print** tries to update the owner's histories and is refused, so "…was not updated" is shown. *Partly settled:* since 31/10/2026 On examination is appended by the server for a supervising practice too (`POST /patients/:id/on-examination`, [`rules/records-page.md`](rules/records-page.md)); drug history is still owner-only | Whether a supervisor's visit should reach the owner's remaining histories | Supervisor flow |
| 3.10 | **Physician review of old tapering prescriptions** — a `>>>` dose saved under the wrong medicine before the fix cannot be told apart from a real one | A by-eye look at recent tapering prescriptions | Nothing; patient-safety follow-up |
| 3.11 | **Wide-screen health-trend names** cut at 20 characters | Accept the two-line names there (changes a chart the physician knows) | Chart labels |
| 3.12 | **Billing** — SMS purchase and the monthly subscription are now requests an administrator credits by hand (4.5) | The fee, whether an unpaid subscription should do anything, and whether anything more (a payment gateway, insurance) is in scope ([`audit/sms-and-payment.md`](audit/sms-and-payment.md)) | — |
| 3.13 | **Stub views** — Research Compare/Export, Data security level. (The Message tab once listed here is now the Supervised view — supervised patients and their team chat, `MessageView.tsx`; [`audit/chat-and-notes.md`](audit/chat-and-notes.md) still lists it as a placeholder) | Build or remove each | 4.4 |
| 3.14 | **Names in capitals** — settled 2026-10-12: names stay as the catalogue writes them | None (recorded) | — |

## 7. Phase 4 — build-outs the decisions unlock

| # | Item | Depends on | Size | Notes |
|---|---|---|---|---|
| 4.1 | **Ward team member's own login** — a narrow IPD-only door where `ipd.service` resolves ward membership itself and returns only that ward's admissions | 3.2 | L | **Never** by extending `WorkstationsService.resolve`; that would hand a ward nurse the OPD record |
| 4.2 | **Reachable unowned patients** with the access design from 3.1 | 3.1 | L | Exposes personal data across practices if done carelessly; needs its own test matrix in `access.int-spec.ts` |
| 4.3 | **Server keeps a visit's copies together** | 3.8 | L | Changes how the record holds a visit; migration must be additive |
| 4.4 | Stub views built or removed | 3.13 | S–M each | Remove rather than leave a button that does nothing on a clinical screen |
| 4.5 | ~~**SMS** — wire `SmsModule` into `AppModule` if the owner wants notifications~~ **Done** 01/11/2026 (`ba850c9`): appointment SMS to a day's OPD queue, SMS wallet, payment requests | owner | M | Open points in [`audit/sms-and-payment.md`](audit/sms-and-payment.md) |

## 8. Phase 5 — engineering quality

| # | Item | Why | Size |
|---|---|---|---|
| 5.1 | ESLint config for `client/` and `admin/` | `npm run lint` is `next lint` with no config, so it cannot be relied on | S |
| 5.2 | A health-check route | There is none; useful for the VPS and monitoring | S |
| 5.3 | OpenAPI document, or generated route index | `docs/API.md` is hand-kept; the contract suite already reads `api.ts` | M |
| 5.4 | Shared event bus for device mirroring | Fan-out is in memory; a second API process would break it | M |
| 5.5 | `lock_timeout` on lock-taking transactions | A query waiting for a lock that never frees is not ended by Prisma | S |
| 5.6 | Remove the "Symptoms · all visits" panel duplicated by the chart | Taste call, left as is | S |
| 5.7 | `scripts/backfill-image-thumbs.js` to use `ROW_LOCK_TX` options | Still on defaults | S |

## 9. Definition of done (every item)

From the project's prime directive:

1. Nothing clinical was invented; anything uncertain was asked.
2. No patient data can be lost or transformed silently; destructive acts are explicit, confirmed, and have Undo where built.
3. Scoping holds: the doctor comes from `@WorkstationDoctorId()`; patient delete stays owner-only.
4. If `client/src/lib/prescriptionDoc.ts` changed: print preview checked.
5. Palette and states: `C` colours only, empty / loading / error states drawn, silent retry on flaky networks.
6. Typecheck in all three apps, both server suites, the client suite, and the flow exercised in the browser. Visual work is exercised on the sandbox ports `:3100` / `:4200`, not `:3000`, because the development database is production. What was not verified is reported.
7. `CLAUDE.md` files, `docs/rules/`, `docs/DOMAIN.md` and `docs/domain/`, `docs/API.md` and, where relevant, these documents updated in the same commit.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The development database is production | Tests use the container on `127.0.0.1:5544`; visual work uses the sandbox on `:3100`/`:4200`; never break code in the checkout the dev servers watch |
| A red deploy leaves the running app without files | Fix or revert immediately; 2.1 closes it |
| A major-version upgrade breaks the screen doctors prescribe through | One upgrade per commit, production build, full journeys, print preview |
| An SQL file the release reads is not yet applied | Apply before the release; the deploy never runs migrations |
| A decision is made by engineering by default | Phase 3 items are held until answered; stand-in decisions already made (3.6, 3.7) are listed so they can be confirmed |
| Documents drift from code | Update with the change; `docs/API.md` has a checklist (§7 of that file) |

## 11. Document maintenance

These six documents (`PRD`, `APP-FLOW`, `UI-SPEC`, `ARCHITECTURE`, `SCHEMA`, `ROADMAP`) summarise `docs/DOMAIN.md` (a glossary; the entries are in `docs/domain/*.md`), `docs/API.md`, `docs/rules/` and the `CLAUDE.md` files; they do not replace them. When a physician's decision changes, update its entry in `docs/domain/` first and then the summary here. Where they disagree with the code, the code and `docs/domain/` win. [`README.md`](README.md) maps the documentation; [`CODEMAP.md`](CODEMAP.md) says where things live.

## 12. Open items left by the work since 28/10/2026

Chambers, SMS and payment, Settings → Statistics, patient files (Permissions, DICOM), drug hypersensitivity / high-alert, the drug-history table, OPD presence and Print Queue left these open:

- `manual-*.sql` files recorded as not applied and needed before the release that reads them — see 1.6 ([`audit/db-and-prisma.md`](audit/db-and-prisma.md)).
- `server/test/patient-drug-safety.int-spec.ts` written and typechecked but not run; no browser pass; eight assumptions for the physician ([`audit/rx-alerts.md`](audit/rx-alerts.md)).
- No integration spec against the test database for `patient-files` ([`rules/records-page.md`](rules/records-page.md)); records-page questions for the physician ([`audit/records-page.md`](audit/records-page.md)).
- Statistics SQL not timed against `muqsit_load_test` ([`rules/statistics.md`](rules/statistics.md)); open questions on what is counted ([`audit/statistics.md`](audit/statistics.md)).
- SMS: no real SMS sent, delivery reports not read, a send cut short keeps its reservation, the message words still to confirm ([`audit/sms-and-payment.md`](audit/sms-and-payment.md)); not run in a browser ([`audit/testing-and-verification.md`](audit/testing-and-verification.md)).
- Next 15 / Nest 12 upgrades still open — 2.4, 2.5 ([`audit/deploy-and-ops.md`](audit/deploy-and-ops.md)).
- `deploy.yml` runs `test.yml` first and deploys only if it is green (2026-11-17; [`decisions/2026-10-02-test-strategy-design.md`](decisions/2026-10-02-test-strategy-design.md), D13); proven once by run 44130628179, the red path not exercised. A `verify` job asks the public URLs after the restart (it only detects a dead app, no rollback; its first run is the release that carries it). Still open: building into a separate folder and swapping it in (a failed build empties the live `.next`/`dist`), Playwright and `admin` in CI.
