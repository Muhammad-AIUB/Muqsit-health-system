-- Phrase habits: the free-text sibling of DoctorRxHabit.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists.
--
--   npx prisma db execute --file prisma/manual-doctor-phrase-habit.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "DoctorPhraseHabit" (
  "id"           TEXT NOT NULL,
  "doctorId"     TEXT NOT NULL,
  -- "advice" | "rxNote"
  "source"       TEXT NOT NULL,
  -- typography-normalised phrase; the matching key
  "signature"    TEXT NOT NULL,
  -- the phrase as last written; what gets inserted
  "text"         TEXT NOT NULL,
  -- DISTINCT PATIENTS, never prescriptions
  "patientCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"   TIMESTAMP(3) NOT NULL,
  "hidden"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorPhraseHabit_pkey" PRIMARY KEY ("id")
);

-- A doctor's account going away takes their learned phrases with it; their
-- patients and prescriptions are governed elsewhere and are untouched here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DoctorPhraseHabit_doctorId_fkey'
  ) THEN
    ALTER TABLE "DoctorPhraseHabit"
      ADD CONSTRAINT "DoctorPhraseHabit_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DoctorPhraseHabit_doctorId_source_signature_key"
  ON "DoctorPhraseHabit" ("doctorId", "source", "signature");

CREATE INDEX IF NOT EXISTS "DoctorPhraseHabit_doctorId_source_patientCount_idx"
  ON "DoctorPhraseHabit" ("doctorId", "source", "patientCount");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "DoctorPhraseHabit" OWNER TO exhort_user;
