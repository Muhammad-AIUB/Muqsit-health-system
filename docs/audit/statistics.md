# Settings → Statistics — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/statistics.md`](../rules/statistics.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Only patients put on the OPD queue are counted** — Physician's call whether to count prescriptions too; that would change every number.
- **By months shows one bar a month: the patients SEEN** — Month's total serial in its tooltip; bars dark green as "seen", not the picture's light blue (blue is for what can be pressed).
- **A patient on several chambers is counted in each chamber's list** — "All chamber total" adds the chambers: seen in Labaid and Ibn Sina on one day is two seen visits.
- **Disease statistics: `DM` and `Diabetes mellitus` are two lines** — Physician to say which names are one disease (a synonym list is clinical content); a line holding several (`DM, HTN`) is counted as one line.

**Closed — kept as the record of what was done or decided**

- **"Seen" = the OPD queue's Completed** — The physician confirmed "Completed = seen"; a patient marked Done who was never really seen counts.
- **Calendar averages (physician, 11/11/2026)** — Daily over every day since the first seen visit, monthly over every month incl. this one; a 3-days-a-week clinic reads at 3/7 (about 43%).
- **Disease counts are patients, not visits** — Physician's "joto patient"; printed prescriptions' Final diagnoses only; all chambers together; a supervising doctor's count for their own practice.
- **Assistants see the practice's numbers** — Physician's choice, 11/11/2026: no permission key guards the page.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Settings → Statistics (11/11/2026) - open for the physician

- [ ] **"Seen" = the OPD queue's Completed** (Done pressed, or the prescription printed). The sheet's line "Total serial theke completed subtract korlei seen patient number paoa jabe" was not clear to the builder; the physician confirmed "Completed = seen". A patient marked Done who was never really seen counts.
- [ ] **Only patients put on the OPD queue are counted** — Total serial, Total visit and every average come from the queue. A prescription written for a patient who was never queued is not a visit here. Counting prescriptions as well would change every number; the physician's call.
- [ ] **Calendar averages** (physician, 11/11/2026): Average daily = seen ÷ every day from the first seen visit to today, closed days included; Average monthly = seen ÷ every month from that visit's month to this one, **this month included though it is not over**. A clinic that sits three days a week reads at 3/7 (about 43%) of what its sitting days would show. The page says what each average is taken over.
- [ ] **By months shows one bar a month: the patients SEEN** (the sheet's picture had one bar). The month's total serial is in its tooltip. The bars are the same dark green as "seen" by days, not the picture's light blue (blue is for what can be pressed — root CLAUDE.md).
- [ ] **A patient on several chambers is counted in each chamber's list** — "All chamber total" adds the chambers, so a patient seen in both Labaid and Ibn Sina on one day is two seen visits.
- [ ] **Disease statistics: `DM` and `Diabetes mellitus` are two lines** (only capitals and spacing are set aside); so are `T2DM`, `DM type 2` and `Type 2 DM`. Which names are one disease is the physician's to say — a synonym list would be clinical content. Each stored Final-diagnosis LINE is one diagnosis: a line that holds several (`DM, HTN`) is counted as that one line, not split.
- [ ] **Disease counts are patients, not visits** (physician's "joto patient"): a patient seen five times with DM is 1. Final diagnoses are the saved (printed) prescriptions' only; an unprinted visit's diagnosis is not counted. All chambers together (a prescription holds no chamber); a supervising doctor's prescriptions count for their own practice, not the owner's.
- [ ] **Assistants see the practice's numbers** (physician's choice, 11/11/2026): no permission key guards the page.
