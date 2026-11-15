# Dates — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/dates.md`](../rules/dates.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **The date is shown dd/mm/yyyy** — `28/10/2026 by Dr. Shahariar`, the app's own format, not `28/10/26` as written on the sheet.
- **The entry's visit date** — The prescription header's date when it was added; the date typed in the box is part of the text (`DM 01/01/2010`).

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### On examination shared + Patient Records history sections (31/10/2026) - open for the physician

- [ ] **The date is shown dd/mm/yyyy** (`28/10/2026 by Dr. Shahariar`), the app's own format, not `28/10/26` as written on the sheet.

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

- [ ] **The entry's visit date** is the prescription header's date when it was added; the date typed in the box is part of the text (`DM 01/01/2010`), as in the popup.
