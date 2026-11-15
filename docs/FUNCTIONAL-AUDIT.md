# Muqsit Health System — Functional audit: open threads, known limits, decisions

What is waiting for a decision, what is known and not done, what is a limit recorded on purpose, and what was closed — by area.

The threads themselves are in [`docs/audit/<area>.md`](audit/), moved there **word for word** from this file on 2026-11-15, when it had grown to 144 KB that every session was told to read at its start. Each area file opens with one line per thread ("At a glance") and then holds the threads in full, in their original order.

## How to use it

- **At session start:** read the table and the two lists of titles below.
- **Before touching an area:** read its file — the "At a glance" lines, then every thread that bears on your change. The rules for the same area are in `docs/rules/<area>.md`, the same file name.
- **"Open" means the decision is the physician's or the product owner's.** Engineering does not pick an answer for one; what was built in the meantime is written in the thread as the reading it rests on.
- **A status is how the thread reads, not a check of the code.** The statuses were assigned on 2026-11-15 by reading each thread; a tick-box left unticked in the original was not taken as proof either way.
- **Adding a thread:** write it in the area's file — the full text under "The threads, in full", one line under "At a glance" — and, if it is open or to do, add its title to the list below and correct the count in the table. Same commit as the code.

## By area

| Area | Open | To do | Known limits | Closed | File |
|---|---|---|---|---|---|
| General — the first audit (July 2026) | · | 1 | · | · | [`audit/general.md`](audit/general.md) |
| Access and scoping | 5 | 1 | 2 | · | [`audit/access-and-scoping.md`](audit/access-and-scoping.md) |
| Editor lifecycle: drafts, reload, visit state, device mirror | 1 | · | 3 | 10 | [`audit/editor-lifecycle.md`](audit/editor-lifecycle.md) |
| The ℞ pad and Save & print | 6 | · | 4 | 7 | [`audit/rx-pad.md`](audit/rx-pad.md) |
| Drug history | 9 | 3 | 6 | 8 | [`audit/drug-history.md`](audit/drug-history.md) |
| Prescribing alerts, drug hypersensitivity, high-alert medication | 1 | · | · | · | [`audit/rx-alerts.md`](audit/rx-alerts.md) |
| "Your usual", learned phrases, Add Bulk Medicine, drug advice | 8 | 1 | 3 | 10 | [`audit/habits-and-phrases.md`](audit/habits-and-phrases.md) |
| Investigations | 2 | 1 | 1 | 3 | [`audit/investigation.md`](audit/investigation.md) |
| Health monitoring and the trend chart | 4 | · | · | 9 | [`audit/health-trends.md`](audit/health-trends.md) |
| Clinical calculators | 1 | · | · | 1 | [`audit/calculators.md`](audit/calculators.md) |
| The visit sheet and the app shell | 3 | · | 3 | 1 | [`audit/visit-sheet.md`](audit/visit-sheet.md) |
| Printing | 6 | · | 4 | 1 | [`audit/printing.md`](audit/printing.md) |
| Patient identity | 1 | · | 2 | 1 | [`audit/patient-identity.md`](audit/patient-identity.md) |
| Patient Records page and files | 6 | · | 2 | 1 | [`audit/records-page.md`](audit/records-page.md) |
| OPD queue, chambers, print queue | 15 | · | 5 | 5 | [`audit/opd.md`](audit/opd.md) |
| IPD | · | · | 4 | 1 | [`audit/ipd.md`](audit/ipd.md) |
| Patient chat, notes, activity feed | · | 1 | · | 2 | [`audit/chat-and-notes.md`](audit/chat-and-notes.md) |
| Settings → Statistics | 4 | · | · | 4 | [`audit/statistics.md`](audit/statistics.md) |
| SMS and payment | 6 | 2 | 1 | 3 | [`audit/sms-and-payment.md`](audit/sms-and-payment.md) |
| Settings | 1 | 1 | · | 1 | [`audit/settings.md`](audit/settings.md) |
| Research companion | · | 1 | · | · | [`audit/research.md`](audit/research.md) |
| Uploads | 1 | 1 | · | 1 | [`audit/uploads.md`](audit/uploads.md) |
| Dates | 2 | · | · | · | [`audit/dates.md`](audit/dates.md) |
| Forms, typing, BAN / EN, number formats | 1 | · | 3 | · | [`audit/forms-and-input.md`](audit/forms-and-input.md) |
| Popups, focus, keyboard, accessibility | 1 | · | · | 5 | [`audit/dialogs-and-focus.md`](audit/dialogs-and-focus.md) |
| Lists: loading, empty and error states | · | · | · | 2 | [`audit/lists-loading-errors.md`](audit/lists-loading-errors.md) |
| Theme, colour, night mode, icons | 2 | 2 | 1 | 1 | [`audit/theme-and-colour.md`](audit/theme-and-colour.md) |
| Layout, page zoom, responsive | 1 | · | · | · | [`audit/layout-and-zoom.md`](audit/layout-and-zoom.md) |
| Admin console | 1 | · | · | 1 | [`audit/admin.md`](audit/admin.md) |
| Database, manual SQL and Prisma | · | 5 | · | 1 | [`audit/db-and-prisma.md`](audit/db-and-prisma.md) |
| Performance | · | 1 | · | 2 | [`audit/performance.md`](audit/performance.md) |
| Testing and verification | · | 12 | · | 3 | [`audit/testing-and-verification.md`](audit/testing-and-verification.md) |
| Build, deploy, dependencies | · | 5 | · | 4 | [`audit/deploy-and-ops.md`](audit/deploy-and-ops.md) |
| **All** | **88** | **38** | **41** | **88** | |

