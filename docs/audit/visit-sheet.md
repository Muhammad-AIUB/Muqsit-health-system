# The visit sheet and the app shell — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/visit-sheet.md`](../rules/visit-sheet.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **Physician's sheet of 31/10/2026 (UI items) — readings to confirm** — Physician to confirm five readings: "Sob jaigai edit" as every OPD prescription list, deeper colours, Advice built-in list removed, ↺ replaced by plus icon, ••• box as "copy into this one".
- **Entries are written at Add, not at Save & print** — A visit closed without printing still keeps them for the patient.
- **Order: the order first written (oldest first)** — As the popup listed them; the records page keeps newest first; the same words at two visits are one entry.

**Known limits and defects, recorded on purpose**

- **A removed entry is shown nowhere** — It stays in the record (`removedAt`, `removedBy`); there is no screen yet to see removed entries.
- **Half-typed text in the history boxes is not asked about** — Dropped with the patient at Save & print or patient switch, like other sidebar boxes; press Add to keep it.
- **Another device's history additions** — Reach this screen when the patient is opened again; on paper at Save & print / Preview (list read again then).

**Closed — kept as the record of what was done or decided**

- **History in the sidebar — what was built** — Patient's Disease and Surgical / intervention history lists, written at Add, stored in `Patient.onExaminationSummary`; ⊘ Hide, × with Undo; no schema change; popup boxes gone.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **Physician's sheet of 31/10/2026 (UI items) — readings to confirm.**
  (1) "Sob jaigai edit" was read as every list of the OPD PRESCRIPTION (History,
  Associated illness and Advice joined the in-place edit); the IPD sheet's lists
  keep their popup. In the popups, the chips' × waits for "✎ Edit" on the ADDED
  heading; a ticked quick-pick box (Associated illness BA/COPD/…) is still
  unticked directly. (2) Deeper OPD colours = the palette's 100 shade + a 400 bar
  on the left. (3) Only Advice's built-in list was removed; Chief complaints,
  History, Provisional diagnosis, Associated illness and Final diagnosis keep
  theirs (held to 10 places; the doctor's own lines are never cut). Bounds kept
  only as runaway guards: 1000 learned advice lines per lookup, 1000 recents per
  field (was 12). Lines that had already dropped out of the old 12-slot recents
  list cannot be brought back; Note, Plan, Provisional diagnosis and Associated
  illness have no learned-from-prescriptions source (only Advice and ℞ notes do)
  — adding one is a server change, not done. (4) Only the "recently typed" ↺ was
  replaced by a plus icon; ↺ Undo, ↺/↻ rotate and the pad's ↺ "restore this
  suggestion" were left (they are not "reuse"). ★ stays. (5) The ••• box offers
  lines saved for other medicines/diagnoses and opens a line for editing when
  its words are pressed — read as "copy into this one", never "move" or "edit
  the other entry".

### History in the sidebar: the patient's Disease / Surgical history (02/11/2026) - open for the physician

Physician's sheet 28/10/2026, item 7 ("On examination er aituk prescription er history te nia jao purota, same format a … Keu likhle porer bar o 'my personal note' er moto oi patient er khetre sob somoi thakbe … Aita ai patient er sob dr. Aita medication list (drug history) er moto print korar age hide kora jabe"). The release of 31/10/2026 read this item as the "by Dr." card of On examination; that card belongs to the sheet of 31/10 (item 3) and stays. This is the item as written.

**What the sidebar's "History" was before (investigated):** a per-VISIT list of free lines (`history` in `MuqsitContext`, an `ExpandableField` with the suggestion list), saved on each prescription (`Prescription.history`), carried by the draft / `incompleteRx` / the device mirror, emptied by `resetEditor` for a new visit, and printed under "History". Nothing of it was kept for the patient. **It is unchanged:** old prescriptions keep their History lines, and the field works as before.

**What was built:** under the visit's History lines, the patient's two lists — Disease history and Surgical / intervention history — in the On-examination popup's format (text box with the popup's placeholder, Date box DDMMYY, Add; entries listed). Kept for the patient (written to the server at Add), seen by every doctor who reaches the patient, ⊘ Hide on the row, × with a question and Undo (soft). Stored as `Disease Hx:` / `Surgical Hx:` entries of the shared On-examination history (`Patient.onExaminationSummary`), so every entry typed in the popup since 18/10/2026 shows in the sidebar, nothing is stored twice, and no schema change or SQL was needed. The popup's boxes are gone.

- [ ] **Entries are written at Add, not at Save & print.** A visit closed without printing still keeps them for the patient.
- [ ] **Order:** the order first written (oldest first), as the popup listed them; the records page keeps newest first. The same words written at two visits are one entry.

- [ ] **A removed entry is shown nowhere** — not in the sidebar, the records page's Disease and surgical history, nor the On-examination card of the visit it was written at. It stays in the record (`removedAt`, `removedBy`); there is no screen yet to see removed entries.

- [ ] **Half-typed text in the boxes is not asked about** at Save & print or when another patient is opened — it is dropped with the patient, like the other sidebar boxes. Press Add to keep it.
- [ ] **Another device's additions** reach this screen when the patient is opened again, and are on the paper at Save & print / Preview (the list is read again then).
