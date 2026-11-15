# Settings — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/settings.md`](../rules/settings.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **The profile's own "Chambers" list is separate** — Deleted and recreated on every profile save, so OPD could not point at it; two lists of chambers exist; merging them is a later decision.

**To do — engineering work that is known and not done**

- **Patient Settings → Data security level** — Disabled placeholder.

**Closed — kept as the record of what was done or decided**

- **Settings → Badges / Supervisors & role models** — Intentionally disabled ("Coming soon").

---

# The threads, in full

## 2. Stub buttons / placeholder views

- [ ] **Patient Settings → Data security level** — disabled placeholder.
- [x] **Settings → Badges / Supervisors & role models** — intentionally disabled ("Coming soon").

## Open threads — decisions owed, not bugs (2026-07-27)

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **The profile's own "Chambers" list (address + map link) is separate** and unchanged: it is deleted and recreated on every profile save, so OPD could not point at it. Two lists of chambers now exist; merging them is a later decision.
