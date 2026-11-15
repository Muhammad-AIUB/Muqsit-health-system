# Database, manual SQL and Prisma

> **Read this before changing the code it covers.** Named in these rules: `server/src/prisma/row-lock.ts`, `server/prisma/manual-<name>.sql`, `schema.prisma`, `ipd.service.ts#lockAdmission`, `manual-ipd-bed-unique.sql`, `manual-opd-token-unique.sql`, `medicines.service.ts`, `$queryRaw`, `ROW_LOCK_TX`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, `drugHistory`, `hidden`, `incompleteRx`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `server/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Prisma Migrate is never run (`migrate dev` offers to reset this database). Edit `schema.prisma`, write an idempotent additive `server/prisma/manual-<name>.sql`, apply with `db execute`, regenerate.
- `prisma generate` is never run with the API up: kill the :4000 process first — Windows locks the query-engine DLL (EPERM).
- A `manual-*.sql` file is never assumed applied: check the DB (`manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` may still be unapplied).
- A table created as `postgres` is never left with that owner: run `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.
- `medicines` is never put in `schema.prisma`: it is a raw table queried with parameterised `$queryRaw`.
- Clinical documents are never hard-deleted, and learned suggestions get no DELETE route: use soft removal (`removedAt`) / `hidden`.
- A transaction that takes a row lock is never left on Prisma's default 5 s limit: it takes `ROW_LOCK_TX` (`server/src/prisma/row-lock.ts`); a test that fails only under load is reproduced UNDER LOAD and read.
- Read-modify-write of a JSON column takes a `FOR UPDATE` row lock, and any such interactive transaction gets `ROW_LOCK_TX`, never Prisma's default; give it the same lock-holding test.
- Regenerate Prisma only with the dev server stopped; loose casts for a not-yet-generated column are acceptable short-term — regenerate ASAP.
- Medical-history JSON columns are append/merge on the client, whole-value writes on the server; never "fix up" their contents server-side without an explicit migration script.
- How it works — Seed with `npm run seed` (needs `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`).
- `medicines` is a raw Postgres table NOT in `schema.prisma`, queried with `$queryRaw`; no Prisma model, never let a destructive schema push touch it, keep queries parameterized.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not run Prisma Migrate (`prisma migrate …`), and there is no `prisma:migrate` script to run by habit any more (removed 2026-10-16): against this database `migrate dev` finds a schema with no migration history and offers to reset it. Edit `schema.prisma`, write an idempotent `server/prisma/manual-<name>.sql` (`IF NOT EXISTS`), apply with `db execute`, regenerate — the DB is shared with production, so only additive changes.
- We do not run `prisma generate` with the API up. Kill the :4000 process first — Windows locks the query-engine DLL (EPERM).

- We do not assume a `manual-*.sql` file was applied. Check the DB — `manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` may still be unapplied.
- We do not leave a table created as `postgres` with that owner. Run `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.

- We do not put `medicines` in `schema.prisma`. It is a raw table queried with parameterised `$queryRaw`.

- We do not hard-delete clinical documents or add DELETE routes for learned suggestions. Use soft removal (`removedAt`) / `hidden`.

- We do not leave a transaction that takes a row lock on Prisma's default time limit. It ends an interactive transaction at 5 s and counts the time spent WAITING for the lock, so the lock that keeps every order-sheet page made the writes at the back of a queue fail with a 500 on a busy server — the page was not filed. It surfaced as an integration test that failed "only under load"; run under load on purpose (12 runs, 8 cores busy) it failed 2 in 12 with the exact error, and a test that holds the lock for 6 s failed every time. Such transactions take `ROW_LOCK_TX` (`server/src/prisma/row-lock.ts`, `server/CLAUDE.md`). A test that fails only under load is reproduced UNDER LOAD and read, not run again until it passes.

## ⚠️ Rule 2 — the patient access model (do not widen casually)

_From `server/CLAUDE.md`._

**Read-modify-write of a JSON column takes a row lock.** `ipd.service.ts#lockAdmission` (`SELECT … FOR UPDATE`) before re-reading `clinical`, like the family-tree link. A plain SELECT at READ COMMITTED let two overlapping writes each read the same order sheets and the later one erase the earlier page. **⚕️ And such a transaction is given `ROW_LOCK_TX` (`src/prisma/row-lock.ts`: 30 s, 10 s for a connection), never Prisma's default.** The default fails an interactive transaction that has run past 5 s, counting the WAIT for the lock (it is refused once the lock is granted): a few writes arriving together on a busy server answered 500 ("Transaction already closed") at the back of the queue, and the page or family member was not filed (18/10/2026 — found from `ipd-analogue.int-spec.ts` failing 2 runs in 12 with the CPU loaded). Pinned deterministically by holding the lock for 6 s in `ipd-analogue.int-spec.ts` (upload, PATCH, status) and `row-lock-wait.int-spec.ts` (family link). Any interactive transaction that WRITES a row a `FOR UPDATE` may hold gets the same options and the same test (the status change was missed at first: its UPDATE waited on the lock too — review). Not covered: a query waiting for a lock that never comes free is not ended by Prisma; `lock_timeout` is not set. `scripts/backfill-image-thumbs.js` still uses the defaults.

## Prisma specifics

_From `server/CLAUDE.md`._

- Regenerating on Windows requires the dev server stopped (root CLAUDE.md). If a freshly added column isn't in the generated client yet, the codebase uses loose casts (`const extra = rest as Record<string, unknown>`) — acceptable short-term, regenerate ASAP.
- JSON columns carrying medical history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `incompleteRx`, `familyMembers`, IPD `clinical`) are **append/merge on the client, whole-value writes on the server**. Never "fix up" their contents server-side without an explicit migration script.

- Seed: `npm run seed` (needs `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`).

## Gotchas

_From `server/CLAUDE.md`._

- **The medicine database is a raw Postgres table `medicines` that is NOT in `schema.prisma`** — `medicines.service.ts` queries it with `$queryRaw` (bound params, brand-before-generic ranking). Don't look for a Prisma model, don't let a destructive schema push touch it, and keep any new query parameterized.
