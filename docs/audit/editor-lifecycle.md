# Editor lifecycle: drafts, reload, visit state, device mirror — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/editor-lifecycle.md`](../rules/editor-lifecycle.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Save to complete later still refuses while a line is held** — Product decision: let it park the visit with the red line in it (still refused at Save & print when resumed).

**Known limits and defects, recorded on purpose**

- **A printed visit whose saved special advice changes before a reload** — The ••• advice mirror re-writing Advice reads as changed after printing and is parked again; rare; a real change to what would print.
- **A visit parked before this release may carry popup Disease/Surgical Hx** — On such a visit a preview after print shows it twice; removing it in the sidebar before re-printing would let the print put it back.
- **A reload within a second of a Save can show the OLD line too** — The draft's merge cannot tell a REPLACED line from one added elsewhere; not closed: a tombstone needs a place on the record.

**Closed — kept as the record of what was done or decided**

- **Prescription draft now auto-saved server-side** — The whole editor is debounced-saved to `PrescriptionDraft` (one row per doctor) and re-hydrated on reload; Save & print still creates the permanent prescription record.
- **A patient switch does not lose a held line — closed 19/10/2026** — Parked with the visit, also for a supervised patient (`SupervisedDraft`) and for a printed visit changed since.
- **A late reload draft replaced a mirrored device's patient — 20/10/2026** — Every applied mirror snapshot now moves `editorEpochRef`; not run in a browser.
- **The refusal was one device's — closed 19/10/2026** — The held line is mirrored; a device still on an older build neither shows it nor refuses, and can Save & print what it shows.
- **A supervising doctor's unprinted visit** — Parked as `SupervisedDraft` (`PUT /patients/:id/supervised-draft`); `server/prisma/manual-supervised-draft.sql` must be applied before the release that carries it is deployed.
- **A visit printed and then reloaded read as unprinted** — The printed mark rides the draft.
- **A change made after Save & print** — It is unprinted work again: parked, "Incomplete" in OPD until printed.
- **"Printed" was a one-way latch — closed in review, before release** — A visit is printed while what it says is what was SENT; put back, it is printed again.
- **What was sent was kept as the visit's TEXT — closed in review** — Now a short fingerprint for the visit's own patient, cleared with the editor.
- **Closed in review, before release (review of dfdd1c4)** — Whole-list write, earlier-day print opened as printed, BAN rewrite, repeated audit lines, "+ Add" box across mirror, last 1.2 s of edits dropped: closed.

---

# The threads, in full

## 3. By design (not a bug)

- ~~Prescription draft saves only on **Save & print**~~ — **now auto-saved server-side.** The whole editor
  (header + clinical sections + investigation findings + medicines + advice) is debounced-saved to
  `PrescriptionDraft` (one row per doctor) and re-hydrated on reload, so a refresh no longer loses work.
  Save & print still creates the permanent prescription record.

## Open threads — decisions owed, not bugs (2026-07-27)

### A `>>>` dose under the wrong medicine — closed at the source (18/10/2026)

- [x] **A patient switch does not lose a held line — closed 19/10/2026.** It is parked with the visit like everything else not yet printed — since that day also for a supervised patient (the supervising practice's own parked visit, `SupervisedDraft`) and for a printed visit changed since (a change after Save & print is unprinted work again) — so there is nothing to ask. The physician: "If every saved data is gone after reloads that is not perfect for this app … for rest of the things please do what is the best".

- [x] **Found in the review, older than this change: a draft that arrived late on a reload replaced a patient a mirrored device had just brought — closed 20/10/2026.** `applyMirrorSnapshot` moved the editor's epoch STATE on, but not the ref the reload's draft checks before it is applied (`editorEpochRef`, MuqsitContext), so the late draft was not taken for stale. Reproduced with the real store, a second store's mirror snapshot applied while the first one's draft was on its way: the editor went to the draft's patient with the other patient's Investigation box still open and their half-typed result in it, that patient's held ℞ lines were gone, and the stale draft was written back from this device (its patient's `incompleteRx`, "Incomplete" in OPD). Every applied snapshot now moves the ref — another patient, the same one, or none — and what arrives in that moment is not written from this device until something is done on it, as afterwards. Not run in a browser (`client/CLAUDE.md`, Editor lifecycle).
- [ ] **Save to complete later still refuses while a line is held**, as Save & print does, though the parked visit would now carry the line. Letting it park the visit with the red line in it (still refused at Save & print when resumed) is a product decision.

