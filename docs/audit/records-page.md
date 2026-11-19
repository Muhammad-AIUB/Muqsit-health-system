# Patient Records page and files — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/records-page.md`](../rules/records-page.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Physician's sheet of 07/11/2026 (Records page)** — Open for physician: Total summary order (newest first vs sheet's oldest first) (+2 more); also `manual-patient-files.sql` NOT applied, Templates download, DICOM formats (the integration spec is written: 2026-11-18).
- **DICOM premium: whose account?** — The server reads the SIGNED-IN user's tier: an assistant on a basic account working under a premium doctor is refused (403), a premium-account assistant under a basic doctor is let in (seen 2026-11-18). Physician to say which is meant (the practice doctor's tier?). Not pinned by a test either way.
- **Who is "by"** — Name stamped is the practice doctor the request acts for (an assistant's Save & print names the practice doctor); "Dr." added on screen only if missing.
- **The records page's On examination has no delete any more** — The Edit went, as asked; a wrong entry can no longer be taken off from the screen; it stays in the history.
- **"Patient's input" is empty** — Physician to say what it should hold (a form the patient fills? the patient chat?); nothing in the app is called that.
- **Chief complaints / Diagnosis history** — List THIS practice's prescriptions only (the access rule); date is the day the prescription was saved (Dhaka).
- **Drug history on the records page** — The list the Drug history modal holds, including today's ℞ lines before they are printed.

**Known limits and defects, recorded on purpose**

- **Entries from before this release show no author** — None is guessed.
- **FIXED 2026-11-19 (release pending push) — a DICOM upload that the DTO refused left its temp file in `/uploads`** — A `fileDate` not in dd/mm/yyyy shape (e.g. 2026-11-07) or a name over 120 characters is refused by the ValidationPipe AFTER multer has written `uploads/tmp-<uuid>`, and the handler's `finally` never runs. No premium, owner or key check has run yet: ANY signed-in user (a basic account, a made-up patient id) can leave up to 300 MB per try in the folder that is served. Seen on a real run 2026-11-18 (found by the independent review, then confirmed); it was pinned by `it.failing` in `patient-files.int-spec.ts` (release 49e984f) and fixed on the owner's yes: `RemoveTempFileOnError` in `patient-files.controller.ts`, an interceptor listed after `FileInterceptor` that unlinks `req.file.path` on any error, and the test is now a plain one (a bad date, an over-long name from a basic account, a patient that does not exist: 400, nothing filed, nothing left). Checked in a copy on Node 22: the new test is red without the fix and green with it; the whole integration suite 472/472.
- **A request refused after its file was kept leaves that file in `/uploads`** — A well-formed but unreal date (31/02/2026), or a permission with no usable name, is refused after the image or the `.dcm` is stored (up to 300 MB for DICOM): unreferenced, harmless to the record, disk only. On the DICOM route the name and owner checks come first and the date check does not; on the permission route the name check also runs after the image is stored. Seen 2026-11-18; not pinned by a test.
- **Download of the Drug history section is unchanged** — Entries as stored, by date — not the new table, its sort or its columns.

**Closed — kept as the record of what was done or decided**

- **Disease and surgical history read from the On-examination popup** — Read from `Disease Hx:` / `Surgical Hx:` lines; superseded 02/11/2026: those boxes moved to the sidebar's History row and write at Add.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Physician's sheet of 07/11/2026 (Records page).** Done: collapsible sections (item 1) and the premium-only Total summary with its Download. Built, not yet released: **Permissions** gallery and **Imaging DICOM** (server `PatientFile` table + `patient-files` routes + in-app `dwv` viewer so scans never leave our server). **`server/prisma/manual-patient-files.sql` is NOT applied** — the shared DB is production, so apply it (`npx prisma db execute --file prisma/manual-patient-files.sql --schema prisma/schema.prisma`) before the release; until then both sections show "could not load". Not done: the Permissions *Templates* download (the physician sends the templates); DICOM compressed formats untried in the viewer. Done since: the server integration spec for `patient-files` (`server/test/patient-files.int-spec.ts`, 2026-11-18). Open: (b) Total summary order: newest date first, the sheet's example reads oldest first. (c) The Total summary's premium gate is client-side only (the DICOM gate is on the server: see (e)). (d) Patient's input has no record in the app, so it is always empty in the summary. (e) DICOM premium reads the SIGNED-IN user's tier: an assistant on a basic account under a premium doctor is refused, a premium assistant under a basic doctor is let in (seen 2026-11-18) — which is meant? (f) Known limit: a request refused after its file was kept (an unreal date such as 31/02/2026, a permission with no usable name) leaves that unreferenced file in `/uploads`, up to 300 MB for DICOM; harmless to the record. (g) The DICOM temp-file defect (2026-11-18) is fixed (2026-11-19); see the first bullet under "Known limits and defects".

### On examination shared + Patient Records history sections (31/10/2026) - open for the physician

- [ ] **Who is "by".** The name stamped is the practice doctor's the request acts for: a doctor writing in their own practice is named; an ASSISTANT's Save & print names the practice doctor (whose prescription it is), not the assistant; a supervising doctor is named themself. Taken from the account's display name, else its name, exactly as stored — "Dr." is put in front on screen only when the name does not already begin with it.

- [ ] **Entries from before this release show no author.** None is guessed.

- [ ] **The records page's On examination has no delete any more** (the Edit went, as asked). A wrong entry can no longer be taken off from the screen; it stays in the history.

- [ ] **"Patient's input" is empty.** Nothing in the app is called that; the section says so. What should it hold (a form the patient fills? the patient chat?) is the physician's to say.
- [ ] **Disease and surgical history** is read from the On-examination popup's History boxes as they reached the shared history on Save & print (`Disease Hx:` / `Surgical Hx:` lines); each entry once, at the visit it was first recorded. What is typed in today's visit shows after Save & print. *(02/11/2026: those boxes moved to the sidebar's History row and write at Add — see the section below.)*
- [ ] **Chief complaints / Diagnosis history** list THIS practice's prescriptions only (a supervising practice never sees the owner's prescriptions, and the other way round — the access rule). The date is the day the prescription was saved (Dhaka).
- [ ] **Drug history on the records page** is the list the Drug history modal holds, including today's ℞ lines before they are printed.

### Drug history table, Edit and Add on the records page (07/11/2026) - open for the physician

- [ ] **Download of the Drug history section is unchanged:** the entries as stored, by date — not the new table, its sort or its columns.
