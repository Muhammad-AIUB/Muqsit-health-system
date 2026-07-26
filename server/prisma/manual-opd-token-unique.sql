-- Recommended uniqueness guard for per-doctor-per-day OPD tokens (T-NN).
-- The application now allocates the serial from MAX(existing token) inside a
-- transaction (opd.service.ts), which is append-only and race-resistant, but a
-- DB-level unique index is the only hard guarantee against two concurrent
-- inserts sharing a token. Apply manually (DB migrations are manual here):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-opd-token-unique.sql
--
-- Tokens are scoped to a doctor and a calendar day. There is no explicit "day"
-- column, so this is a functional unique index over (doctorId, day-of-createdAt,
-- token). Adjust the time zone below to match how the API computes "start of
-- day" (server local time). If any legacy duplicate (doctorId, day, token) rows
-- already exist this index creation will fail — de-duplicate them first.

CREATE UNIQUE INDEX IF NOT EXISTS "OpdVisit_doctor_day_token_key"
  ON "OpdVisit" ("doctorId", (("createdAt")::date), "token");