- [x] **The refusal was one device's — closed 19/10/2026 for devices on this build.** The held line is mirrored: a second device shows it and refuses as the first does. A device still on an older build (a tab not reloaded since the release) neither shows it nor refuses, and can Save & print what it shows.

### Nothing lost on a reload, nothing filed twice (19/10/2026)

The physician, on being told what a reload or another patient opened could still lose: "If every saved data is gone after reloads that is not perfect for this app … for rest of the things please do what is the best". Closed:
- [x] **A supervising doctor's unprinted visit** lived only in their one-slot editor draft: a reload threw it away on purpose, another patient overwrote it, the next sign-in cleared it. It is parked in a place of the supervising practice's own (`SupervisedDraft`, `PUT /patients/:id/supervised-draft`), returned to that practice as `incompleteRx` — never the owner's. **`server/prisma/manual-supervised-draft.sql` must be applied before the release that carries it is deployed.**
- [x] **A visit printed and then reloaded read as unprinted** — parked again and put back to "Incomplete" in OPD, ready to be filed a second time. The printed mark rides the draft.
- [x] **A change made after Save & print** was kept nowhere but the editor draft; another patient opened lost it. It is unprinted work again: parked, "Incomplete" in OPD until printed.

Open:

- [x] **"Printed" was a one-way latch — closed in review, before release.** An IPD admission's findings on loan, the records' "+ Add" box, or a letter typed and deleted dropped the mark for good. A visit is printed while what it says is what was SENT; put back, it is printed again.
- [x] **What was sent was kept as the visit's TEXT — closed in review, before release.** It rode the draft, the parked copy and the device mirror, and only opening a patient cleared it: a fresh visit parked the printed patient's diagnosis and medicines in the next patient's record. It is a short fingerprint now, for the visit's own patient, cleared with the editor.

- [x] **Closed in review, before release (review of dfdd1c4):** "+ Add medicine" after printing wrote the editor's whole list (an unprinted ℞ change went to the record, a printed line taken off the pad was erased from it); a parked copy from an earlier day's print opened as printed; passing through a printed visit's cells in BAN rewrote them; a repeat after a reload wrote its audit lines again; the records' "+ Add" box survived another patient arriving through the device mirror; "+ New patient" and a walk-in's Prescribe dropped the last 1.2 s of the last patient's edits.
- [ ] **A printed visit whose saved special advice changes before a reload** (the ••• advice mirror re-writing Advice) reads as changed after printing, and is parked again until it is printed or the advice is put back. Rare; it is a real change to what would print.

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

- [ ] **A visit parked before this release** may carry Disease / Surgical history typed in the popup: the popup shows it read-only and it is saved and printed under On examination as before; after Save & print it also appears in the sidebar. On such a visit only, a preview made after that print shows it twice (once under each heading), and removing it in the sidebar before that visit is printed again would let the print put it back.

### Drug history table, Edit and Add on the records page (07/11/2026) - open for the physician

- [ ] **A page reloaded within about a second of a Save can show the OLD line beside the corrected one.** The editor's own draft of the visit holds a copy of the drug history and is rewritten ~1.2 s after the list changes; the app's merge on opening keeps whatever the draft holds that the record does not, and cannot tell a line that was REPLACED from one added elsewhere (the older known limit of the merge, `client/CLAUDE.md`). Found in the browser: a reload right after Save showed both Denvar lines, and the chart ran to the old End. The journey now waits for the draft write before it reloads. The same copy can come back from another device that still has the patient open with the old list (its draft or the device mirror). Not closed: a tombstone for a replaced line needs a place on the record to live.
