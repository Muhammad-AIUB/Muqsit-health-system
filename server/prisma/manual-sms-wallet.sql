-- SMS wallet, its ledger, SMS send jobs and payment requests (2026-11-01).
-- Additive and idempotent: run it twice and nothing changes. NOT applied to the
-- shared database by the change that adds it. Apply BEFORE the release that
-- reads these tables is deployed:
--   npx prisma db execute --file prisma/manual-sms-wallet.sql --schema prisma/schema.prisma
-- then `npx prisma generate` (API stopped).

CREATE TABLE IF NOT EXISTS "SmsWallet" (
  "id"        TEXT         NOT NULL,
  "doctorId"  TEXT         NOT NULL,
  "balance"   INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SmsWallet_doctorId_key" ON "SmsWallet"("doctorId");
-- The balance is never below 0, whatever writes it.
DO $$ BEGIN
  ALTER TABLE "SmsWallet" ADD CONSTRAINT "SmsWallet_balance_not_negative" CHECK ("balance" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SmsLedger" (
  "id"          TEXT         NOT NULL,
  "doctorId"    TEXT         NOT NULL,
  "delta"       INTEGER      NOT NULL,
  "reason"      TEXT         NOT NULL,
  "ref"         TEXT,
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsLedger_doctorId_createdAt_idx" ON "SmsLedger"("doctorId", "createdAt");

CREATE TABLE IF NOT EXISTS "SmsSendJob" (
  "id"          TEXT         NOT NULL,
  "doctorId"    TEXT         NOT NULL,
  "chamberId"   TEXT,
  "day"         TEXT         NOT NULL,
  "language"    TEXT         NOT NULL,
  "status"      TEXT         NOT NULL DEFAULT 'sending',
  "reserved"    INTEGER      NOT NULL,
  "charged"     INTEGER,
  "results"     JSONB,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"  TIMESTAMP(3),
  CONSTRAINT "SmsSendJob_pkey" PRIMARY KEY ("id")
);
-- A chamber's own job (multi-chamber, 01/11/2026). Added again for a table made
-- by an earlier copy of this script, which had no such column.
ALTER TABLE "SmsSendJob" ADD COLUMN IF NOT EXISTS "chamberId" TEXT;
CREATE INDEX IF NOT EXISTS "SmsSendJob_doctorId_chamberId_day_language_createdAt_idx" ON "SmsSendJob"("doctorId", "chamberId", "day", "language", "createdAt");

CREATE TABLE IF NOT EXISTS "PaymentRequest" (
  "id"          TEXT         NOT NULL,
  "doctorId"    TEXT         NOT NULL,
  "kind"        TEXT         NOT NULL,
  "quantity"    INTEGER,
  "amount"      INTEGER,
  "note"        TEXT,
  "status"      TEXT         NOT NULL DEFAULT 'pending',
  "credited"    INTEGER,
  "adminNote"   TEXT,
  "handledAt"   TIMESTAMP(3),
  "handledById" TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentRequest_doctorId_createdAt_idx" ON "PaymentRequest"("doctorId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentRequest_status_createdAt_idx" ON "PaymentRequest"("status", "createdAt");

-- Created as `postgres`, a table the app cannot read (42501) — hand it over.
ALTER TABLE "SmsWallet" OWNER TO exhort_user;
ALTER TABLE "SmsLedger" OWNER TO exhort_user;
ALTER TABLE "SmsSendJob" OWNER TO exhort_user;
ALTER TABLE "PaymentRequest" OWNER TO exhort_user;
