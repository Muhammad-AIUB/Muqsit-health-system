# Prescribing alerts, drug hypersensitivity, high-alert medication — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/rx-alerts.md`](../rules/rx-alerts.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **H/O drug hypersensitivity and High-Alert Medication (31/10/2026)** — Physician to confirm eight assumptions, e.g. whether the pharmacy copy should carry it (+7 more); integration spec not run, no browser pass, `manual-patient-drug-safety.sql` NOT applied.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **H/O drug hypersensitivity and High-Alert Medication (31/10/2026) — readings for the physician to confirm.** Built on the most conservative reading of the sheet; each of these is an assumption:
  1. The two questions are worded "Is the patient hypersensitive to this drug?" / "Is it a high-alert medication?" (the sheet: "Does he hypersensitive to this drug" / "Does it high alert medication").
  2. The printed/shown words: `Hypersensitive to NAPA(Paracetamol)` and `High-alert drug: NAPA(Paracetamol)` (the sheet wrote "high alert drug:"). The brand is in capitals up to its first digit (a typed strength keeps its letters); the generic is the catalogue's, and a medicine typed and not picked from the list is shown by its brand alone. The strength of the row picked is NOT stored — hypersensitivity is to the medicine.
  3. A medicine NOT in the catalogue may be added "as typed" (no generic). A medicine with neither question ticked is refused.
  4. On the printed sheet it stands in the clinical column right after Drug history's place, in a red box; it is NOT on the privacy (pharmacy) copy, which carries no clinical column. Should the pharmacy copy carry it?
  5. A supervising doctor may read and ADD; may change/remove only what their own practice added. The owner's practice may change any entry. An assistant needs the Drug history key (`rx.drugHistory`) to write, and sees the list without it.
  6. Removal (inside ✎ Edit only) has no "are you sure" question — the established ✕ + Undo pattern of the sidebar — and is soft on the server.
  7. It is not linked to the ℞ pad's prescribing alerts (a hypersensitive medicine put on the pad raises nothing). That link needs the physician's wording for the alert; `rxAlerts.ts` was not touched.
  8. Not on the IPD sheet; activity is logged to the acting practice's feed only (a supervising doctor's addition does not appear in the owner's feed).
  Not verified: the integration spec (`server/test/patient-drug-safety.int-spec.ts`) was written and typechecked but not run; no browser pass; `manual-patient-drug-safety.sql` is NOT applied — apply it before deploying, or the section says "could not be loaded" and Save & print asks before printing without it.
