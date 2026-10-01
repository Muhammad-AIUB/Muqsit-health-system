# e2e — browser end-to-end tests (Playwright)

Drives the real doctor app in Chromium against the real API, on a **throwaway
database**. Nothing here may ever reach the developer's own servers: the dev
`DATABASE_URL` in `server/.env` is the production database.

## What it talks to

| Piece | Where | How it is started |
|---|---|---|
| Test database | `127.0.0.1:5544`, `muqsit_e2e_test` (Docker, in memory) | `docker compose -f docker-compose.test.yml up -d`, then `cd server && npm run test:db` |
| Test API | `http://localhost:4200/api` | `TEST_DB_NAME=muqsit_e2e_test TEST_PORT=4200 npm run test:serve` (from `server/`) |
| Test client | `http://localhost:3100` | `next dev -p 3100` with `NEXT_PUBLIC_API_URL=http://localhost:4200/api` and `NEXT_DIST_DIR=.next-e2e` (from `client/`) |

`playwright.config.ts` starts the API and the client itself (`webServer`,
`reuseExistingServer: true`) and `global-setup.ts` empties the test database and
seeds one doctor **per test** (`server/test/seed-e2e.ts` → `e2e/.seed.json`,
gitignored). The ports are in `ports.ts`. Never 3000 / 4000.

- The client must stay on **3100**: `server/test/support/env.ts` allows exactly
  that origin through CORS.
- A process env var beats `client/.env.local` in Next, which is what points the
  browser bundle at the test API. `NEXT_DIST_DIR=.next-e2e` keeps the build out
  of the `.next` a developer's own dev server is using.
- Every browser context is guarded (`tests/helpers.ts#guardContext`): a request
  to any host other than the test client / test API is aborted and fails the
  test, and so does any uncaught error in the page.
- `POST /uploads/image` is answered `503` by the guard. "Save & print" files a
  PNG of the sheet through it, which would write real files into
  `server/uploads/` on every run; the snapshot is best-effort by design, so the
  save itself is unaffected. **The gallery snapshot is therefore not covered.**

## Run

```bash
docker compose -f docker-compose.test.yml up -d     # repo root, once
cd server && npm run test:db                         # once per container start
cd e2e && npm install && npx playwright install chromium
npx playwright test                                  # whole suite, ~4 min
npx playwright test prescription                     # one file
npx playwright show-report                           # traces/screenshots of failures
```

`workers: 1`, `retries: 0` — a flaky test is a defect to fix, not to retry. The
first run after a cold start is slow: `next dev` compiles each route on first
use (global setup warms `/login` and `/prescription`).

## Journeys

| File | What it proves |
|---|---|
| `auth.spec.ts` | wrong password → error, still on login, no session; correct login lands in the app and survives a reload; log out ends the session |
| `prescription.spec.ts` | the editor is gated until a patient is chosen; new patient → medicine picked from the dropdown → final diagnosis → Save & print → the in-app sheet shows what was entered and no alert; **the API** holds exactly one prescription row with the item as typed; a double-click and a same-tick double press both store one row; an on-screen prescribing alert is not on the sheet or in the record |
| `restore.spec.ts` | typed content is auto-saved and a reload restores the patient and the editor; no prescription row is created by a draft |
| `isolation.spec.ts` | a second doctor (separate browser context) looking up the first doctor's patient's mobile is offered "Add New" and cannot read the patient or the prescription through the API either |
| `print-layout.spec.ts` | for A4 and for a new account's default page: the ℞ table does not scroll sideways, no element leaves the sheet sideways (in the in-app sheet and under the print stylesheet), and the printed PDF is one page of the configured size |
| `defect-probes.spec.ts` | opt-in (`E2E_PROBES=1`), see below |

No clinical content is invented: medicines are rows of the seeded test
`medicines` table, the diagnosis is the placeholder `Test diagnosis`, and the
one alert the suite needs is raised with a seeded medicine plus one of the app's
own Associated-illness quick-picks — its text is read from the screen.

## Known defects pinned here

- **DEFECT-E1 (intermittent) — typing into the ℞ pad can crash the editor.**
  `Maximum update depth exceeded`, raised from `MedicinePad.tsx` (`setAcPos`),
  when keystrokes arrive faster than the editor re-renders. Not reproducible on
  every run, so it is a probe rather than a `test.fail()`:
  `E2E_PROBES=1 npx playwright test defect-probes`. Evidence in `evidence/`.
  Because of it the helpers wait for the page to go idle between pad edits
  (`settle()`); remove that when the defect is fixed.
- **DEFECT-E2 — the patient gate stops the mouse, not the keyboard.**
  `PatientGate` closes the editor with `pointer-events: none`; Tab from the
  mobile field still walks into it and text can be typed into the ℞ pad with no
  patient chosen. Pinned with `test.fail()` in `prescription.spec.ts` — when it
  is fixed that test reports "expected to fail, but passed"; remove the marker.

## Selectors

The app has almost no test ids and none were added. Selectors are role, label,
placeholder and visible text. The brittle ones:
`[data-rx-row]` (the pad's drag hook), the locked mobile box (found as the input
beside "New Prescription"), `.sheet` / `.right table` inside the print document,
and field popups opened by clicking the field's label text (the `+` buttons have
no accessible name).
