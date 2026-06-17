-- Active prescription draft (one per doctor). Safe & idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-prescription-draft.sql

CREATE TABLE IF NOT EXISTS "PrescriptionDraft" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "data"      JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrescriptionDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrescriptionDraft_userId_key" ON "PrescriptionDraft"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrescriptionDraft_userId_fkey'
  ) THEN
    ALTER TABLE "PrescriptionDraft"
      ADD CONSTRAINT "PrescriptionDraft_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
