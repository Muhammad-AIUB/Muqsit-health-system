# Test Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add integration, E2E, contract, property, snapshot, load and regression tests, plus coverage, fixtures, test doubles and flaky-test tooling, and report the results in Bangla.

**Architecture:** One throwaway Postgres container hosts one database per suite (`muqsit_int_test`, `muqsit_e2e_test`, `muqsit_load_test`) so suites never interfere. The Nest pipeline (`ValidationPipe`, cookies, prefix, CORS) is extracted into `configureApp()` so tests boot exactly what production boots. Server tests live in `server/test/`; E2E and load live in root `e2e/` and `load/`.

**Tech Stack:** jest + supertest + @nestjs/testing, vitest + @vitest/coverage-v8, fast-check, Playwright, k6, Docker `postgres:16-alpine`.

Spec: `docs/superpowers/specs/2026-10-02-test-strategy-design.md`

## Global Constraints

- Never write to the production database. Every DB-backed entry point calls `assertTestDatabase()` (URL is `127.0.0.1:5544`, name ends `_test`, marker table `__muqsit_test_marker` exists).
- Never run `prisma generate`, `prisma migrate`, or `prisma db push` without `DATABASE_URL` **and** `DIRECT_URL` pointing at the container.
- No invented clinical content: only names/values already present in existing tests; property tests assert invariants only.
- Never edit `client/src/data/rxAlerts.ts` or change an existing test's expectation.
- A new test that exposes a real defect stays in the suite as `it.failing` / `test.fails` with a `DEFECT-n` comment and is listed in the report; production code is not changed to make it pass.
- No new `.ts` outside `server/src/` except under `server/test/` (excluded from the build). Before committing: `cd server && rm -rf dist && npm run build && ls dist/main.js`.
- Test ports: API :4100, client :3100 (`NEXT_DIST_DIR=.next-e2e`). Never :3000/:4000.
- Subagents do not commit and do not edit any `package.json`; the coordinator installs dependencies and commits.
- Commits as `Muhammad-AIUB <mjubayer.aiub@gmail.com>` on branch `test/full-suite`; no push.

## File Structure

```
docker-compose.test.yml               throwaway Postgres on 127.0.0.1:5544
server/src/app.setup.ts               configureApp(app) — shared by main.ts and tests
server/test/jest-int.json             jest config for *.int-spec.ts (runInBand)
server/test/support/test-db.ts        TEST_DB urls, assertTestDatabase(), resetDb()
server/test/support/setup-db.js       create DBs, prisma db push, medicines DDL, marker
server/test/support/medicines.sql     test-only DDL + seed for the raw medicines table
server/test/support/app.ts            createTestApp() → { app, http, prisma, mail }
server/test/support/doubles.ts        FakeMailService, noThrottleStorage
server/test/support/fixtures.ts       makeDoctor, makeAssistantLink, makeSupervisor, makePatient, loginAs
server/test/serve.ts                  boots the app on :4100 for E2E / load
server/test/*.int-spec.ts             integration, contract, regression suites
client/src/test/fixtures.ts           client-side fixtures
client/src/**/*.prop.test.ts          property tests
client/src/lib/prescriptionDoc.snap.test.ts
e2e/                                  Playwright project (own package.json)
load/                                 k6 scripts
scripts/test-repeat.mjs               flaky detector
scripts/schema-drift.mjs              read-only prod ⇄ test schema comparison
docs/TEST-REPORT.bn.md                final report
```

---

### Task 1: Foundation (coordinator, sequential)

**Produces:**
- `configureApp(app: NestExpressApplication, config: ConfigService): void`
- `createTestApp(opts?: { throttle?: boolean }): Promise<{ app, http: () => supertest.Agent, prisma: PrismaService, mail: FakeMailService, close(): Promise<void> }>`
- `resetDb(prisma): Promise<void>` — truncates every Prisma table, keeps `medicines` and the marker
- `makeDoctor(prisma, over?) → { user, password }`, `makeAssistantLink(prisma, doctorId, assistantId, permissions)`, `makeSupervisor(prisma, patientId, doctorId)`, `makePatient(prisma, doctorId, over?)`, `loginAs(app, user) → supertest.Agent` (cookie jar)
- npm scripts: server `test:db`, `test:int`, `test:serve`; client `test:cov`

- [ ] Add `docker-compose.test.yml`; `docker compose -f docker-compose.test.yml up -d`
- [ ] Extract `configureApp` from `main.ts` (behaviour-preserving); run existing suite + real build
- [ ] Write `test-db.ts`, `setup-db.js`, `medicines.sql`; run `npm run test:db`; verify marker
- [ ] Write `doubles.ts`, `app.ts`, `fixtures.ts`, `jest-int.json`
- [ ] Write `smoke.int-spec.ts` (guard refuses a non-test URL; login round-trip works); run `npm run test:int`
- [ ] Install dev deps: server `fast-check`; client `fast-check @vitest/coverage-v8@^2`; root `e2e/` `@playwright/test`
- [ ] Commit

### Task 2: Server integration + regression (agent B, DB `muqsit_int_test`)

