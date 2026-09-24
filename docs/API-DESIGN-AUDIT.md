# API design audit — 12 practices (2026-09-24)

Scope: the NestJS API in `server/` and the way `client/` consumes it. Every
verdict names the file it was read in. Where a practice was not followed, the
fix is **in this same commit** (files named), and the resulting contract is in
`docs/API.md` §1.

> The checklist this audit was run against mentions "rate-limit rules/logs"
> (it reads like a rate-limiter-as-a-service template). This repo has no such
> resource. "Rules/logs" were mapped to the API's own unbounded lists (the
> practice's patients, the activity log) and "the service's own API" to the
> throttler that protects this API. Everything else applies as written.

Priority order was idempotency → the API's own rate limiting → caching, as
asked, because each one is a patient-safety or clinic-reliability issue, not
style.

**Verified before claiming done:** `server` typecheck + jest (250 tests, 13 new),
`client` typecheck + vitest (781 tests), a real `nest build` producing
`dist/main.js`, and the API booted against a throwaway local Postgres 16 with
every manual SQL file applied and each flow below exercised with curl (login,
idempotent replay, 422 on a changed body, cursor paging both pages, cache
headers, 429 with `Retry-After`, 503 with the DB stopped, cross-site 403,
`/api/docs-json`). **Not verified:** the live database (no tunnel here) — the
two new `manual-*.sql` files still have to be applied there, and the OPD/IPD
unique indexes may still be unapplied (root `CLAUDE.md`). `pm2` instance count
on the VPS is unknown; see practice 9.

| # | Practice | Before | Now |
|---|---|---|---|
| 1 | Clear resource names | ✅ mostly | unchanged (see 12) |
| 2 | Standard HTTP methods | ✅ mostly | `POST /mirror/publish` → 200 |
| 3 | Idempotency | ❌ | `Idempotency-Key` on the four record-filing POSTs; ledger table; OPD P2002 retry |
| 4 | Versioning | ❌ | version-neutral `enableVersioning`; `X-App-Build` + reload banner |
| 5 | Status codes | ⚠️ | Prisma → 409/404/503; clinician-readable 429; `Retry-After` |
| 6 | Pagination | ❌ | cursor paging on `/patients` and `/activity`, body stays an array |
| 7 | Filtering & sorting | ⚠️ | allowlisted `sort`/`order`, `?status=` on IPD, indexes SQL |
| 8 | Security | ✅ | + Origin check on writes, typed `/mirror/publish` body |
| 9 | Rate limiting (own API) | ⚠️ | per-user tracker, exposed headers, honest message, client honours `Retry-After` |
| 10 | Caching | ❌ | `no-store` everywhere; formulary `private, max-age=1d` + in-process memo |
| 11 | API docs | ❌ | Swagger UI from the CLI plugin, dev / `SWAGGER=true` |
| 12 | Pragmatic tradeoffs | — | listed below; nothing REST-purist was forced |

---

## 1. Clear resource names — ✅ mostly follows

**Checked:** every `@Controller` / `@Get|Post|Patch|Put|Delete` in
`server/src/**/*.controller.ts` (34 controllers' worth of routes, catalogued in
`docs/API.md` §5).

Resources are plural nouns (`/patients`, `/prescriptions`, `/wards`,
`/assistants`), singletons are singular (`/prescription-draft`,
`/prescription-layout`), sub-resources nest one level (`/ipd/:id/events`,
`/wards/:id/members/:memberId`, `/patients/:id/supervisors/:doctorId`). Ids are
cuids, never exposed integers.

Verb-shaped paths that exist, and why they stay:

