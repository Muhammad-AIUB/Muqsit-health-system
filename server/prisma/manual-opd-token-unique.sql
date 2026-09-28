-- Recommended uniqueness guard for per-doctor-per-day OPD tokens (T-NN).
-- The application now allocates the serial from MAX(existing token) inside a
-- transaction (opd.service.ts), which is append-only and race-resistant, but a
-- DB-level unique index is the only hard guarantee against two concurrent
-- inserts sharing a token. Apply manually (DB migrations are manual here):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-opd-token-unique.sql
--
-- Tokens are scoped to a doctor and a calendar day. There is no explicit "day"
-- column, so this is a functional unique index over (doctorId, Dhaka day of
-- createdAt, token). The API resets the serial at Bangladesh midnight
-- (src/opd/dhaka-day.ts); createdAt is stored as UTC and Bangladesh is a fixed
-- UTC+6 with no DST, so "+ 6 hours" gives the same calendar day. If any legacy duplicate (doctorId, day, token) rows
-- already exist this index creation will fail — de-duplicate them first.

CREATE UNIQUE INDEX IF NOT EXISTS "OpdVisit_doctor_day_token_key"
  ON "OpdVisit" ("doctorId", (("createdAt" + interval '6 hours')::date), "token");