**Files:** `server/test/auth.int-spec.ts`, `access.int-spec.ts`, `prescriptions.int-spec.ts`, `dto-whitelist.int-spec.ts`, `ipd-analogue.int-spec.ts`, `regression.int-spec.ts`

- [ ] auth: register → OTP (from `FakeMailService`) → verify → login refused while `pending` → approved login sets `mhs_at`/`mhs_rt` httpOnly → `/auth/me` → refresh rotates → reuse of a revoked token after the grace window kills the family → logout; 6th login in a minute is 429 with the real throttler
- [ ] access table (server/CLAUDE.md Rule 2): owner / assistant-in-workstation / supervisor / stranger × find-by-mobile, open, update, list prescriptions, DELETE; forged `X-Workstation` → 403; supervisor read returns `incompleteRx: null`; `hmDrugDates` denied to assistant and to supervisor
- [ ] prescriptions: create persists items in order incl. `isCont`/`isNote`; stored under the supervisor's own `doctorId`; habit/phrase write failure does not fail the save
- [ ] DTO whitelist: unknown field is stripped, every declared field of `UpdatePatientDto` and the prescription DTO round-trips
- [ ] IPD analogue: server assigns `id`/`addedAt`; soft delete + restore; two concurrent POSTs both survive; `clinical` PATCH without `analogueSheets` keeps the pages
- [ ] regression: one test per review-pass-1/2 server fix lacking a test (read `git show de9fc55 60b39bc`), each naming its commit
- [ ] Run `npm run test:int` 3×, all green or `it.failing` with `DEFECT-n`

### Task 3: Contract (agent C, no DB writes)

**Files:** `server/test/contract-routes.int-spec.ts`, `server/test/contract-dto.int-spec.ts`

- [ ] Enumerate real routes from the booted app's Express router; parse `METHOD /path` entries from `docs/API.md`; assert both directions, listing every mismatch
- [ ] For each client mutation hook in `client/src/hooks/use*.ts`, extract the payload keys (static parse) and assert each exists on the matching server DTO class via `class-validator` metadata

### Task 4: Client unit, property, snapshot, fixtures, doubles (agent A)

**Files:** `client/src/test/fixtures.ts`, `client/src/test/apiStub.ts`, `client/src/lib/*.prop.test.ts`, `client/src/lib/prescriptionDoc.snap.test.ts`, unit tests for uncovered `lib/` modules, `client/vitest.config.ts` coverage block

- [ ] Coverage config (v8, `src/lib/**`, `src/hooks/**`, `src/components/**`); record baseline
- [ ] Property (fast-check, fixed seed printed on failure): `parseDateInput` never throws and round-trips every valid date; `resolveTwoDigitYear` stays inside its window; `ageFromDob` monotonic; `moveBlock`-family keeps a permutation and never separates a taper from its head; `splitDrugLabel` pieces reassemble byte-for-byte; `sortFindingsByDate` stable and idempotent; `sanitizeHtml` idempotent; `normaliseSex` total
- [ ] Snapshot: `buildPrescriptionHtml` for three fixtures (short, 8-medicine with taper and note, privacy copy)
- [ ] Unit tests for the largest uncovered `lib/` files per the coverage report
- [ ] Regression: one test per review-pass-1/2 client fix lacking a test (`git show 35e7039 82101b6 32fd628`)

### Task 5: E2E (agent D, DB `muqsit_e2e_test`)

**Files:** `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/tests/*.spec.ts`

- [ ] `webServer`: API via `npm --prefix ../server run test:serve` (:4100), client via `next dev -p 3100` with `NEXT_PUBLIC_API_URL=http://localhost:4100/api NEXT_DIST_DIR=.next-e2e`
- [ ] global-setup seeds a primary-tier doctor and a second practice
- [ ] Journeys: login; mobile lookup → new patient; write one medicine + diagnosis → Save & print → sheet iframe contains the medicine; reload restores the patient; wrong password shows an error; second doctor cannot find the first doctor's patient
- [ ] `retries: 0`, `trace: 'retain-on-failure'`

### Task 6: Load (agent E, DB `muqsit_load_test`)

**Files:** `load/lib.js`, `load/medicine-search.js`, `load/patient-lookup.js`, `load/prescription-save.js`, `load/login.js`, `load/README.md`

- [ ] `lib.js` refuses a base URL that is not `localhost:4100`
- [ ] Each script: ramp to 20 VUs for 60 s; thresholds `http_req_failed < 1%`, p95 recorded; JSON summary to `load/results/`

### Task 7: Flaky, coverage ratchet, drift, CI, report (coordinator)

- [ ] `scripts/test-repeat.mjs <cmd> <n>` — runs n times, reports tests whose outcome varied; run server unit ×3, client ×3, integration ×5
- [ ] Coverage thresholds at measured values (server `jest` config, client `vitest.config.ts`)
- [ ] `scripts/schema-drift.mjs` — read-only `information_schema` diff prod ⇄ test
- [ ] `.github/workflows/test.yml` (unit + integration with a Postgres service); `deploy.yml` untouched
- [ ] Full verification (spec §6); `docs/TEST-REPORT.bn.md`; update CLAUDE.md files; commit