| Route | Why it is an action, not a resource |
|---|---|
| `PATCH /admin/registrations/:id/approve|reject|suspend` | state transitions with side effects (mail, session revocation) |
| `POST /admin/users/:id/revoke-sessions` | a command, no representation to PUT |
| `POST /opd/rx-status` | upsert of *today's* entry for a patient — keyed by (doctor, patient, day), not by id |
| `POST /ipd/:id/analogue/:sheetId/restore` | undo of a soft delete; `PATCH {removedAt:null}` would let a client fake the audit trail |
| `POST /patients/link`, `POST /mirror/publish` | create-with-reciprocal-links; fan-out |
| `GET /medicines/search?q=`, `GET /assistants/search`, `GET /wards/:id/search` | searches over a collection the caller does not own (formulary, users) |

Renaming `GET /patients/by-mobile?mobile=` to `GET /patients?mobile=` would be
"cleaner" and would break every open tab for zero benefit. Left alone (12).

## 2. Standard HTTP methods — ✅ mostly follows

**Checked:** the same decorator sweep; `prescription-draft`, `prescription-layout`,
`drug-advice`, `patient-notes`, `assistants/defaults` for PUT semantics;
`patients.service.ts#remove` and `templates.service.ts#remove` for DELETE
bodies.

GET is read-only everywhere (no GET mutates). POST creates or commands. PATCH
is partial (`UpdatePatientDto = PartialType(CreatePatientDto)`). PUT is used
exactly where the body *is* the whole document: the draft, the print layout,
a patient note, a drug-advice key, assistant defaults — correct. DELETE returns
`200 {id}` consistently (the client types it as `{ id: string }`); 204 would
also be fine, consistency matters more. `POST /auth/login|refresh` use
`@HttpCode(200)`, `logout` 204.

**Fixed:** `POST /mirror/publish` returned 201 for a fire-and-forget fan-out
that creates nothing → `@HttpCode(200)` (`mirror.controller.ts`).

**Known and deliberate:** `PATCH /ipd/:id` replaces the whole `clinical`
column (PUT semantics on a PATCH). Documented in `server/CLAUDE.md` Rule 2d with
the client-side merge; the real problem there is lost updates (see 12).

## 3. Idempotency — ❌ did not follow → fixed

**Checked:** `prescriptions.controller.ts#create`, `patients.controller.ts#create`,
`opd.service.ts#create/nextToken`, `ipd.service.ts#create/assertBedFree`,
`client/src/context/MuqsitContext.tsx#savePrescription`,
`client/src/lib/api.ts#apiFetch`, `prisma/manual-opd-token-unique.sql`,
`prisma/manual-ipd-bed-unique.sql`.

Before: no idempotency key anywhere. `savePrescription` has a synchronous
double-press guard in its caller (`client/CLAUDE.md`, 2026-08-23) but nothing
for the other case — a save that **times out on a clinic connection**: the
server may have committed, the client shows "Save failed", the doctor presses
again, and the consultation is filed twice (two `Prescription` rows, two habit
counts, two activity lines — and if the patient was new, two `Patient` rows).
The two DB unique indexes that guard OPD tokens and IPD beds exist as SQL
files but the root `CLAUDE.md` records they may never have been applied.

**Fix (server):**

- `server/src/common/idempotency/idempotency.interceptor.ts` —
  `@UseInterceptors(IdempotencyInterceptor)` on `POST /patients`,
  `/prescriptions`, `/opd`, `/ipd`. First request **claims** `(userId, key)` by
  inserting a ledger row (the unique index is the concurrency guard), the
  handler runs, the response is stored. Same key + same body → stored response,
  `Idempotency-Replayed: true`, nothing written. Same key + different body →
  `422` (the earlier request already wrote a record; silently writing a second,
  different one is the exact failure being guarded). Same key while the first
  is still running → `409`. Handler threw → key released. No header → unchanged
  behaviour. Abandoned claims (process died mid-request, e.g. a deploy) are
  reclaimed after 60 s; rows are pruned after 24 h.
- `prisma/schema.prisma` `IdempotencyKey` + `prisma/manual-idempotency-key.sql`
  (additive, `IF NOT EXISTS`, `OWNER TO exhort_user`). **Apply through the tunnel.**
