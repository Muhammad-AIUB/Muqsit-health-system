-- Activity feed table. Safe & idempotent (CREATE TABLE IF NOT EXISTS). Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-activity-log.sql

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id"          TEXT NOT NULL,
  "doctorId"    TEXT NOT NULL,
  "actorName"   TEXT NOT NULL,
  "patientId"   TEXT,
  "patientName" TEXT,
  "section"     TEXT NOT NULL,
  "detail"      TEXT NOT NULL,
  "action"      TEXT NOT NULL DEFAULT 'added',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityLog_doctorId_createdAt_idx"
  ON "ActivityLog" ("doctorId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ActivityLog_doctorId_fkey'
  ) THEN
    ALTER TABLE "ActivityLog"
      ADD CONSTRAINT "ActivityLog_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