## Open — a decision or a confirmation is owed

**Access and scoping** — [`audit/access-and-scoping.md`](audit/access-and-scoping.md)

- Unowned patients are retained but unreachable
- An assistant without `rx.medicines` can still READ the list
- A supervising doctor's Save & print is refused the owner's histories
- A supervising doctor now ADDS to the shared On-examination history
- Who may add and remove Disease / Surgical history

**Editor lifecycle: drafts, reload, visit state, device mirror** — [`audit/editor-lifecycle.md`](audit/editor-lifecycle.md)

- Save to complete later still refuses while a line is held

**The ℞ pad and Save & print** — [`audit/rx-pad.md`](audit/rx-pad.md)

- A second "Save & print" stores a second prescription (2026-10-12)
- For the physician — what the box does NOT price, by choice
- For the physician — food instructions meaning every day, not read so
- The 30-day month is the app's reading of "monthly"
- No answer to three re-sends, then a change, files the visit twice
- The 30-minute window is a choice, not the physician's

**Drug history** — [`audit/drug-history.md`](audit/drug-history.md)

- For the physician: a label without its form matches EVERY form
- A Drug history line added after printing ("+ Add medicine")
- Assumed: "drug history" means the modal and the Records page section
- Assumed: name shown is `<dosage form> <generic> <strength>`
- Does "Continue" count as Current medication?
- End = Start + the days of the course
- Total = units a day × days
- The name in the table is the generic with the brand in brackets
- Edit is the first change to a stored drug-history line

**Prescribing alerts, drug hypersensitivity, high-alert medication** — [`audit/rx-alerts.md`](audit/rx-alerts.md)

- H/O drug hypersensitivity and High-Alert Medication (31/10/2026)

**"Your usual", learned phrases, Add Bulk Medicine, drug advice** — [`audit/habits-and-phrases.md`](audit/habits-and-phrases.md)

- A medicine only saved with no dose, timing or duration is not listed
- "Popular" counts the patients given the instruction SHOWN
- A medicine already on ℞ is never changed from the box
- One medicine under two generics in the catalogue
- A hand-typed line stays without its generic when the box skips it
- The same medicine can be added at a second dose
- A row with no generic says so only by not showing one
- "Your usual" in place of a medicine with `>>>` lines

**Investigations** — [`audit/investigation.md`](audit/investigation.md)

- Two names stand twice in the investigation catalog (2026-10-12)
- ⚕️ Fibrinogen's second unit does not agree with its factor

**Health monitoring and the trend chart** — [`audit/health-trends.md`](audit/health-trends.md)

- The "Symptoms · all visits" panel
- A number typed with a comma is not plotted (`DEFECT-HM-GROUPED`)
- Found in the fourth and fifth reviews and left open (2026-10-12)
- Two courses of one medicine: two rows here, ONE bar on the chart

**Clinical calculators** — [`audit/calculators.md`](audit/calculators.md)

- RPI maturation bands

**The visit sheet and the app shell** — [`audit/visit-sheet.md`](audit/visit-sheet.md)

