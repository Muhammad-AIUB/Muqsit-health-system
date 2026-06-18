-- User.fieldRecents: per-doctor autocomplete "recents" (was localStorage).
-- Idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-field-recents.sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fieldRecents" JSONB NOT NULL DEFAULT '{}';
