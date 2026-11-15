# Clinical calculators

> **Read this before changing the code it covers.** Named in these rules: `calculator-registry.ts`, `src/lib/calculators/`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Calculators: never alter a formula, cutoff, unit or interpretation without the published source; keep severity labels consistent with it; register new ones in `calculator-registry.ts`.

---

# The rules, in full

## ⚕️ Clinical-accuracy rules specific to the client

_From `client/CLAUDE.md`._

- **Calculators (`src/lib/calculators/`, ~77 of them, wired via `calculator-registry.ts`):** each implements a published clinical score/formula. Never alter a formula, cutoff, unit, or interpretation without the published source; keep severity labels (`success/warning/danger`) consistent with the source. New calculators register in the registry and appear in Investigation "Special Scores".
