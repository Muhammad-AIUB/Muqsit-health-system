-- Soft-delete (Trash) support for User accounts. Safe & idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-soft-delete.sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User" ("deletedAt");
