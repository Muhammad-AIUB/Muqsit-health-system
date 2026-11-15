# Forms, typing, BAN / EN, number formats — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/forms-and-input.md`](../rules/forms-and-input.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **BAN / EN on a printed visit — decided in the physician's stead** — Physician to confirm: the switch leaves a printed, unchanged visit as printed; to print in the other language, press the switch before Save & print or change a line.

**Known limits and defects, recorded on purpose**

- **Shorthand does not work in BAN** — `bm`, `am`, `7d`, `c` are Bangla as typed; switch to EN to use it; digits unaffected (`101` → `১+০+১`).
- **A round trip writes the app's own English** — `2 weeks` → `২ সপ্তাহ` → `2 week`; the exact English spelling typed is not kept.
- **Only the physician's table is translated** — Anything else typed in the three cells is left as written; each phrase to add is the physician's wording, added to `lib/rxLanguage.ts` and its test.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### BAN writes the ℞ dose / food / duration in Bangla (2026-10-14)

- [ ] **Shorthand does not work in BAN** (`bm`, `am`, `7d`, `c`): the letters
  are Bangla as they are typed. Unchanged since 2026-09-23 — switch to EN to
  use it. Digits are unaffected (`101` still becomes `১+০+১`).
- [ ] **A round trip writes the app's own English**: `2 weeks` → `২ সপ্তাহ`
  → `2 week`, `before meal` → `খাবারের আগে` → `Before meal`. Same meaning;
  the exact English spelling typed is not kept.
- [ ] **Only the physician's table is translated.** Anything else typed in
  the three cells (`after food`, `2.5 ml`, `1m`) is left exactly as written,
  in either mode. Each phrase to add is the physician's wording, added to
  `lib/rxLanguage.ts` and its test.

### Nothing lost on a reload, nothing filed twice (19/10/2026)

- [ ] **BAN / EN on a printed visit — decided in the physician's stead, to confirm.** The switch sets the language for what is typed next and leaves a visit printed and unchanged as it was printed: rewritten, it went back to "Incomplete" (and a round trip does not come back word for word, `2 weeks` → `2 week`). To print it in the other language, press the switch before Save & print, or change a line.
