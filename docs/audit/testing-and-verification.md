# Testing and verification — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/testing-and-verification.md`](../rules/testing-and-verification.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Print Queue — NOT run** — Safari and Firefox, a real printer, header wrap at phone width; pinned in `OpdView.print.test.tsx` and `opdQueueDoc.test.ts` (jsdom only).
- **SMS / Payment — NOT run** — A browser (box, Payment page, admin panel checked in jsdom only), Safari / Firefox, a real gateway, a real payment.
- **A flaky pair in `server/test/opd-queue.int-spec.ts`** — Seeds rows at now minus one hour, so fails within the first hour after Dhaka midnight; pre-dates this feature; a defect to fix on its own.
- **Patient's own code / admin account page (16/11/2026) — run 22/11/2026, two defects found and fixed** — `patient-access.int-spec.ts` and `admin-doctor.int-spec.ts` ran on the throwaway database (the whole suite: 28 suites, 576 tests green after the fixes); the SQL is applied to the shared database; no real text message was sent, the admin page was seen against a stand-in API only, and the fixes were not checked by breaking the code.
- **OPD presence — not run** — Safari, and a supervised patient's stage in a browser (server logic covered by unit and integration tests).
- **OPD presence — not exercised in a browser** — Two devices at once (reception ticking, doctor's ~10 s poll) and a supervised patient's stage; unit and integration tests only.
- **Records history sections — not run in a browser** — The records page and its Downloads (pop-up window) were checked in jsdom only.
- **Multiple chambers — not run** — Safari / Firefox, a phone in a real browser, an assistant choosing a chamber in a browser (covered by integration tests).
- **Patient photo / circled plus — not checked** — The photo on a slow network in a real browser, and the circled plus in night mode by eye.
- **Drug history by generic — not checked by eye** — The note's look in night mode and on a phone.
- **History in the sidebar — browser run in Chromium only** — `e2e/tests/history-sidebar.spec.ts` passed; not run: Safari / Firefox, a phone, paper, an assistant or supervising doctor in a browser.
- **Drug history table — run in a browser (Chromium only)** — `e2e/tests/drug-history-table.spec.ts` and `records-oe.spec.ts`; not run: Safari / Firefox, a phone, Add through the real pad, night mode.
- **Statistics — not run** — Safari / Firefox, a phone in a real browser, night mode by eye, the chart at 375px by eye, printing (nothing prints).

**Closed — kept as the record of what was done or decided**

- **Review before release, 2026-10-12 — pass 5, fixed the same day** — Four fixes: "Mirror devices" caption focus, print-sheet focus after Save & print, phone chart names, two tests that could not fail; plus smaller chart/popup fixes.
- **The fixes were reviewed again, 2026-10-12** — "Added results" no longer fuses parts (`METs:10,150 bpm`); Escape closes the month list from anywhere; `Pot.`/`Sod.` stay part of the name; held-Enter print-sheet case run in a browser.
- **OPD queue by day — browser journey** — `e2e/tests/opd-queue-day.spec.ts` passed in Chromium against the throwaway database; only Chromium was run.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [x] **Review before release, 2026-10-12 — what it found in pass 5, fixed the
  same day.** An independent read of the nine commits found no lost data and
  no change to the printed sheet, and four things that had to be put right
  first. (1) Pressing "Mirror devices" also sent the cursor into the patient
  search: a caption now has to be marked (`data-caption`) and the switch is
  a real button. (2) Closing the print sheet after "Save & print" left the
  focus on that button, where Enter or Space saves the visit again: that
  sheet no longer gives the focus back. (3) On a phone's health-trend chart
  two strengths of one medicine had the same name: a name takes two lines
  there and the dosage form gives way. (4) Two tests could not fail: the
  calendar's is now run with a result half typed, the print sheet's frame is
  compared with a bare one, and the sheet's keys are run in a real browser
  (`e2e/tests/print-sheet.spec.ts`). Also put right: the month names on the
  chart keep one rhythm and the month under way at the left edge is named;
  Escape with the month list open closes the list from the month's name too;
  every result box in the Investigation popup has a name; and "Added
  results" no longer shows a calculator's `1,500` as `1, 500`.
- [x] **The fixes were reviewed again, 2026-10-12 — and two of them were not
  right yet.** (1) The first "Added results" fix kept together whatever
  looked like a grouped number, and so fused two parts into one: ETT's
  `METs:10` beside a report beginning `150 bpm` read `METs:10,150 bpm`. It
  now asks the catalog which values can only be one part (a calculator's
  sentence, a one-box test, free text) and shows the rest as before; a test
  over every multi-box test in the catalog holds that no two parts are
  shown without a space. (2) Escape with the month list open still closed
  the popup from a result box; it closes the list from anywhere now. Also:
  on a phone's chart a first word that is not a dosage form (`Pot.`,
  `Sod.`) stays part of the name and a long name is cut before its strength
  is; `useDialog` takes "do not give the focus back" when the popup opens;
  the result boxes' names start with the words on screen; and the worst
  case of the print-sheet fix — saved from the keyboard, Enter HELD on
  Close — is run in a real browser (with the fix taken out, the held key
  presses Save & print again and the sheet comes back up). Of the
  catalog's 926 tests, 75 are calculators and 794 have one box — those are
  shown as stored; 57 have several boxes and are shown as before.

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

Checked by breaking the code, and where that was done: until this review the
breaks were made in the working checkout, which the dev servers watch — and the
dev database is production. They are made in a copy of the sources now (root
`CLAUDE.md`, the last pattern but one).

### OPD queue by day (28/10/2026) — what is built, and what is not

