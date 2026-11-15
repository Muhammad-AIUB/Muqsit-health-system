# Clinical calculators — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/calculators.md`](../rules/calculators.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **RPI maturation bands** — Set to the standard published table (36-45 → 1.0 … ≤15 → 2.5); if the practice follows a different source, change it there and say which.

**Closed — kept as the record of what was done or decided**

- **Calculator results followed the browser's language — fixed 2026-10-12** — Five calculators now name the locale (`grouped()` in `client/src/lib/calculators/format.ts`); another grouping, if wanted, is one line in that file.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **RPI maturation bands** (`lib/calculators/corrected-reticulocyte.ts`) are
  set to the standard published table (36-45 → 1.0, 26-35 → 1.5, 16-25 → 2.0,
  ≤15 → 2.5) after two earlier versions disagreed with it. The table is written
  into the comment. If the practice follows a different source, change it there
  and say which — do not re-band from memory.

- [x] **Calculator results followed the browser's language — fixed 2026-10-12.**
  Five calculators wrote a result with `toLocaleString()` and no locale:
  `ANC 1,500 cells/µL` in an English browser was `1.500` in a German one (one
  and a half, to an English reader) and `১,৫০০` in a Bangla one. They name the
  locale now (`grouped()` in `client/src/lib/calculators/format.ts`), so every
  browser shows what a US-English one always has. No format was chosen — the
  text the results were written, checked and used with is simply the only
  one left. For a browser set to US, UK or Australian English nothing
  changed. One set to Indian English grouped 100,000 and over the lakh way
  (`1,50,000`) and now writes `150,000`; of the five calculators only a very
  high ANC reaches that. This was about the record too: "Add result" files
  the calculator's sentence as the finding, and it prints. If the physician
  ever wants another grouping (`1500`, or lakh-style `1,50,000` for the large
  counts), it is one line in that file.
