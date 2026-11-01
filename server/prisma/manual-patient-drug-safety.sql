-- "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
-- 31/10/2026): a per-patient list kept for life. See the PatientDrugSafety
-- model in schema.prisma.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists. Apply it BEFORE
-- the release that reads it is deployed: without it the list answers 500 and
-- the editor says it could not be loaded (Save & print then asks before
-- printing without it).
--
--   npx prisma db execute --file prisma/manual-patient-drug-safety.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "PatientDrugSafety" (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  -- 'drug' | 'text'
  "kind"             TEXT NOT NULL,
  "brand"            TEXT NOT NULL DEFAULT '',
  "generic"          TEXT,
  "hypersensitive"   BOOLEAN NOT NULL DEFAULT false,
  "highAlert"        BOOLEAN NOT NULL DEFAULT false,
  "text"             TEXT NOT NULL DEFAULT '',
  -- the practice (workstation doctor) that added it; no FK on purpose
  "practiceDoctorId" TEXT NOT NULL,
  -- the signed-in user who added it, and their name then; no FK on purpose
  "createdById"      TEXT NOT NULL,
  "createdByName"    TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- soft removal: never DELETE a row
  "removedAt"        TIMESTAMP(3),
  "removedById"      TEXT,
  CONSTRAINT "PatientDrugSafety_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientDrugSafety_patientId_fkey') THEN
    ALTER TABLE "PatientDrugSafety"
      ADD CONSTRAINT "PatientDrugSafety_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PatientDrugSafety_patientId_idx"
  ON "PatientDrugSafety" ("patientId");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "PatientDrugSafety" OWNER TO exhort_user;