- `opd.service.ts#create` — re-allocates the token and retries twice on
  `P2002`, so once `manual-opd-token-unique.sql` is applied a concurrent race
  is invisible to the assistant instead of a 409.
- Pinned in `idempotency.interceptor.spec.ts` (fresh / replay / mismatch /
  in-flight / release).

**Fix (client):** `api.ts#newIdempotencyKey`, `patientsApi.create` and
`prescriptionsApi.create` take `{ idempotencyKey }`; `MuqsitContext#savePrescription`
mints one key pair per **unsaved** prescription (`rxSaveKeysRef`), reuses it on
every retry, clears it on success and in `resetEditor`, and on `422` tells the
doctor an earlier attempt was already filed. **A physician's call to confirm:**
that 422 wording and the "reuse across retries until success" rule.

**Still to do on the live DB (not code):**

```sql
-- Which of the two guards are actually there?
SELECT indexname FROM pg_indexes
 WHERE indexname IN ('OpdVisit_doctor_day_token_key','IpdAdmission_doctor_bed_active_key');
```

```bash
cd server
npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-idempotency-key.sql
npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-opd-token-unique.sql   # if missing
npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-ipd-bed-unique.sql     # if missing
```

## 4. API versioning — ❌ did not follow → pragmatic fix

**Checked:** `main.ts` (only `setGlobalPrefix('api')`), all three
`package.json` (0.1.0), `.github/workflows/deploy.yml` (client and server deploy
from one push), `server/CLAUDE.md` Rule 2d ("an old tab still open on a ward
PC after a deploy").

There is one first-party client and it ships with the server, so `/v1` URLs
would be ceremony. The real versioning problem this app has is **old tabs**:
a tab loaded before a deploy keeps calling an API whose payload shapes moved.

**Fix:** `main.ts` — `enableVersioning({ type: URI, defaultVersion:
VERSION_NEUTRAL })`: nothing changes today; a future breaking change puts
`@Version('2')` on that one handler (`/api/v2/...`) and leaves every other
route where it is. Plus `X-App-Build` (git short SHA at boot) on every
response; `client/src/lib/api.ts#onBuildChange` +
`components/common/NewBuildBanner.tsx` show a calm "new version — reload" bar
when it changes mid-session. It never reloads by itself.

Backward compatibility of this commit's own changes: every new query
parameter is optional, every new header is optional, list bodies stayed
arrays, no field was renamed.

## 5. Correct status codes — ⚠️ partly → fixed

**Checked:** `docs/API.md` error table, `ConflictException` uses
(`auth.service.ts:73`, `wards.service.ts:224,295`, `ipd.service.ts:109`,
`assistants.service.ts:167`), `patients.service.ts#get` (404 for foreign ids,
deliberate), `@nestjs/throttler` default message, `client/src/lib/api.ts`
(joins `body.message` into the doctor-facing banner).

Good: 400/401/403/404/409 are used with intent, and "404 for not-yours" is a
documented decision. Gaps: (a) a Prisma `P2002` (the unique indexes above) or
`P1001` (DB unreachable) surfaced as a bare **500 "Internal server error"**,
which the doctor cannot act on; (b) the 429 body was the library's
`"ThrottlerException: Too Many Requests"`, shown verbatim to a clinician; (c)
`Retry-After` was set but not readable by the browser app (CORS).

**Fix:** `common/http/prisma-exception.filter.ts` (registered in `main.ts`) —
`P2002` → 409, `P2025` → 404, `P1xxx` → 503 + `Retry-After: 5`, each with a
sentence the doctor can act on. The 503 text says the entry *may not* have been
saved — a timeout on a commit is ambiguous and the message must never claim a
state the server cannot know. 429 message set in `ThrottlerModule.forRoot`.
`exposedHeaders` in `enableCors` now includes `Retry-After` and the
`X-RateLimit-*` trio. Exercised: DB stopped → `503 … "code":"P1017"`.

## 6. Pagination — ❌ did not follow → fixed where it matters

**Checked:** `patients.service.ts#list` (whole practice, unbounded),
`activity.service.ts#list` (`take ≤ 200`, offset-less, no cursor),
`prescriptions.service.ts#listByPatient` (one patient's, unbounded),
`opd.service.ts#list` (today only), `ipd.service.ts#list` (all admissions).

**Fix:** cursor pagination on the two lists that grow without bound —
`GET /patients?limit=&cursor=` and `GET /activity?limit=&cursor=`. The cursor
is the last row's id; ordering always ends in `id` so two rows with the same
timestamp never straddle a page boundary twice; one extra row is fetched to
know whether a next page exists. **The body stays a plain array** and the next
cursor travels in `X-Next-Cursor` — that is what keeps every existing caller
working unchanged (`/patients` without `limit` still returns the whole list,
which the UI uses today). Client: `activityApi.page()`, `patientsApi.page()`.
Wiring the records list to `useInfiniteQuery` is UI work not done here.
Pinned in `activity.service.spec.ts`.

Not paged, on purpose: today's OPD queue and one patient's prescriptions are
bounded by nature; paging them would add a cursor to a list that fits on a
screen.

## 7. Filtering & sorting — ⚠️ partly → fixed

**Checked:** `patients.service.ts#list` (`contains` on name/mobile/nid,
hard-coded `updatedAt desc`), `prisma/schema.prisma` indexes
(`Patient`: `doctorId`, `name` — a b-tree that `ILIKE '%q%'` cannot use),
`templates` `?category=` (indexed ✓), `rx-habits` `?q=` (`text_pattern_ops`
index ✓, see `server/CLAUDE.md`), `doctor-phrases` `?source=` ✓,
`ipd.service.ts#list` (no filter), `medicines.service.ts` (`ILIKE` over a 20k
raw table with no index visible from the repo).

**Fix:** `ListPatientsQueryDto` — `search`, `sort ∈ {updatedAt, createdAt,
name}` (allowlist, never a raw column), `order`, `limit`, `cursor`; an unknown
`sort` is a 400 (exercised). `GET /ipd?status=`. `prisma/manual-list-indexes.sql`:
`(doctorId, updatedAt)`, `(doctorId, mobile)`, `(doctorId, status)` and
`pg_trgm` GIN indexes on `Patient.name`, `medicines.brandName`,
`medicines.genericName` — the only index type that serves `ILIKE '%…%'`.
`CREATE EXTENSION pg_trgm` needs a superuser once on the VPS. Prefer
`CREATE INDEX CONCURRENTLY` from psql on the live DB.

## 8. Security — ✅ follows, two small hardenings

**Checked:** `auth/strategies/jwt.strategy.ts` (httpOnly cookie first, Bearer
fallback, signature + expiry by passport-jwt, per-request status re-check),
`auth.controller.ts` (cookie flags, refresh path scoping), `auth.service.ts`
(rotation + family revocation), `main.ts` (`JWT_SECRET` ≥ 32 chars enforced in
prod, security headers, CORS allowlist, `trust proxy 1`),
`workstations/workstation.guard.ts` (the scoping boundary), `admin/`
(`RolesGuard`), `ValidationPipe({ whitelist: true })`, `uploads/upload.controller.ts`
(public by design, magic-byte gate).

This is the strongest area of the codebase and nothing here needed
re-architecture. The `Authorization` header is validated (a malformed Bearer is
a 401 from passport). No API keys exist and none are needed: the only
server-to-server caller is the deploy, which does not call the API.

**Hardened:** (a) `main.ts` refuses any non-GET whose `Origin` is outside
`CORS_ORIGIN` with 403 before any route — `SameSite=lax` already stops
cross-site cookies, this is what still holds if `COOKIE_SAMESITE=none` is ever
needed (exercised). (b) `POST /mirror/publish` took an untyped body, so the
whitelist pipe could neither validate nor strip it → `MirrorPublishDto`
(`payload` carries `@Allow()`, without which the whitelist would drop it and
mirroring would silently stop).

## 9. Rate limiting on the API itself — ⚠️ partly → fixed

**Checked:** `app.module.ts` (`ThrottlerModule.forRoot([{ ttl: 60_000, limit:
100 }])`, `APP_GUARD: ThrottlerGuard`), `auth.controller.ts` (`@Throttle` per
route), `@nestjs/throttler` 6.2 behaviour (sets `X-RateLimit-Limit/Remaining/Reset`
and `Retry-After` — confirmed on the running API), `client/src/lib/api.ts` (no
429 handling), `Providers.tsx` (`retry: 1` for every error, including 4xx).

Problems: the bucket was **per IP**, and a clinic is one NAT address shared
by the doctor and every assistant PC; 100/min for the whole practice is
exceeded by one assistant bulk-uploading 20 reports (image + thumbnail + PATCH
+ activity line each ≈ 80 requests) plus the 8-second activity poll — in other
words the throttle would fire on legitimate clinical work, and the message it
showed was `ThrottlerException: Too Many Requests`. The browser could not read
`Retry-After`, and React Query retried 400s and 403s as if they were flakes.

**Fix:** `common/throttler/app-throttler.guard.ts` — the tracker is the
**verified** access token's `sub` (`user:<id>`), falling back to `ip:<addr>`;
a forged cookie fails verification and cannot mint buckets. Provided as
`APP_GUARD` from `AuthModule` (it needs `JwtService`). 300/min per user as a
starting ceiling — tune from the 429 logs, never from a guess. Auth routes keep
their tight per-IP limits. Clinician-readable `errorMessage`. Client:
`apiFetch` waits out a `Retry-After ≤ 5 s` **once, on GET only**; writes are
never auto-repeated (their retry is the doctor's, with the same
`Idempotency-Key`); React Query's `retry` refuses every 4xx except 429 and its
`retryDelay` honours `Retry-After`. Exercised: sixth login attempt → 429,
`Retry-After: 60`, new message; authenticated call → `X-RateLimit-Limit: 300`.

**Not verifiable from the repo:** the throttler storage is in-process memory.
If pm2 runs the API in cluster mode with N instances the effective limit is
N×. Check with `pm2 describe` on the VPS; if N > 1 either accept it or add
`@nestjs/throttler-storage-redis` (a new dependency, not taken here).

## 10. Caching — ❌ did not follow → fixed

**Checked:** `main.ts` (only `/uploads` had a policy: `immutable, max-age=365d`,
correct and documented), every controller (no `Cache-Control` on any API
route; Express emits a weak `ETag` on JSON by default), `medicines.service.ts`
(one `ILIKE` query per keystroke in the ℞ pad, the most repeated query in the
app), `client/src/components/providers/Providers.tsx` (`staleTime: 30 s`).

Two problems pulling in opposite directions. Read-heavy: the formulary search
was uncached at every layer. Safety: **no** API response said `no-store`, so on
a shared clinic PC a patient list could sit in the browser's disk cache after
logout, and any proxy was free to cache it.

**Fix:** `main.ts` sets `Cache-Control: no-store` on every `/api` response
before any handler; `common/http/cache-control.interceptor.ts` exports
`@CacheControl('…')` as the only override, and `GET /medicines/search` is the
only user (`private, max-age=86400`, revalidated by the existing weak ETag).
`MedicinesService` memoises results in-process (5 min TTL, 2000 entries, keyed
by lower-cased query) — a manual SQL correction to the formulary is visible
within 5 minutes or on the next pm2 restart. **A physician's call:** whether 5
minutes of formulary staleness is acceptable; set `CACHE_TTL_MS` lower if not.
The trigram indexes in practice 7 are the DB half. Exercised: formulary →
`private, max-age=86400`; patients → `no-store`.

Rule recorded in the root `CLAUDE.md`: never `@CacheControl` a route that
returns patient or per-user data.

## 11. API docs — ❌ did not follow → fixed

**Checked:** `server/package.json` (no `@nestjs/swagger`), `docs/API.md` line
25 ("There is no OpenAPI/Swagger document"), `server/CLAUDE.md` ("Every route
is catalogued in `docs/API.md`").

`docs/API.md` is a good hand-written reference (659 lines, scoping and
permission keys per route) and stays the human one. What was missing is a
generated document that cannot drift from the code.

**Fix:** `@nestjs/swagger` (one new dependency; the deploy runs `npm install`)
with the **CLI plugin** in `nest-cli.json` (`classValidatorShim`,
`introspectComments`), so DTOs and query parameters are documented from
`class-validator` decorators and comments — no `@Api*` decorators to keep in
step. `SwaggerModule.setup('api/docs')` in `main.ts`, in development, and in
production only when `SWAGGER=true` — a medical API's schema is not published
by default. Exercised: `/api/docs-json` lists 64 paths and shows
`ListPatientsQueryDto`'s five parameters on `GET /patients`.

## 12. Pragmatic tradeoffs — where strict REST would hurt

Kept, deliberately:

- **Action endpoints stay verbs** (approve/reject/suspend, revoke-sessions,
  restore, rx-status). Modelling them as `PATCH {status}` would let a client
  write states the server should only reach through a transition, and would
  hide the side effects (mail, audit rows) behind a field update.
- **No `/v1` in URLs.** One first-party client, deployed with the server. The
  version-neutral switch is armed for the day a single route needs `v2`; the
  old-tab problem is solved by `X-App-Build`, which is what actually bites.
- **Pagination via a response header, not a `{items, next}` envelope.** An
  envelope would have broken every list caller for a field the UI does not yet
  read. The header is invisible to old code and available to new code.
- **404 for "not yours".** Documented; a 403 would confirm the id exists.
- **`DELETE` returns `{id}`** rather than 204; consistency with the client's
  typed helpers over purity.
- **`POST /opd/rx-status` upsert.** A `PUT /opd/patients/:id/today` would be
  more RESTful and would invent a resource the domain does not have.
- **Raw `medicines` table, not a Prisma model.** Documented; queried with
  bound parameters.

Flagged for a decision, not done here:

- **Lost updates on `PATCH /ipd/:id` (`clinical`).** `server/CLAUDE.md` Rule 2d
  already names it: two ward-team members clobber each other with no error.
  The fix is optimistic concurrency — a `version` column, `If-Match` /
  `expectedVersion` in the PATCH, and a 409 that returns the current server
  copy so the doctor's typing is merged, not lost. The merge UI is a clinical
  workflow choice for the physician; the server half is ~30 lines once the
  behaviour is agreed.
- **Idempotency scope for `PATCH`.** The interceptor is on the four POSTs
  that file records. `PATCH /patients/:id` is already idempotent by nature
  (same body → same state) and needs no key.
- **`limit` on `/patients` stays optional** until the records list is moved to
  `useInfiniteQuery`; once it is, make `limit` required and remove the
  whole-list branch.

## Files in this commit

Server: `src/common/{idempotency,throttler,http}/*`, `src/app.module.ts`,
`src/auth/auth.module.ts`, `src/main.ts`, `src/activity/*`, `src/patients/*`,
`src/prescriptions/prescriptions.controller.ts`, `src/opd/*`, `src/ipd/*`,
`src/medicines/*`, `src/mirror/*`, `src/app.module.spec.ts`, `nest-cli.json`,
`package.json` (`@nestjs/swagger`), `prisma/schema.prisma`,
`prisma/manual-idempotency-key.sql`, `prisma/manual-list-indexes.sql`.
Client: `src/lib/api.ts`, `src/context/MuqsitContext.tsx`,
`src/components/providers/Providers.tsx`,
`src/components/common/NewBuildBanner.tsx`. Docs: `docs/API.md` §1 and route
tables, root / `server` / `client` `CLAUDE.md`.
