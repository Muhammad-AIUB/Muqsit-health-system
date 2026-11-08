-- PatientFile (07/11/2026): signed "permissions" (scanned images) and Imaging
-- DICOM studies filed against a patient. The bytes are in /uploads; this table
-- is the record (name, date, url). Removal is soft (removedAt).
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too. It
-- creates one new table and touches nothing that exists.
--
--   npx prisma db execute --file prisma/manual-patient-files.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "PatientFile" (
  "id"               TEXT NOT NULL,
  "patientId"        TEXT NOT NULL,
  "kind"             TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "fileDate"         TEXT NOT NULL,
  "url"              TEXT NOT NULL,
  "size"             INTEGER NOT NULL DEFAULT 0,
  "originalName"     TEXT NOT NULL DEFAULT '',
  "practiceDoctorId" TEXT,
  "addedById"        TEXT,
  "addedByName"      TEXT,
  "removedAt"        TIMESTAMP(3),
  "removedById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientFile_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientFile_patientId_fkey') THEN
    ALTER TABLE "PatientFile"
      ADD CONSTRAINT "PatientFile_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PatientFile_patientId_kind_idx" ON "PatientFile" ("patientId", "kind");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "PatientFile" OWNER TO exhort_user;
