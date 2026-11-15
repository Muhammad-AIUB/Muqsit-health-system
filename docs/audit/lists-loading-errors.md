# Lists: loading, empty and error states — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/lists-loading-errors.md`](../rules/lists-loading-errors.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Closed — kept as the record of what was done or decided**

- **Offline / wrong answer / failed refresh as "No medicines yet" — fixed** — These, warnings switched off on failed generic lookup, duplicate on spacing, uncounted unreadable medicine, blue result line, held-Enter reopen: all fixed and pinned.
- **The quiet retry had been taken from every answer below 500** — Never released; retry restored; only a 403 is shown as written and not asked for again.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

- [x] Offline, an answer that was not the list, and a failed refresh were each
  drawn as "No medicines yet"; a failed generic lookup returned the list with
  its warnings switched off; the same medicine written with another space was
  added twice; a medicine the server could not read was left out uncounted; the
  line beside the + was in the brand's blue; Enter held on Add reopened the
  box. All fixed and pinned (`client/CLAUDE.md`, `server/CLAUDE.md`). The
  second review of those fixes found two states more — a list whose every row
  was unreadable drawn as "No medicines yet" under its own notice, and Add
  still acting on the ticks while the list was being asked for again or had
  failed — and both are closed.

- [x] **The quiet retry had been taken from every answer below 500** — for one
  round of this work, never released — and the framework's words shown for
  them ("Unauthorized", "Cannot GET /api/…"). A 401 is what the page gets
  when its session could not be renewed just then, and the retry is what gets
  the list. Only a 403 — the one refusal worded for a person — is shown as
  written and not asked for again.
