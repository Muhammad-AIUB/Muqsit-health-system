# Admin console

> **Read this before changing the code it covers.** Named in these rules: `admin.service.ts#hardDelete`, `accessibleWhere()`, `Patient.doctorId`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Deleting a doctor must not delete their patients: `hardDelete` relies on `onDelete: SetNull`; orphans are unreachable; findability needs its own access design, never bolted onto a delete path.

---

# The rules, in full

## ⚠️ Rule 2 — the patient access model (do not widen casually)

_From `server/CLAUDE.md`._

**Deleting a doctor must not delete their patients.** A patient is not the property of the account that registered them: the same person returns to a different doctor and is found again by mobile. `admin.service.ts#hardDelete` therefore does a plain user delete and lets `Patient.doctorId`'s `onDelete: SetNull` keep the row, its demographics and its durable history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `familyMembers`). That doctor's own `Prescription` rows still cascade, which is consistent — they were never visible to another doctor. **Known gap:** `accessibleWhere()` matches `{ doctorId }` OR an assigned supervisor, so a patient left with `doctorId = null` is retained but **not reachable** through the mobile lookup. Making unowned patients findable exposes PII across practices and needs its own access design — do not bolt it onto a delete path.
