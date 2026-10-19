-- A supervising practice's unprinted prescription for a patient it supervises
-- (19/10/2026) — what Patient."incompleteRx" is for the owner's practice. See
-- the SupervisedDraft model in schema.prisma.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists. Apply it BEFORE
-- the release that reads it is deployed: GET /patients/:id asks this table for
-- a supervising doctor, and without it that read would fail.
--
--   npx prisma db execute --file prisma/manual-supervised-draft.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "SupervisedDraft" (
  "id"        TEXT NOT NULL,
  -- the supervising PRACTICE (the workstation doctor), never the owner
  "doctorId"  TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "data"      JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupervisedDraft_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupervisedDraft_doctorId_fkey') THEN
    ALTER TABLE "SupervisedDraft"
      ADD CONSTRAINT "SupervisedDraft_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupervisedDraft_patientId_fkey') THEN
    ALTER TABLE "SupervisedDraft"
      ADD CONSTRAINT "SupervisedDraft_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SupervisedDraft_doctorId_patientId_key"
  ON "SupervisedDraft" ("doctorId", "patientId");
CREATE INDEX IF NOT EXISTS "SupervisedDraft_patientId_idx"
  ON "SupervisedDraft" ("patientId");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "SupervisedDraft" OWNER TO exhort_user;
