-- Investigation preferences on User (favourite tests + preferred units).
-- Safe & idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-investigation-prefs.sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "favouriteInvestigations" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "investigationUnitPrefs" JSONB NOT NULL DEFAULT '{}';
