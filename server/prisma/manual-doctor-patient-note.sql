-- "My Personal Note for This Patient" (2026-09-24): one private note per
-- (signed-in user, patient).
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists.
--
--   npx prisma db execute --file prisma/manual-doctor-patient-note.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "DoctorPatientNote" (
  "id"          TEXT NOT NULL,
  -- the signed-in user who wrote it — never the workstation doctor
  "userId"      TEXT NOT NULL,
  "patientId"   TEXT NOT NULL,
  -- { name, age, sex, address, mobile } frozen at the first save
  "patientInfo" JSONB NOT NULL,
  "html"        TEXT NOT NULL DEFAULT '',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorPatientNote_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DoctorPatientNote_userId_fkey') THEN
    ALTER TABLE "DoctorPatientNote"
      ADD CONSTRAINT "DoctorPatientNote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DoctorPatientNote_patientId_fkey') THEN
    ALTER TABLE "DoctorPatientNote"
      ADD CONSTRAINT "DoctorPatientNote_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DoctorPatientNote_userId_patientId_key"
  ON "DoctorPatientNote" ("userId", "patientId");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "DoctorPatientNote" OWNER TO exhort_user;
