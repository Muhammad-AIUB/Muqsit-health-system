# Uploads — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/uploads.md`](../rules/uploads.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**Open — a decision or a confirmation is owed**

- **The public upload route can fill the disk** — Product decision: bound it by a quota, a cap per address, or authentication once an account exists (100 requests a minute per address × 8 MB, kept for ever).

**To do — engineering work that is known and not done**

- **Investigation / report images (base64 `invImages` pool)** — Findings text persists; uploaded images are session-only. Bigger fix: upload to the VPS `/uploads`, store URLs.

**Closed — kept as the record of what was done or decided**

- **multer 2.4 under Nest 10 (`overrides`)** — For eight DoS advisories on the public upload route; route takes one file and no text field; malformed request gets a 4xx, not a 500.

---

# The threads, in full

## 1. Not persisted (in-memory only — "save & reload = gone")

- [ ] **Investigation / report images** (base64 `invImages` pool) — findings *text* persists; uploaded **images**
      are session-only. (Bigger fix: upload to the VPS `/uploads`, store URLs.)

## Open threads — decisions owed, not bugs (2026-07-27)

### Dependency advisories and the deploy script (2026-10-16)

- **multer 2.4 under Nest 10** (`overrides`), for the eight DoS advisories on the public upload route. The route now takes one file and no text field, and a malformed request gets a 4xx, not a 500.

- [ ] **The public upload route can fill the disk:** 100 requests a minute per address × 8 MB, and every accepted image is kept for ever. Bounding it — a quota, a cap per address, or authentication once an account exists — is a product decision.
