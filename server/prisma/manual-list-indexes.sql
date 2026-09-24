-- Indexes behind the list / lookup query params (docs/API.md §5.6, §5.13, §5.15).
-- Additive and idempotent. Apply manually:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-list-indexes.sql
--
-- On the live database prefer CREATE INDEX CONCURRENTLY from psql (it cannot run
-- inside the single transaction `db execute` uses) so writes are not blocked
-- while the index builds. The tables are small enough that either is fine today.

-- GET /patients?sort=updatedAt (default) and cursor pagination.
CREATE INDEX IF NOT EXISTS "Patient_doctorId_updatedAt_idx"
  ON "Patient" ("doctorId", "updatedAt");
-- GET /patients/by-mobile — exact-match lookup from the ℞ header.
CREATE INDEX IF NOT EXISTS "Patient_doctorId_mobile_idx"
  ON "Patient" ("doctorId", "mobile");
-- GET /ipd?status=
CREATE INDEX IF NOT EXISTS "IpdAdmission_doctorId_status_idx"
  ON "IpdAdmission" ("doctorId", "status");

-- `contains` / ILIKE searches cannot use a plain b-tree. pg_trgm GIN indexes
-- serve `ILIKE '%…%'` directly. CREATE EXTENSION needs a superuser once; if
-- exhort_user lacks it, run that one line as postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- GET /patients?search= (name)
CREATE INDEX IF NOT EXISTS "Patient_name_trgm_idx"
  ON "Patient" USING gin ("name" gin_trgm_ops);
-- GET /medicines/search?q= — the raw 20k-row formulary (not in schema.prisma).
CREATE INDEX IF NOT EXISTS medicines_brand_trgm_idx
  ON medicines USING gin ("brandName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS medicines_generic_trgm_idx
  ON medicines USING gin ("genericName" gin_trgm_ops);
