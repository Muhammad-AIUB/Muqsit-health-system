# IPD — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/ipd.md`](../rules/ipd.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Known limits and defects, recorded on purpose**

- **An old IPD admission with such a line refuses "Save follow up"** — Vitals cannot be saved until the Prescription line is put right, also where the pane is not shown; the physician should know before a ward round meets it.
- **A stored IPD save whose answer was lost is said "not saved"** — Pressing Save again writes the same sheet once (no doubling); follow-up carries the second press's time; `sendAgain.ts` re-send not used here.
- **A 404 gets "try again in a moment"** — When the admission or its ward is no longer reachable from this practice, the message will not help.
- **Two lines on the ward screens still show the server's own words** — The ward note beside Send ("Not sent: " and the message) and the admit form's error.

**Closed — kept as the record of what was done or decided**

- **A failed IPD save was "Save failed", with no reason, for 2.5 s** — Now a box in the doctor's words; vitals stay in their boxes until the server has them; "Saved!" in green.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### A `>>>` dose under the wrong medicine — closed at the source (18/10/2026)

- [ ] **An IPD admission saved before the fix with such a line refuses "Save follow up"** (the vitals) until the Prescription line is put right — also in a view where the Prescription pane is not shown. The physician should know before a ward round meets it.

### What the IPD sheet's Save says (20/10/2026)

- [x] **A failed save was "Save failed", with no reason, for 2.5 s, and the typed vitals were already in the follow-up log, looking recorded.** Now a box in the doctor's words ("The changes to this admission were not saved."), the vitals stay in their boxes until the server has them, and the line says only "Saved!", in green (`client/CLAUDE.md`, "The IPD sheet's two Saves").
- [ ] **A save the server stored whose answer was lost is said "not saved".** Pressing Save again writes the same sheet once — the whole `clinical` is replaced — so nothing is doubled; the follow-up carries the time of the second press. The quiet re-send Save & print now has (`sendAgain.ts`) is not used here.
- [ ] **A 404** (the admission, or the ward chosen for it, no longer reachable from this practice) **gets "try again in a moment"**, which will not help.
- [ ] **Two lines on the ward screens still show the server's own words:** the ward note beside Send ("Not sent: " and the message) and the admit form's error.
