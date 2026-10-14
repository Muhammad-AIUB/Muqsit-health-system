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

- The client is on **3100** and the API on **4200**, and the API lets exactly
  that one web address through CORS (`server/test/support/env.ts`).
  **If another program holds one of them, move the pair for the run:**
  `E2E_WEB_PORT=3110 E2E_API_PORT=4210 npx playwright test`. `ports.ts` reads
  the two, refuses 3000 / 3001 / 4000, and the config tells the test API which
  web address to allow. Look first — `reuseExistingServer` takes whatever
  answers on the port for its own: on 2026-10-12 that was another project's
  dev server on 3100. (`netstat -ano | grep :3100`; the sandbox entries in
  `.claude/launch.json` stay on 3100 / 4200.)
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
- **The sandbox API stores uploads for real** — into `server/uploads/` on this
  machine (`ALLOW_LOCALHOST_UPLOAD_URLS` in `server/test/support/env.ts`); the
  `503` above is the Playwright guard's, not the API's. A hand-run "Save &
  print" files its snapshot there, and its URL names port 4100, so the tile
  never loads. Afterwards remove what it wrote:
  `find server/uploads -type f -newermt "<today> 00:00"` lists it. To look at
  a gallery or the image viewer without writing anything, put a
  `data:image/svg+xml;base64,…` URL into the made-up patient's `reportImages`
  with `docker exec -i muqsit-testdb psql -U test -d muqsit_e2e_test`.
- **Close your sandbox tab before running the suite.** The suite re-seeds the
  database, so a tab left open at `:3100` loses its session and keeps asking
  the same dev server for pages while the tests need it. Seen 2026-10-06: one
  test waited 13.5 s for the page's script (the trace showed the dev server
  compiling `/` again) and its 15 s check ran out as the page appeared. With
  the tab closed the same suite passed three times, 30% faster. A failure whose
  page snapshot is an empty `main` under a screenshot of the finished page is
  this, not the app. Seen again 2026-10-12 with the tab closed and a code
  review typechecking on the same machine: 13.1 s for the same script, in the
  sign-out journey. Since then `login()` waits for two things apart: up to
  30 s for the page's own script to arrive (`ROUTE_SCRIPT` in
  `tests/helpers.ts` — that wait is the dev server's, which production does
  not have), and then the usual 15 s for the page to be drawn with it — so a
  page that has become slow to draw still fails. `ROUTE_SCRIPT` names that
  one file exactly (`app/[tab]/page`): the sign-in page has a page script of
  its own, loaded before the address changes, and a pattern loose enough to
  match it made the wait return at once — which left the 15 s that had
  already failed (found in review the same day). If the suite ever stops at
  "the page's script" on every test, the dev server has renamed that file:
  look at the Network list of a trace and correct `ROUTE_SCRIPT`. After a run, sign in again with the NEW address in
  `e2e/.seed.json`; the made-up patients are gone too.

## Journeys

