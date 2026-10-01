# Load tests (k6)

Load tests for the API. They run **only** against the throwaway test API on
`http://localhost:4100`, which is backed by the Docker test Postgres
(`muqsit-testdb`, database `muqsit_load_test`).

> **Never point these at `:4000`.** The dev API uses `server/.env`, whose
> `DATABASE_URL` is the production database of real patients. `lib.js` throws at
> init unless `BASE_URL` is exactly `http://localhost:4100` or
> `http://127.0.0.1:4100`, and every script imports it. Do not remove that guard.

## Run

Prerequisites: k6, Docker with the test database prepared
(`docker compose -f docker-compose.test.yml up -d`, then `cd server && npm run test:db`).

```bash
# 1. seed: 20 primary-tier doctors, 200 patients each; writes load/.seed.json
cd server
TEST_DB_NAME=muqsit_load_test npx ts-node --transpile-only test/seed-load.ts

# 2. start the test API (prints "test API on http://localhost:4100/api  db=muqsit_load_test")
TEST_DB_NAME=muqsit_load_test npm run test:serve

# 3. in another shell, from the REPO ROOT (results are written to load/results/)
k6 run load/login.js
k6 run load/medicine-search.js
k6 run load/patient-lookup.js
k6 run load/prescription-save.js
k6 run load/mixed.js
k6 run load/stress.js
```

- `-e RUN_TAG=run2` appends a suffix to the result files, to keep several runs.
- `-e RESULTS_DIR=...` changes the output folder (default `load/results`, relative to the working directory).
- Re-seed before a comparison run: `prescription-save` and `mixed` add rows, and
  the seed step truncates every application table of the load database.

## Scenarios

| Script | What it drives |
|---|---|
| `login.js` | `POST /auth/login` every iteration |
| `medicine-search.js` | `GET /medicines/search?q=` with 2-4 letter prefixes of the fixture medicines |
| `patient-lookup.js` | `GET /patients/by-mobile?mobile=` for the doctor's own seeded patients |
| `prescription-save.js` | `POST /prescriptions` with 5 item lines (plus the habit/phrase writes that follow a save) |
| `mixed.js` | 55 % search, 30 % lookup, 10 % save, 5 % re-login |
| `stress.js` | search + lookup, 20 -> 50 -> 100 VUs, 30 s each, tagged per step |

Standard profile: ramp 0 -> 20 VUs in 20 s, hold 60 s, ramp down 10 s. Each VU is
one seeded doctor with its own cookie jar and logs in once
(`noCookiesReset: true` keeps the session between iterations).

## Reading the numbers

- **reqs / rps**: completed requests, and requests per second. For the standard
  scenarios rps is averaged over the whole run including ramps, so the
  steady-state rate is higher. In `stress.js` the per-step rows use the 30 s
  hold window.
- **err %**: `http_req_failed`, any non-2xx/3xx response or transport error. Failure
  bodies (first 3 per VU) go to stderr; capture with `2> load/results/<name>.log`.
- **p50 / p95 / p99**: response-time percentiles in ms. p50 is the typical request;
  p95/p99 are what the unlucky requests see, and they move first when the server saturates.
- **Thresholds** (exit code 99 when they fail): `http_req_failed < 1 %` and
  `checks > 99 %`. There are deliberately no latency thresholds yet; add them
  once a baseline from a stable machine exists.
- The VUs are a closed model with short think times (0.1-1 s), far more
  aggressive than a real doctor. 20 VUs here is not "20 doctors"; it is many
  times that.
- `stress.js` is a probe, not a gate. The breaking point is the step where
  throughput stops rising while p95 keeps climbing, or where errors appear.

## Caveats

- **This is a regression baseline, not the VPS's capacity.** Laptop + Docker
  Desktop + k6 on the same machine + `ts-node` share the same CPU. Compare a run
  with an earlier run on the same machine; do not read absolute numbers as
  production limits. Run-to-run variance on the laptop is large (see the two
  `mixed` runs), so look for changes of 2x, not 10 %.
- **The `medicines` table has 6 fixture rows** (`server/test/support/medicines.sql`).
  Medicine-search latency here measures the request pipeline, not the cost of
  `ILIKE '%q%'` over the real catalogue.
- The rate limiter is disabled on the test server, and login uses bcrypt cost 4
  fixtures (`support/fixtures.ts`), so login is cheaper here than in production.
- No uploads, IPD/OPD, admin or assistant-workstation paths are covered.