- Physician's sheet of 31/10/2026 (UI items) — readings to confirm
- Entries are written at Add, not at Save & print
- Order: the order first written (oldest first)

**Printing** — [`audit/printing.md`](audit/printing.md)

- ⊘ Hide for On examination starts OFF
- Should the PRINTED Drug history block also show generics?
- ⊘ Hide for History starts OFF
- ⊘ Hide takes the WHOLE History section off the sheet
- The patient's history now prints at EVERY visit
- The printed prescription is not a record of its printed history

**Patient identity** — [`audit/patient-identity.md`](audit/patient-identity.md)

- While a patient is being opened, the previous one is still on screen

**Patient Records page and files** — [`audit/records-page.md`](audit/records-page.md)

- Physician's sheet of 07/11/2026 (Records page)
- Who is "by"
- The records page's On examination has no delete any more
- "Patient's input" is empty
- Chief complaints / Diagnosis history
- Drug history on the records page

**OPD queue, chambers, print queue** — [`audit/opd.md`](audit/opd.md)

- Pre-set schedule is the sheet's own example
- What the Print Queue sheet prints, to be confirmed
- A day that has passed can be printed
- The doctor named is the workstation's doctor
- Times are the SAVED schedule's
- Which word heads the column: "Gender" or "Sex"?
- Which editor fields make "History taken"
- The "Completed" card changed meaning
- A printed visit stays status "waiting"
- An Urgent mark keeps the row red after the visit is Completed
- The visit-type pill "Urgent" can appear beside the new Urgent box
- Reception no longer sees a token on screen
- The first chamber is called "Main chamber"
- The choice of chamber is per user, per practice, per device
- The Print Queue sheet does not name the chamber

**Settings → Statistics** — [`audit/statistics.md`](audit/statistics.md)

- Only patients put on the OPD queue are counted
- By months shows one bar a month: the patients SEEN
- A patient on several chambers is counted in each chamber's list
- Disease statistics: `DM` and `Diabetes mellitus` are two lines

**SMS and payment** — [`audit/sms-and-payment.md`](audit/sms-and-payment.md)

- Still to confirm about the words (`appointment-message.ts`)
- Who gets one
- The count
- Assistants can send
- Sending again
- Payment: no gateway, no prices

**Settings** — [`audit/settings.md`](audit/settings.md)

- The profile's own "Chambers" list is separate

**Uploads** — [`audit/uploads.md`](audit/uploads.md)

- The public upload route can fill the disk

**Dates** — [`audit/dates.md`](audit/dates.md)

- The date is shown dd/mm/yyyy
- The entry's visit date

**Forms, typing, BAN / EN, number formats** — [`audit/forms-and-input.md`](audit/forms-and-input.md)

- BAN / EN on a printed visit — decided in the physician's stead

**Popups, focus, keyboard, accessibility** — [`audit/dialogs-and-focus.md`](audit/dialogs-and-focus.md)

- Left open by the 2026-10-12 review

**Theme, colour, night mode, icons** — [`audit/theme-and-colour.md`](audit/theme-and-colour.md)

- Assumed: "every plus" means every ADD
- Assumed: buttons with words keep their words, circled plus in front

**Layout, page zoom, responsive** — [`audit/layout-and-zoom.md`](audit/layout-and-zoom.md)

- Left open by the 2026-10-09 and 2026-10-12 design passes

**Admin console** — [`audit/admin.md`](audit/admin.md)

- Admin tabs "Supervising account" and "Team for IPD" — NOT built

## To do — engineering work, no decision needed

**General — the first audit (July 2026)** — [`audit/general.md`](audit/general.md)

- Fix order (this pass) — five-item list

**Access and scoping** — [`audit/access-and-scoping.md`](audit/access-and-scoping.md)

- Supervising doctor list

**Drug history** — [`audit/drug-history.md`](audit/drug-history.md)

- Test data left on a real record
- A skipped medicine's tapering lines are not compared
- Not verified against the production medicine chart

**"Your usual", learned phrases, Add Bulk Medicine, drug advice** — [`audit/habits-and-phrases.md`](audit/habits-and-phrases.md)

- The documents for this feature are long for its size

**Investigations** — [`audit/investigation.md`](audit/investigation.md)

- On-examination vitals (OE popup, `OeData`)