| File | What it proves |
|---|---|
| `auth.spec.ts` | wrong password → error, still on login, no session; correct login lands in the app and survives a reload; log out ends the session; and the sign-in helper every journey uses waits for something real — the app page's script is NOT there on the sign-in page and IS after sign-in |
| `prescription.spec.ts` | the editor is gated until a patient is chosen; new patient → medicine picked from the dropdown → final diagnosis → Save & print → the in-app sheet shows what was entered and no alert; **the API** holds exactly one prescription row with the item as typed; a double-click and a same-tick double press both store one row; an on-screen prescribing alert is not on the sheet or in the record |
| `restore.spec.ts` | typed content is auto-saved and a reload restores the patient and the editor; no prescription row is created by a draft |
| `isolation.spec.ts` | a second doctor (separate browser context) looking up the first doctor's patient's mobile is offered "Add New" and cannot read the patient or the prescription through the API either |
| `print-layout.spec.ts` | for A4 and for a new account's default page: the ℞ table does not scroll sideways, no element leaves the sheet sideways (in the in-app sheet and under the print stylesheet), and the printed PDF is one page of the configured size |
| `print-sheet.spec.ts` | with a real keyboard, which jsdom cannot give: after Save & print, closing the sheet leaves the focus OFF the button that saves, and Space and Enter afterwards store no second row; saved from the keyboard with Enter then HELD on Close, still one row; "Preview PDF" does get its focus back; with the focus INSIDE the sheet's frame Ctrl+P prints the sheet and not the app, Tab goes Print → Close → the sheet → Print and never out to the editor, and Escape closes it; "Mirror devices" is a switch that a press — or Space — turns on and off without sending the cursor into the patient search |
| `personal-note.spec.ts` | TWO browsers signed in as one doctor, "Mirror devices" on: device A types in one patient's personal note, device B picks another patient from the search box and A's editor moves on behind the open note — the note on A stays the first patient's, Save writes the words into THAT patient's note (read back through the API, with her details) and nothing into the other's; closed and opened again, it is the patient now in the editor. Fails on the code before 2026-10-12, where the open box showed the second patient's details over the first one's words |
| `investigation-units.spec.ts` | a result box with two units (HBV DNA, IU/mL or copies/mL): a viral load typed with its groups in the second unit's box leaves the first unit's box EMPTY, and is shown, printed on the sheet and stored through the API exactly as typed in copies/mL — never as a small number of IU/mL; a plain number is still converted. Fails on the code before 2026-10-12, where the first unit's box read `0.18` |
| `bulk-medicine.spec.ts` | "Add Bulk Medicine", five journeys: a medicine prescribed at one visit is offered at the next with its dose and is added once; from the keyboard alone (search, the list as one Tab stop, a taper with its medicine, its prescribing warning, Enter held on Add); with the connection gone the box says so and loads when it is back; on a phone the box is whole on the screen; and medicines added below the edge of a long pad are brought into view — with, in the box, a list of fifty-four where End and the Page keys land on rows that are on the screen (scroll anchoring switched off) |
| `drug-history.spec.ts` | "Move to Rx": a medicine typed by hand at an earlier visit (`tab napa 500mg`) is NOT written a second time beside the same one picked from the list today at the same dose — `1 added · 1 already on ℞` — while another ticked medicine goes on as the history has it. Fails on the code before 2026-10-14, where the pad ended with two Napa lines |
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

## A journey is run once per seeding

`--repeat-each` signs the same seeded doctor in again, and a journey that ends
with an unsaved pad (the bulk-medicine ones do) has left that doctor a draft.
On the DEV server the next sign-in may open on that draft instead of the blank,
gated editor, and the journey waits two minutes for a mobile box that is not
there. The cause is not in the journey: `reactStrictMode` runs the editor's
hydrate effect twice on mount (`MuqsitContext`), the first run takes the
fresh-sign-in mark and clears the stored draft, and the second — the mark gone
— asks for the stored draft and may be answered before the clearing has
landed. A production build runs the effect once. (The developer's own
`next dev` on :3000 has the same race: a fresh sign-in there can open on that
doctor's last draft instead of the gate. It is their own draft.) To run a journey several
times, run the command several times: each run seeds new doctors (found
2026-10-14, from one failure in four repeats; the trace shows the `PUT` and
the `GET` of `/prescription-draft` a millisecond apart).

## Seeing a journey fail on the released rule

A journey written for a fix is run once against the code WITHOUT the fix —
and not by taking the fix out of this checkout, which the developer's own
servers watch (root `CLAUDE.md`). Make a copy of `client/` ON THE SAME DRIVE
(an untracked folder at the repository's root will do; it is deleted
afterwards), without `node_modules` and the `.next*` folders; link
`node_modules` in (`mklink /J`); put the released file
into the copy with `git show HEAD:<path> > <copy>/<path>` from Git Bash (a
PowerShell pipe re-encodes it); and run the journey with a throwaway config
that only changes the web server's `cwd` to the copy. Unlink `node_modules`
before deleting the copy. A copy on ANOTHER drive does not work: `next dev`
follows the link to the real folder and cannot write a relative path to it
(`Can't resolve './E:/…/node_modules/next/…'`). Unit suites run from a copy
on any drive.
