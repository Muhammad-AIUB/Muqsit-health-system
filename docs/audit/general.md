# General — the first audit (July 2026) — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Fix order (this pass) — five-item list** — Order: HM drug selections, family tree, supervising doctor list (real add/edit/delete), Research Export (client-side CSV), investigation/report image persistence (VPS upload).

---

# The threads, in full

## FUNCTIONAL-AUDIT.md

Audit of what works, what doesn't persist, and what's a stub. Updated as items are fixed.

## Fix order (this pass)

1. Health-monitoring drug selections — persist on the patient.
2. Family tree — persist on the patient.
3. Supervising doctor list — real add/edit/delete on the patient.
4. Research Export — client-side CSV.
5. Investigation/report image persistence (VPS upload) — larger, separate.
