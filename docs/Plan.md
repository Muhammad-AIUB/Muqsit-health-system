# Muqsit Health System — Delivery Plan

What is done, what is waiting, and the order to do the rest. Built from the repository's own audit notes (`FUNCTIONAL-AUDIT.md`, the dated sections of the `CLAUDE.md` files) and `git` state on 2026-10-28. It adds no new findings; it sequences the existing ones.

Related: [PRD.md](PRD.md) (what and why) · [TRD.md](TRD.md) (how) · [Schema.md](Schema.md) · [AppFlow.md](AppFlow.md) · [UI_Spec.md](UI_Spec.md)

> **Dates and sizes.** The repository has no calendar commitments, so none are invented. Size is a rough engineering estimate only — **S** under a day, **M** a few days, **L** a week or more of focused work including review — and is not a promise. Items marked **Decision** wait for the physician; engineering will not pick an answer for them.

---

## 1. Where things stand

| Area | State |
|---|---|
| Product | Live. Doctors prescribe through it. |
| History | 489 commits on this checkout; latest commit dated 2026-10-20. |
| Branches | `main` (production) and `dev` (work). No other branch is kept. |
| Working tree on `dev` | **Uncommitted work** (see §2): the save-again-while-the-answer-is-lost behaviour, the IPD sheet's Save wording, their tests, and updated docs. |
| Unreleased risk | Anything on `dev` that is not on `main` is not live. A push to `main` is the release. |
| Known open items | Listed in §4–§7. Most are small wording or recovery paths; four need a physician's decision. |

## 2. Phase 0 — land the work in the tree

The working tree carries these uncommitted changes (from `git status`): `client/src/lib/sendAgain.ts` and its test (new), `saveNotice.ts`, `IpdDetailView.tsx`, `MuqsitContext.tsx` and their tests, `e2e/tests/ipd-save.spec.ts` (new), `e2e/tests/save-failure.spec.ts`, `e2e/tests/helpers.ts`, `server/test/seed-e2e.ts`, `docs/reports/`, `client/tsconfig.json`, and edits to `CLAUDE.md`, `client/CLAUDE.md`, `server/CLAUDE.md`, `docs/API.md`, `docs/DOMAIN.md`, `FUNCTIONAL-AUDIT.md`, `e2e/README.md`.

| # | Step | Size | Notes |
|---|---|---|---|
| 0.1 | `client/tsconfig.json` — confirm the change is only what `next dev` rewrote for the browser suite, then **do not commit it** | S | `e2e/README.md` says it is never committed; it was committed once by mistake |
| 0.2 | Read `docs/reports/` before staging | S | A PDF is there; decide whether it belongs in the repository |
| 0.3 | Typecheck `server/`, `client/`, `admin/` | S | |
| 0.4 | `cd server && npm test` and `npm run test:int` (after `docker compose -f docker-compose.test.yml up -d` and `npm run test:db`) | S | Needed because `api.ts`-adjacent client files changed |
| 0.5 | `cd client && npm test` | S | |
| 0.6 | Browser journeys: `cd e2e && npx playwright test` (commit first; no edits during the run) | M | `save-failure` and `ipd-save` are the ones this work touches |
| 0.7 | `node scripts/test-repeat.mjs <server\|int\|client> 3` | S | Any varying result is a defect, not a retry |
| 0.8 | Independent review of the diff, fixes re-reviewed | M | The release discipline for this repo |
| 0.9 | Commit on `dev` as `Muhammad-AIUB <mjubayer.aiub@gmail.com>`; read `git show --stat` of each commit against its message | S | Check `git config user.email` and `gh auth status` first |
| 0.10 | Fast-forward `main` to `dev`, push both together | S | That push is the deploy (~2–3 min) |
| 0.11 | Post-deploy check on the live site; confirm the Action went green | S | A red deploy is not a safe state — fix or revert at once |

**Exit:** `main` equals `dev`, deploy green, and the report says what was *not* verified.

## 3. Order of work after Phase 0

```
Phase 0  land current work
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
| 1.6 | **Verify which `manual-*.sql` files are applied** to the shared database, in particular `manual-opd-token-unique.sql` and `manual-ipd-bed-unique.sql`, then apply them through the tunnel if wanted | The repository does not say whether they are live; this plan did not check | S |
| 1.7 | **Test data left on a real record**: patient *muhammad jubayer* carries two invented drug-history entries added for testing | Remove them from Drug history when no longer wanted — a deliberate, confirmed action, never a script | S |

Each item: a unit test (clinical logic gets one), the flow exercised in the browser sandbox, and `docs/API.md` / `client/CLAUDE.md` updated in the same commit.

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
| 3.9 | **Supervising doctor's Save & print** tries to update the owner's histories and is refused, so "…was not updated" is shown | Whether a supervisor's visit should reach the owner's histories | Supervisor flow |
| 3.10 | **Physician review of old tapering prescriptions** — a `>>>` dose saved under the wrong medicine before the fix cannot be told apart from a real one | A by-eye look at recent tapering prescriptions | Nothing; patient-safety follow-up |
| 3.11 | **Wide-screen health-trend names** cut at 20 characters | Accept the two-line names there (changes a chart the physician knows) | Chart labels |
| 3.12 | **Billing** | Confirm it is out of scope | — |
| 3.13 | **Stub views** — Message tab, Research Compare/Export, Data security level | Build or remove each | 4.4 |
| 3.14 | **Names in capitals** — settled 2026-10-12: names stay as the catalogue writes them | None (recorded) | — |

## 7. Phase 4 — build-outs the decisions unlock

| # | Item | Depends on | Size | Notes |
|---|---|---|---|---|
| 4.1 | **Ward team member's own login** — a narrow IPD-only door where `ipd.service` resolves ward membership itself and returns only that ward's admissions | 3.2 | L | **Never** by extending `WorkstationsService.resolve`; that would hand a ward nurse the OPD record |
| 4.2 | **Reachable unowned patients** with the access design from 3.1 | 3.1 | L | Exposes personal data across practices if done carelessly; needs its own test matrix in `access.int-spec.ts` |
| 4.3 | **Server keeps a visit's copies together** | 3.8 | L | Changes how the record holds a visit; migration must be additive |
| 4.4 | Stub views built or removed | 3.13 | S–M each | Remove rather than leave a button that does nothing on a clinical screen |
| 4.5 | **SMS** — wire `SmsModule` into `AppModule` if the owner wants notifications | owner | M | Currently deliberately unwired; needs a product case first |

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
7. `CLAUDE.md` files, `docs/DOMAIN.md`, `docs/API.md` and, where relevant, these documents updated in the same commit.

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

These six documents (`PRD`, `AppFlow`, `UI_Spec`, `TRD`, `Schema`, `Plan`) summarise `docs/DOMAIN.md`, `docs/API.md` and the `CLAUDE.md` files; they do not replace them. When a physician's decision changes, update `DOMAIN.md` first and then the summary here. Where they disagree with the code, the code and `DOMAIN.md` win.
