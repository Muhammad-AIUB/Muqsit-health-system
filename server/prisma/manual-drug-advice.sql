-- Special advice per medicine / per generic, written by the doctor in the ℞
-- pad's ••• box (2026-09-24).
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists.
--
--   npx prisma db execute --file prisma/manual-drug-advice.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "DoctorDrugAdvice" (
  "id"        TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  -- "medicine" | "generic"
  "scope"     TEXT NOT NULL,
  -- typography-folded matching key (strength included for "medicine")
  "key"       TEXT NOT NULL,
  -- the medicine line / generic name as last shown; display only
  "label"     TEXT NOT NULL,
  -- the doctor's advice lines, verbatim
  "lines"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorDrugAdvice_pkey" PRIMARY KEY ("id")
);

-- A doctor's account going away takes their own advice with it; patients and
-- prescriptions are governed elsewhere and are untouched here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DoctorDrugAdvice_doctorId_fkey'
  ) THEN
    ALTER TABLE "DoctorDrugAdvice"
      ADD CONSTRAINT "DoctorDrugAdvice_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DoctorDrugAdvice_doctorId_scope_key_key"
  ON "DoctorDrugAdvice" ("doctorId", "scope", "key");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "DoctorDrugAdvice" OWNER TO exhort_user;
