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

## Opening the sandbox by hand (design / QA passes)

To look at screens with made-up patients instead of the production data behind
`:3000`: start the container and `npm run test:db` as above, seed it
(`cd server && TEST_DB_NAME=muqsit_e2e_test TEST_PORT=4200 npx ts-node --transpile-only test/seed-e2e.ts`),
then start `api-e2e` and `web-e2e` from `.claude/launch.json` and sign in at
`http://localhost:3100` as any doctor in `e2e/.seed.json`.

- **It signs you out of `localhost:3000`.** A browser keeps one set of cookies
  per HOST, not per port, so the sandbox session replaces the dev one. Sign in
  again at `:3000` afterwards.
- `next dev` with `NEXT_DIST_DIR=.next-e2e` rewrites `client/tsconfig.json`.
  Stop the server, then `git checkout -- client/tsconfig.json`. Never commit it.
- **Close your sandbox tab before running the suite.** The suite re-seeds the
  database, so a tab left open at `:3100` loses its session and keeps asking
  the same dev server for pages while the tests need it. Seen 2026-10-06: one
  test waited 13.5 s for the page's script (the trace showed the dev server
  compiling `/` again) and its 15 s check ran out as the page appeared. With
  the tab closed the same suite passed three times, 30% faster. A failure whose
  page snapshot is an empty `main` under a screenshot of the finished page is
  this, not the app. After a run, sign in again with the NEW address in
  `e2e/.seed.json`; the made-up patients are gone too.

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
- **DEFECT-E2 — FIXED 2026-10-06.** The patient gate stopped the mouse, not the
  keyboard: `PatientGate` closed the editor with `pointer-events: none`, so Tab
  from the mobile field walked into it and text could be typed into the ℞ pad
  with no patient chosen. The closed gate is `inert` now, and the `test.fail()`
  marker is gone — "the gated editor cannot be typed into from the keyboard
  either" in `prescription.spec.ts` is an ordinary regression test.

## Selectors

The app has almost no test ids and none were added. Selectors are role, label,
placeholder and visible text. The brittle ones:
`[data-rx-row]` (the pad's drag hook), the locked mobile box (found as the input
beside "New Prescription"), `.sheet` / `.right table` inside the print document,
and field popups opened by clicking the field's label text (the `+` buttons had
no accessible name when these were written; since 2026-10-05 each is named
`Add <field>`, and the helpers still click the label).
