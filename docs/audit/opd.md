# OPD queue, chambers, print queue — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/opd.md`](../rules/opd.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Pre-set schedule is the sheet's own example** — Physician's to change: 18:00, no break, 10 minutes for a doctor who never saved one.
- **What the Print Queue sheet prints, to be confirmed** — Physician to confirm columns Serial, Name, Gender, Age (`34y`), Mobile, Appointment time under a header; no token, no marks, no status.
- **A day that has passed can be printed** — The Print Queue button is not locked with the day.
- **The doctor named is the workstation's doctor** — `activeWorkstation.name`; with no workstation chosen the sheet has no name line.
- **Times are the SAVED schedule's** — As on the screen; where the screen shows none (a past day never given a schedule) the sheet shows a dash.
- **Which word heads the column: "Gender" or "Sex"?** — Physician to say which word the printed column should use; sheet says "Gender", `client/CLAUDE.md` says "Sex" on every screen.
- **Which editor fields make "History taken"** — Physician to confirm the list: every text field except medicines and investigations, in `HISTORY_FIELDS` in `server/src/opd/pad-stage.ts`.
- **The "Completed" card changed meaning** — Now counts Done OR a printed prescription; "Waiting" means present and not completed; both follow the status column, to be confirmed.
- **A printed visit stays status "waiting"** — Physician to confirm: its row is not dimmed like a Done one although the card counts it as Completed.
- **An Urgent mark keeps the row red after the visit is Completed** — Physician to say whether a completed visit should fade; left as built (strongest mark wins the colour).
- **The visit-type pill "Urgent" can appear beside the new Urgent box** — Physician to say whether the old `type` value "Urgent" should go or be renamed.
- **Reception no longer sees a token on screen** — Physician to confirm nothing depends on reading the token aloud; T-01 still stored, only the serial number is shown.
- **The first chamber is called "Main chamber"** — Takes the address of the profile's first chamber, once; the physician may rename it (e.g. "Labaid").
- **The choice of chamber is per user, per practice, per device** — Not mirrored, not stored on the server; a reception PC and the doctor's laptop can be in different chambers.
- **The Print Queue sheet does not name the chamber** — Adding the chamber's name or address to the printed queue is the physician's call.

**Known limits and defects, recorded on purpose**

- **A patient cannot be taken OFF a later day's list, or moved** — Only added and put in order, as the sheet asked; a mistaken booking stays on that day.
- **A past day's "Not marked seen"** — Shown for a patient queued and never marked Done; nothing was recorded for them beyond that.
- **A Done visit shows "Completed" and the "done" pill** — The same thing twice. Left as is.
- **Save & print marks the visit in the chamber chosen at the time** — A patient queued in Labaid and printed while "My Chamber" says Ibn Sina gets a new row in Ibn Sina's list.
- **A visit cannot be moved from one chamber to another** — Stated as built.

**Closed — kept as the record of what was done or decided**

- **OPD queue by day — built** — Date is a calendar; later-day booking; serial order; past days locked (server refuses too); per-day schedule; times from the SAVED schedule.
- **"Send SMS to all patients" is built (01/11/2026)** — See "SMS to a day's queue, and Settings → Payment"; "Print Queue" built 30/10/2026.
- **Print Queue — built** — Button beside the date opens a sheet of the day (`client/src/lib/opdQueueDoc.ts`, `PrintSheetModal`); off while loading or the day is empty.
- **The preview is a snapshot taken at the press** — An open sheet is not rebuilt; button off while schedule or queue failed to load.
- **SMS to every patient of a day / Print Queue** — SMS built 01/11/2026; Print Queue built.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### OPD queue by day (28/10/2026) — what is built, and what is not

- [x] **The date is a calendar; a patient can be booked for a later day; serials can be put in order; a day that has passed is locked** (the server refuses it as well). Each day has its own schedule — start, break, minutes per patient — and the serial's time is worked out from the SAVED one (`docs/DOMAIN.md`, "OPD queue by day").

