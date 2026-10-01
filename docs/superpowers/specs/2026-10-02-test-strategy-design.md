# Test strategy — production-grade verification for a hospital product

Date: 2026-10-02 · Branch: `test/full-suite` · Status: approved in chat

## 1. Why, and what "production grade" means here

Baseline measured today: server 256 unit tests (25.5% lines), client 946 unit
tests (coverage unmeasured), admin none. Everything is a unit test. Nothing
proves that the layers work *together*: a guard wired to a controller, a DTO
that keeps a field, a query that is really scoped in SQL, a prescription that
survives a save and prints.

For this product the failures that hurt a patient are, in order:

1. **Cross-practice access** — one doctor reads or writes another's patient.
2. **Silent data loss** — a field "saved" and dropped, a JSON column clobbered.
3. **A wrong printed prescription** — the legal document differs from what was typed.
4. **Wrong clinical logic** — a date, an age, an alert, a taper on the wrong drug.
5. **Unavailability** — the API slow or down during a clinic.

The suite is designed against that list, not against a coverage number.

## 2. Shape: a pyramid, weighted by risk

| Layer | Count | Speed | Proves | Risks covered |
|---|---|---|---|---|
| Unit + property | many | ms | pure logic is right for *every* input | 4 |
| Snapshot | few | ms | the printed document did not change by accident | 3 |
| Contract | few | ms–s | client, server and `docs/API.md` agree | 2 |
| Integration (real Postgres) | tens | seconds | guards, DTOs, SQL scoping, transactions | 1, 2 |
| E2E (browser) | a handful | minutes | the doctor's main journey works end to end | 1–3 |
| Load | 4 scenarios | minutes | latency budget and no errors under concurrency | 5 |

Trade-off accepted: E2E is the most realistic and the most expensive and
flaky layer, so it stays small (critical journeys only). Scoping and data-loss
rules are pushed down to integration tests, where they are fast and
deterministic.

## 3. Decisions and their trade-offs

**D1 — Tests never write to the production database.** The owner permits it;
the architecture declines it. Reasons: test rows land in real doctors' records
(`FUNCTIONAL-AUDIT.md` already lists one such leftover), load traffic would
slow a live clinic, and a shared mutable database makes tests unrepeatable.
All DB-backed tests use a throwaway `postgres:16-alpine` container on port
5544, database `muqsit_test`. A guard refuses to start unless the URL is
`127.0.0.1:5544` **and** the name ends `_test` — the SSH tunnel makes
production look like `localhost:5432`, so the host alone proves nothing.

**D2 — Production is used read-only, for one thing: schema drift.** The test
database is built from `schema.prisma` (`prisma db push` — safe here, it is an
empty container) plus the `manual-*.sql` files. Production is built by hand.
If the two differ, green tests lie. A read-only script compares
`information_schema` of both and lists differences. It needs the tunnel and
is run on demand, not in the test suite.

**D3 — The raw `medicines` table** is not in `schema.prisma`. The test database
gets it from a test-only DDL file whose columns are read from production
(read-only), seeded with the few medicine names existing tests already use.
No clinical content is invented.

**D4 — Coverage is a ratchet, not a target.** Thresholds are set at today's
measured value so coverage cannot fall; clinical-logic directories get their
own, higher, measured floor. Chasing a global percentage produces tests that
execute code without checking it.

**D5 — No retries to hide flakiness.** A flaky test is a defect. Sources are
removed (fixed clock, seeded randomness, no order dependence). A repeat-run
script detects instability. Playwright keeps a trace on failure.

**D6 — Contract testing without a broker.** One team, one repository: Pact
would add infrastructure for no gain. Instead (a) every Nest route must appear
in `docs/API.md` and vice versa; (b) fields the client sends must exist on the
DTO, tested through the real `ValidationPipe`.

**D7 — Snapshots only for the printed prescription.** Broad snapshots get
approved without reading. The print HTML is the one artefact where *any*
unintended change matters, so it gets a small set of reviewed snapshots.

**D8 — Property tests check invariants, never clinical values.** Round-trips,
idempotence, totality (never throws), order preservation. Expected clinical
values stay in the existing example tests, sourced from the physician.

**D9 — Load numbers from a laptop are a baseline, not a capacity claim.** They
detect regressions and gross problems (N+1 queries, missing index). Real
capacity needs a staging server shaped like the VPS — listed as a gap.

**D10 — Test code placement.** Server integration tests live in
`server/test/` (already excluded from the build — the `rootDir` trap). The
real build is run and `dist/main.js` checked before commit. E2E and load live
in a root `e2e/` and `load/` with their own `package.json`, so the deployed
apps gain no browser dependency.

**D11 — Isolated ports.** Test API on :4100, test client on :3100 with
`NEXT_DIST_DIR=.next-e2e` (already supported), so a running dev session is
untouched. The rate limiter (100/min) is raised by env **only** in the test
process.

**D12 — Bugs found are reported, not silently fixed.** A failing new test that
exposes a real defect is kept (marked as a known failure with a reference) and
listed in the report for the physician/owner to decide.

**D13 — CI gate is prepared, not activated.** A `test.yml` workflow
(unit + integration with a Postgres service container) is added. Making
`deploy.yml` depend on it changes how production deploys and is left as an
explicit owner decision.

## 4. Deliverables by requested item

1. **Unit** — fill the largest untested, high-risk units chosen from the coverage report (server: workstation resolution, patients access `where` shapes, auth refresh rotation; client: gaps in `lib/`).
2. **Integration** — `server/test/*.int-spec.ts`: auth (signup/OTP/login/refresh grace window), access table (owner/assistant/supervisor × find/open/update/delete), prescription create + derived writes, DTO whitelist round-trip, IPD analogue per-page routes + concurrent writers.
3. **E2E** — Playwright: login → mobile lookup/new patient → write ℞ → Save & print → sheet visible → reload restores; supervised patient opens blank.
4. **Test doubles** — `MailService` fake capturing OTPs, fixed clock, client `apiFetch` stub; one shared module each.
5. **Flaky** — `scripts/test-repeat` (N runs, diff outcomes), fixes for anything found, written policy.
6. **Coverage** — `@vitest/coverage-v8` for client; reports for both; ratchet thresholds.
7. **Fixtures** — factories: doctor, assistant link + permissions, supervisor, patient, prescription; synthetic identities only.
8. **Property** — `fast-check`: `dateInput`, `age`, `rxRowMove`, `splitDrugLabel` round-trip, `investigationOrder` stability, client⇄server normalise agreement, `likePrefix` escaping.
9. **Snapshot** — `prescriptionDoc` HTML for representative fixtures.
10. **Contract** — routes ⇄ `docs/API.md`; client payload fields ⇄ DTOs.
11. **Load** — k6: login, medicine search, patient lookup, prescription save; p95 thresholds; refuses non-localhost targets.
12. **Regression** — pins for review pass 1–2 fixes that have no test; each names the commit it guards.

Final: `docs/TEST-REPORT.bn.md` (Bangla) — results, coverage, load figures, defects found, and what was not verified.

## 5. Out of scope (named gaps)

Admin app tests · staging environment · mutation testing · accessibility and
visual-regression testing · backup/restore drill · security penetration test.
Each is listed in the report with a recommendation.

## 6. Verification

`tsc --noEmit` in server and client · both unit suites · integration, E2E and
load suites against the container · `rm -rf dist && npm run build && ls dist/main.js`.
