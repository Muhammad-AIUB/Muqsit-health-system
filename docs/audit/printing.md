# Printing — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/printing.md`](../rules/printing.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **⊘ Hide for On examination starts OFF** — Physician to say if On examination should also start hidden (Drug history's starts ON).
- **Should the PRINTED Drug history block also show generics?** — Physician to decide; not changed: the printed sheet and the Records Download still print each entry as stored (the brand line).
- **⊘ Hide for History starts OFF** — Physician to say if History should start hidden (Drug history's starts ON).
- **⊘ Hide takes the WHOLE History section off the sheet** — The visit's own History lines too, not only the patient's lists (all or nothing).
- **The patient's history now prints at EVERY visit** — Unless hidden, under History as `Disease Hx: …` / `Surgical Hx: …`; a sheet may be longer than before.
- **The printed prescription is not a record of its printed history** — The patient's Disease / Surgical history is read from the patient at print time; the saved prescription keeps only this visit's History lines.

**Known limits and defects, recorded on purpose**

- **While a chamber's print settings load or fail, the general ones print** — Stated as built.
- **A second printed page carries no patient name** — The header and patient block print once; a loose page 2 is unidentified. Not changed; a decision for the physician.
- **On a very narrow page a long clinical heading breaks mid-word** — "CHIEF COMPLAINT / S" under about 5 in printable width; the fill bound never goes below 1.
- **The patient block's wrapped value returns under its label** — A long name or address wraps flush left, not hung under its value. Not changed.

**Closed — kept as the record of what was done or decided**

- **The print preview's grey surround** — Comes from `prescriptionDoc.ts` (untouched by rule); at night the preview is a bright page in a dark app; accepted: it is the paper.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Night mode — ☀ / ☾ (2026-10-15)

- [ ] **The print preview's grey surround** comes from the print document's own HTML (`prescriptionDoc.ts`, untouched by rule). At night the preview is a bright page in a dark app. That is accepted: it is the paper.

### On examination shared + Patient Records history sections (31/10/2026) - open for the physician

- [ ] **⊘ Hide for On examination starts OFF** (the section prints, as before). Drug history's starts ON. The physician to say if On examination should also start hidden.

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **While a chamber's own print settings are loading (or failed to load), the general settings print.**

### Drug history shown by its generic names (02/11/2026) - open for the physician

- [ ] **Should the PRINTED prescription's Drug history block also show generics?** Not changed: the printed sheet is a legal document and still prints each entry as stored (the brand line). The Records page's Download prints them as stored too.

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

- [ ] **⊘ Hide for History starts OFF** — History has always printed, so a new visit prints it as before (the visit's lines, and now the patient's Disease / Surgical history under them). Drug history's starts ON. The physician to say if History should start hidden.
- [ ] **⊘ Hide takes the WHOLE History section off the sheet** — the visit's own History lines too, not only the patient's lists (like Drug history: all or nothing).
- [ ] **The patient's history now prints at EVERY visit** (unless hidden) under History, as `Disease Hx: …` / `Surgical Hx: …` — the words On examination printed. Before, an entry printed only on the visit it was typed at, under On examination. A sheet may be longer than before.

- [ ] **The printed prescription is not a record of the history printed with it.** The saved prescription keeps this visit's History lines; the patient's Disease / Surgical history is read from the patient at print time (as the drug hypersensitivity list is). Before, the lines were saved in the prescription's On examination.

### A long ℞ line, and a sheet of more than one page (2026-11-15) - known limits, left on purpose

The fix itself is in [`rules/printing.md`](../rules/printing.md) ("A long ℞ line wraps cleanly…"). Three things were seen while checking it in Chromium's PDF and were not changed:

- [ ] **A second printed page carries no patient name.** The header and the patient block (name, age, date, mobile) print once, at the top of page 1; a ℞ that runs onto page 2 prints the rest of the medicines, the advice and the signature with nothing to say whose they are. Repeating the block under every page (in the table head, like the foot) is possible but it spends height on every page and the doctor's own Header Section is part of it — the physician's call, not made here.
- [ ] **On a very narrow page a long clinical heading breaks mid-word.** At about 3.5 in printable width, "CHIEF COMPLAINTS" prints "CHIEF COMPLAINT / S" and "INVESTIGATION" prints "INVESTIGAT / ION". The fill factor cannot go below 1 (`wordHeadroom`), the physician's type floors stay, and the clinical column is a fixed share of the page, so a word wider than the column breaks. A5 and larger are not affected.
- [ ] **The patient block's wrapped value returns under its label.** A long name or address wraps to the left edge ("Name: Mohammad Abdur Rahman / Chowdhury"), not hung under its value. Cosmetic; a hanging layout needs the fill bound (`headLeftAvail` / `headRightAvail`) to subtract each label's width.
**Not run for this change** (a note, not a thread): the browser suite (`e2e/`; Docker was not running), a real printer or print dialog, and any browser but Chromium. The signature-repeats-under-every-page behaviour in particular is Chromium's own limit.
