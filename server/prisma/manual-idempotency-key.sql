-- Idempotency ledger for POST routes that file clinical records
-- (src/common/idempotency/idempotency.interceptor.ts). Additive, idempotent.
-- Apply manually (DB migrations are manual here):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-idempotency-key.sql
-- Not patient data: rows are pruned by the API after 24 h.

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL,
  "key"          TEXT NOT NULL,
  "route"        TEXT NOT NULL,
  "requestHash"  TEXT NOT NULL,
  "statusCode"   INTEGER,
  "responseBody" JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_userId_key_key"
  ON "IdempotencyKey" ("userId", "key");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_createdAt_idx"
  ON "IdempotencyKey" ("createdAt");

-- The app connects as exhort_user; a table left owned by postgres answers 42501.
ALTER TABLE "IdempotencyKey" OWNER TO exhort_user;