- [x] **"Send SMS to all patients" is built (01/11/2026)** — see "SMS to a day's queue, and Settings → Payment" below. ("Print Queue" is built, 30/10/2026: see its block below.)
- [ ] **Pre-set schedule is the sheet's own example** (18:00, no break, 10 minutes) for a doctor who never saved one — the physician's to change.
- [ ] **A patient cannot be taken OFF a later day's list, or moved to another day.** Only added and put in order, as the sheet asked. A mistaken booking stays on that day.
- [ ] **A past day's "Not marked seen"** is shown for a patient who was queued and never marked Done; nothing was ever recorded for them beyond that.

### OPD queue: Print Queue (30/10/2026) - open for the physician

- [x] **Built:** a "Print Queue" button beside the date opens a sheet of the day on show (`client/src/lib/opdQueueDoc.ts`, shown in `PrintSheetModal`). It is off while the queue or the day's schedule is loading, and while the day holds no one.
- [ ] **What the sheet prints, to be confirmed:** under a header with the practice doctor's name, the day and the patient count, one row per patient: Serial, Name, Gender, Age (as `34y`), Mobile, Appointment time. It prints no token, no marks (present, critically ill, urgent) and no status.
- [ ] **A day that has passed can be printed** (the button is not locked with the day).
- [ ] **The doctor named is the workstation's doctor** (`activeWorkstation.name`); with no workstation chosen the sheet has no name line.
- [ ] **Times are the SAVED schedule's,** as on the screen; where the screen shows none (a past day never given a schedule) the sheet shows a dash.
- [x] **The preview is a snapshot taken at the press.** The queue refreshes every few seconds, but an open sheet is not rebuilt: it shows the rows, times and doctor as they were when Print Queue was pressed. Close it and press again to see newer rows. The button is also off while the day's schedule or the queue failed to load (a failed refresh with old rows held would otherwise print them without a notice).
- [ ] **Which word heads the column: "Gender" or "Sex"?** The column is headed "Gender" as on the physician's sheet, while `client/CLAUDE.md` says the field is "Sex" on every screen. The physician to say which word the printed column should use.

### OPD queue: presence, urgency and status (29/10/2026) - open for the physician

- [ ] **Which editor fields make "History taken".** Built as every text field of the editor except medicines and investigations (physician: "Chief complaints or any data entry"), in ONE constant, `HISTORY_FIELDS` in `server/src/opd/pad-stage.ts` (`PENDING_FIELDS` is `investigation`; a medicine on the pad also makes "Prescription pending"). The physician to confirm the list.
- [ ] **The "Completed" card changed meaning.** It counted visits marked Done; it now counts Done OR a printed prescription. "Waiting" now means present and not completed (it counted visits whose status was waiting). Both follow the status column, to be confirmed.
- [ ] **A Done visit shows "Completed" and the "done" pill** - the same thing twice. Left as is.
- [x] **SMS to every patient of a day** is built (01/11/2026, block below). Print Queue is built (block below).

- [ ] **A printed visit stays status "waiting"** (Save & print marks the prescription complete and leaves the visit waiting), so its row is not dimmed like a Done one although the card counts it as Completed. For the physician to confirm.
- [ ] **An Urgent mark keeps the row red at full strength after the visit is Completed.** Left as built (the strongest mark wins the colour); the physician to say whether a completed visit should fade.
- [ ] **The visit-type pill "Urgent" (an old `type` value) can appear beside the new Urgent box** on a row: two different things with one word. The physician to say whether the old type should go or be renamed.
- [ ] **Reception no longer sees a token on screen.** T-01 is still stored (and the per-day unique index still holds), but the token chip is gone from the row and the token is shown nowhere in the doctor app; the serial number is what is shown. The physician to confirm nothing depends on reading the token aloud.

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **The first chamber is called "Main chamber"** and takes the address of the profile's first chamber, once. The physician may rename it (e.g. "Labaid").

- [ ] **The choice of chamber is per user, per practice, per device** (not mirrored to the doctor's other devices, not stored on the server). A reception PC and the doctor's laptop can be in different chambers.
- [ ] **The Print Queue sheet does not name the chamber** (it names the doctor). Adding the chamber's name or address to the printed queue is the physician's call.
- [ ] **Save & print marks the visit in the chamber chosen at the time.** A patient queued in Labaid and printed while "My Chamber" says Ibn Sina gets a new row in Ibn Sina's list.

- [ ] **A visit cannot be moved from one chamber to another.**