**Patient chat, notes, activity feed** — [`audit/chat-and-notes.md`](audit/chat-and-notes.md)

- Message tab

**SMS and payment** — [`audit/sms-and-payment.md`](audit/sms-and-payment.md)

- No real SMS has been sent
- SMS per chamber is not built

**Settings** — [`audit/settings.md`](audit/settings.md)

- Patient Settings → Data security level

**Research companion** — [`audit/research.md`](audit/research.md)

- Research companion → Compare / Export

**Uploads** — [`audit/uploads.md`](audit/uploads.md)

- Investigation / report images (base64 `invImages` pool)

**Theme, colour, night mode, icons** — [`audit/theme-and-colour.md`](audit/theme-and-colour.md)

- Night mode — not looked at
- Night mode — Safari / Firefox not run

**Database, manual SQL and Prisma** — [`audit/db-and-prisma.md`](audit/db-and-prisma.md)

- Restart API server
- OPD token / IPD bed unique-index SQL not applied
- `manual-sms-wallet.sql` is NOT applied
- `manual-opd-presence.sql` is NOT applied
- `manual-opd-chambers.sql` is NOT applied

**Performance** — [`audit/performance.md`](audit/performance.md)

- Statistics not timed on a real-sized practice

**Testing and verification** — [`audit/testing-and-verification.md`](audit/testing-and-verification.md)

- Print Queue — NOT run
- SMS / Payment — NOT run
- A flaky pair in `server/test/opd-queue.int-spec.ts`
- OPD presence — not run
- OPD presence — not exercised in a browser
- Records history sections — not run in a browser
- Multiple chambers — not run
- Patient photo / circled plus — not checked
- Drug history by generic — not checked by eye
- History in the sidebar — browser run in Chromium only
- Drug history table — run in a browser (Chromium only)
- Statistics — not run

**Build, deploy, dependencies** — [`audit/deploy-and-ops.md`](audit/deploy-and-ops.md)

- Not timed, and not known — check nginx gzip
- Next.js 14 → 15.5.24+, both apps
- Nest 10 → 12
- nodemailer 6.10.1 → 10.1.2+
- Non-breaking fixes, not applied

## Threads that a later thread seems to overtake

Found on 2026-11-15 by reading the text only — not checked against the code, and not closed. Read both before acting on either.

- **Restart API server** (the first audit's "0. Operational", [`audit/db-and-prisma.md`](audit/db-and-prisma.md)) — an early operational step that nothing later refers to.
- **Fix order (this pass)** ([`audit/general.md`](audit/general.md)) — its items 1 and 2 are marked done in the list above it.
- **Supervising doctor list** — "hardcoded mock" ([`audit/access-and-scoping.md`](audit/access-and-scoping.md)) — later threads describe supervising doctors as built ("A supervising doctor's unprinted visit", [`audit/editor-lifecycle.md`](audit/editor-lifecycle.md)).
- **A second "Save & print" stores a second prescription (2026-10-12)** ([`audit/rx-pad.md`](audit/rx-pad.md)) — largely answered by "A save whose answer was lost, pressed again, filed the visit twice" and "The 30-minute window is a choice, not the physician's", in the same file.
- **OPD token / IPD bed unique-index SQL not applied** ([`audit/db-and-prisma.md`](audit/db-and-prisma.md)) — changed by "`manual-opd-queue-date.sql` applied 29/10/2026" and "`manual-opd-chambers.sql` is NOT applied", in the same file.
- **Prescription draft now auto-saved server-side** — "one row per doctor" ([`audit/editor-lifecycle.md`](audit/editor-lifecycle.md)) — extended by "A supervising doctor's unprinted visit" (`SupervisedDraft`), in the same file.
- **Disease and surgical history read from the On-examination popup** ([`audit/records-page.md`](audit/records-page.md)) — overtaken by "History in the sidebar — what was built" ([`audit/visit-sheet.md`](audit/visit-sheet.md)), as that thread says itself.
- **Left open by the 2026-10-12 review** ([`audit/dialogs-and-focus.md`](audit/dialogs-and-focus.md)) — repeats the grouped-number defect of "A number typed with a comma is not plotted" ([`audit/health-trends.md`](audit/health-trends.md)).
- **"Send SMS to all patients" is built (01/11/2026)** and **SMS to every patient of a day / Print Queue** (both in [`audit/opd.md`](audit/opd.md)) — the same note, twice.
