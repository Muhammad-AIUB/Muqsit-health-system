# Patient Records page and files — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/records-page.md`](../rules/records-page.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Physician's sheet of 07/11/2026 (Records page)** — Open for physician: Total summary order (newest first vs sheet's oldest first) (+2 more); also `manual-patient-files.sql` NOT applied, Templates download, DICOM formats, integration spec not done.
- **Who is "by"** — Name stamped is the practice doctor the request acts for (an assistant's Save & print names the practice doctor); "Dr." added on screen only if missing.
- **The records page's On examination has no delete any more** — The Edit went, as asked; a wrong entry can no longer be taken off from the screen; it stays in the history.
- **"Patient's input" is empty** — Physician to say what it should hold (a form the patient fills? the patient chat?); nothing in the app is called that.
- **Chief complaints / Diagnosis history** — List THIS practice's prescriptions only (the access rule); date is the day the prescription was saved (Dhaka).
- **Drug history on the records page** — The list the Drug history modal holds, including today's ℞ lines before they are printed.

**Known limits and defects, recorded on purpose**

- **Entries from before this release show no author** — None is guessed.
- **Download of the Drug history section is unchanged** — Entries as stored, by date — not the new table, its sort or its columns.

**Closed — kept as the record of what was done or decided**

- **Disease and surgical history read from the On-examination popup** — Read from `Disease Hx:` / `Surgical Hx:` lines; superseded 02/11/2026: those boxes moved to the sidebar's History row and write at Add.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Physician's sheet of 07/11/2026 (Records page).** Done: collapsible sections (item 1) and the premium-only Total summary with its Download. Built, not yet released: **Permissions** gallery and **Imaging DICOM** (server `PatientFile` table + `patient-files` routes + in-app `dwv` viewer so scans never leave our server). **`server/prisma/manual-patient-files.sql` is NOT applied** — the shared DB is production, so apply it (`npx prisma db execute --file prisma/manual-patient-files.sql --schema prisma/schema.prisma`) before the release; until then both sections show "could not load". Not done: the Permissions *Templates* download (the physician sends the templates); DICOM compressed formats untried in the viewer; a server integration spec for `patient-files`. Open: (b) Total summary order: newest date first, the sheet's example reads oldest first. (c) Premium gate is client-side only. (d) Patient's input has no record in the app, so it is always empty in the summary.

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
