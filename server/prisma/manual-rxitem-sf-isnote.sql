-- PrescriptionItem: persist note flag + Start-From date. Idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-rxitem-sf-isnote.sql

ALTER TABLE "PrescriptionItem" ADD COLUMN IF NOT EXISTS "isNote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrescriptionItem" ADD COLUMN IF NOT EXISTS "sf" TEXT;
