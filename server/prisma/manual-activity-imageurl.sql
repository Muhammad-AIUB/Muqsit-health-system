-- ActivityLog: optional attached report image (hosted URL). Idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-activity-imageurl.sql

ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
