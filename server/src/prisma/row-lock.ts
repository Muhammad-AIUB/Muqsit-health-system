/**
 * ⚕️ Options for an interactive transaction that takes a ROW LOCK
 * (`SELECT … FOR UPDATE`) and so waits its turn behind other writes to the
 * same row — the IPD admission (its order-sheet pages, its PATCH, its status)
 * and a patient's family tree. Any interactive transaction that WRITES a row a
 * `FOR UPDATE` may hold waits the same way, and takes these options too.
 *
 * Prisma fails an interactive transaction that has run past 5 s by default,
 * and that time includes WAITING for the lock (the query is not interrupted:
 * the transaction is refused once the lock is granted and the query returns). A handful of writes arriving together on a
 * busy server therefore failed at the back of the queue: 500 "Transaction
 * already closed", and the page or the family member was not filed (found from
 * a test that failed now and then under load, 18/10/2026; pinned in
 * `test/ipd-analogue.int-spec.ts` and `test/row-lock-wait.int-spec.ts`).
 *
 * The work inside each of these transactions is a few small queries; the time
 * is the queue, which is the lock doing its job. 30 s leaves room for a queue
 * many times longer than a ward produces. It does NOT end a query that is still
 * waiting for a lock that never comes free (a holder stuck on a dropped
 * connection): only Postgres can, through `lock_timeout`, which is not set
 * here. `maxWait` is the wait for a connection from the pool.
 */
export const ROW_LOCK_TX = { maxWait: 10_000, timeout: 30_000 } as const;
