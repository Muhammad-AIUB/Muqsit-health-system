-- OPD queue presence (physician's sheet, 29/10/2026). ADDITIVE AND IDEMPOTENT:
-- nothing is deleted or rewritten. This database is SHARED with production —
-- apply BEFORE the release that reads these columns is deployed:
--   npx prisma db execute --file prisma/manual-opd-presence.sql --schema prisma/schema.prisma
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "presentAt" TIMESTAMP(3);
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "criticallyIll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "urgent" BOOLEAN NOT NULL DEFAULT false;
