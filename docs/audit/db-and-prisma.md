# Database, manual SQL and Prisma — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/db-and-prisma.md`](../rules/db-and-prisma.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Restart API server** — Stop the API, run `npx prisma generate` in `server/`, then `npm run dev`, so new columns (`hmSelectedDrugs`, `familyMembers`, `favouriteInvestigations`, `IpdAdmission.clinical`) are read back.
- **OPD token / IPD bed unique-index SQL not applied** — Committed but NOT applied to the shared database; optional, not redundant — apply them through the tunnel when convenient.
- **`manual-sms-wallet.sql` is NOT applied** — Must be applied to the shared database before the release (four new tables); checked idempotent on a scratch database.
- **`manual-opd-presence.sql` is NOT applied** — Must be applied to the shared database before the release (three columns the queue reads).
- **`manual-opd-chambers.sql` is NOT applied** — Must be applied after `manual-opd-queue-date.sql` BEFORE the release; replaces two unique indexes; with a duplicate it keeps the old index (NOTICE).

**Closed — kept as the record of what was done or decided**

- **`manual-opd-queue-date.sql` applied 29/10/2026** — 275 visits got `queueDate` and `position`; unique index `OpdVisit_doctorId_queueDate_token_key` NOT created (14 groups already shared a token); tokens allocated under a lock.

---

# The threads, in full

## 0. Operational

- [ ] **Restart API server** — stop it, run `npx prisma generate` in `server/`, then `npm run dev`.
      New columns (`hmSelectedDrugs`, `familyMembers`, `favouriteInvestigations`, `IpdAdmission.clinical`)
      are live in Postgres but the running NestJS process still uses the old Prisma client.
      All saves silently succeed in Postgres but new columns won't be read back until after restart.

## Open threads — decisions owed, not bugs (2026-07-27)

- [ ] **`manual-opd-token-unique.sql` and `manual-ipd-bed-unique.sql` are
  committed but NOT applied** to the shared database. The service-layer
  transactional checks make them optional, not redundant — apply them through
  the tunnel when convenient.

### OPD queue by day (28/10/2026) — what is built, and what is not

- [x] **`manual-opd-queue-date.sql` was applied to the shared database on 29/10/2026** (product owner's go-ahead), before the release. All 275 existing visits got a `queueDate` and a `position`; none was changed otherwise. The old token-unique index had never been applied there, and 14 doctor-day-token groups already shared a token, so the new unique index `OpdVisit_doctorId_queueDate_token_key` was NOT created (the script reports it and goes on); tokens are allocated under a lock and do not depend on it.

### SMS to a day's queue, and Settings → Payment (01/11/2026) - open for the physician

- [ ] **`manual-sms-wallet.sql` is NOT applied to the shared database** and must be applied before the release (four new tables; every SMS and Payment request reads them). Checked on a scratch database: run twice, nothing changes; a negative balance is refused by the CHECK; the four tables are handed to `exhort_user`.

### OPD queue: presence, urgency and status (29/10/2026) - open for the physician

- [ ] **`manual-opd-presence.sql` is NOT applied to the shared database** and must be applied before the release (three columns the queue reads).

### Multiple chambers (01/11/2026) - open for the physician

- [ ] **`manual-opd-chambers.sql` is NOT applied to the shared database** and must be applied (after `manual-opd-queue-date.sql`) BEFORE the release: every queue read selects `chamberId`. It replaces two unique indexes; if a duplicate already exists it says so (NOTICE) and keeps the old index — then a second chamber cannot use `T-01` on that day until the duplicate is cleared.
