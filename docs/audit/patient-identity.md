# Patient identity — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/patient-identity.md`](../rules/patient-identity.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **While a patient is being opened, the previous one is still on screen** — Physician to say: should it go blank at once instead? (name and photo shown together until the record arrives).

**Known limits and defects, recorded on purpose**

- **A new patient created from the "Add New" box whose answer was lost** — Pressed again, it is a second patient on the number — not covered by the repeat rule.
- **A new patient from a cleared screen got the LAST patient's photo** — Before this release; such records cannot be told apart from the server; a wrong photo is removed in Patient Settings.

**Closed — kept as the record of what was done or decided**

- **Family tree (`familyMembers`)** — Now saved to `Patient.familyMembers` (JSONB) and loaded on patient open.

---

# The threads, in full

## 1. Not persisted (in-memory only — "save & reload = gone")

- [x] **Family tree** (`familyMembers`) — now saved to `Patient.familyMembers` (JSONB). Loaded on patient open.

## Open threads — decisions owed, not bugs (2026-07-27)

### Nothing lost on a reload, nothing filed twice (19/10/2026)

- [ ] **A new patient created from the "Add New" box whose answer was lost**, pressed again, is a second patient on the number — not covered by the above.

### Patient photo and the circled plus (02/11/2026) - open for the physician

- [ ] **A new patient saved from a cleared screen was created with the LAST patient's photo and watch flag** (before this release). Records made that way cannot be told apart from the server; a photo that is not the patient's is removed in Patient Settings.
- [ ] **While a patient is being opened, the previous patient is still on the screen** (name and photo together) until the record arrives — the screen does not show a half-loaded mix. Should it go blank at once instead?