- [x] **Browser journey:** `e2e/tests/opd-queue-day.spec.ts` (calendar → later day → schedule → three patients → order → reload → empty today → locked past day) passed in Chromium against the throwaway database. Only Chromium was run.

### OPD queue: Print Queue (30/10/2026) - open for the physician

- [ ] **NOT run:** Safari and Firefox, a real printer, and how the header wraps at phone width. Pinned in `OpdView.print.test.tsx` and `opdQueueDoc.test.ts` (jsdom only).

### SMS to a day's queue, and Settings → Payment (01/11/2026) - open for the physician

- [ ] **NOT run:** a browser (the box, the Payment page and the admin panel were checked with unit tests in jsdom only), Safari / Firefox, a real gateway, a real payment.

### OPD queue: presence, urgency and status (29/10/2026) - open for the physician

- [ ] **A flaky pair in `server/test/opd-queue.int-spec.ts`** ('rows an older build wrote with no place', 'a patient added after such rows') seeds rows at now minus one hour, so it fails when run within the first hour after Dhaka midnight. It pre-dates this feature and is not fixed here; a test whose outcome varies is a defect to fix on its own.
- [ ] **Not run:** Safari, and a supervised patient's stage in a browser (server logic is covered by unit and integration tests).

- [ ] **Not exercised in a browser:** two devices at once (reception ticking, a doctor's open screen picking it up on its ~10 s poll), and a supervised patient's stage. Both are covered by unit and integration tests only.

### On examination shared + Patient Records history sections (31/10/2026) - open for the physician

- [ ] **Not run in a browser:** the records page and its Downloads (pop-up window) were checked in jsdom only.

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **Not run:** Safari / Firefox, a phone in a real browser, and an assistant choosing a chamber in a browser (covered by integration tests).

### Patient photo and the circled plus (02/11/2026) - open for the physician

- [ ] **Not checked:** the photo on a slow network in a real browser (the `<img>` is redrawn per patient so the old face cannot linger while the new one downloads), and the circled plus in night mode by eye.

### Drug history shown by its generic names (02/11/2026) - open for the physician

- [ ] **Not checked by eye:** the note's look in night mode and on a phone.

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

- [ ] **Browser:** run in Chromium only (`e2e/tests/history-sidebar.spec.ts`: add, reload, × / Undo; the whole suite 47 passed, 1 skipped as before). Not run: Safari / Firefox, a phone, the printed sheet on paper (its History lines are pinned in unit tests), an assistant or a supervising doctor in a browser (covered by integration tests).

### Drug history table, Edit and Add on the records page (07/11/2026) - open for the physician

- [ ] **Run in a browser (Chromium only):** `e2e/tests/drug-history-table.spec.ts` — the columns, End / Total worked out, Current first, Sort, Edit with the shorthand, Save kept on the record and after a reload, the chart's bar and range, and a line another device changed first (409, nothing written over); and the amended `records-oe.spec.ts`. Not run: Safari / Firefox, a phone, Add typed through the real pad (covered by `AddMedicineRow`'s own tests and the store tests), night mode.

### Settings → Statistics (11/11/2026) - open for the physician

- [ ] **Not run:** Safari / Firefox, a phone in a real browser, night mode by eye, the chart at 375px width by eye (the box scrolls sideways by design), printing (nothing here prints).

### Admin account page, Remove MHS logo, patient's own code (16/11/2026) - open for the physician

- [x] **The two integration specs were run on 22/11/2026 (Docker was back), and the first run was red: 8 tests, two real defects.** `server/test/patient-access.int-spec.ts` and `server/test/admin-doctor.int-spec.ts` against the throwaway Postgres on `127.0.0.1:5544`. (1) A `{"constructor":5}` score key answered 500 — class-transformer in the global `ValidationPipe` crashes on it; the route now reads `scores` raw and `checkScores` answers 400 (`docs/rules/validation-and-dto.md`). (2) The search for another practice's patients never listed a patient with NO owner — `NOT: patientReachWhere` is NULL for a NULL `doctorId`; it now subtracts the positive reach (`docs/rules/db-and-prisma.md`). The other six failures were the specs' own: a patient, visit or chamber made by one test stayed for the next and was counted, so each test now starts from none (and the "another doctor's visits never leak" test checks the visits are really there under the other doctor). After the fixes: both specs 104/104; the whole integration suite 28 suites / 576 tests; the server's unit tests 41 suites / 688 tests; `tsc -p tsconfig.json` clean. NOT done: the two fixes were not checked by breaking the code in a copy (both were red before the fix, so each is pinned by a test that failed for its own reason); no `rm -rf dist && npm run build` (no file outside `src/` was added); the client's and admin's suites were not re-run for these server-only changes.
- [x] **The new SQL was applied to the shared database on 22/11/2026** (`manual-admin-settings-and-patient-access.sql`: 2 `User` columns and 3 tables owned by `exhort_user`, 13 users before and after). The patch is on `dev`, uncommitted and not pushed, so the VPS still runs the old code against the new columns, which is harmless.
- [ ] **Run in a browser:** the admin's account page (all three tabs) against a stand-in API with made-up data — not against the real console, not on a phone, not in Safari / Firefox. The doctor app's code box and lookup list are covered by jsdom tests only (not clicked through in a browser, and no real text message was sent — the gateway is a double in every test). The MHS mark's removal from the header is covered by `MhsMark.test.tsx`, the printed foot by `prescriptionDoc.brand.test.ts`.
- [ ] **The admin has no test runner,** and the deploy runs none for it: its copies of the Statistics helpers and the Point system's typed-score reader are held by `client/src/lib/adminCopies.test.ts` (the client's suite).
