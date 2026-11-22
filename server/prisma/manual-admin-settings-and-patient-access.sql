-- Admin "Profile settings" + the patient's own code (physician's sheet, 16/11/2026).
--
-- ⚕️ ADDITIVE AND IDEMPOTENT: nothing is deleted or rewritten, every existing
-- row keeps working (both new columns default to false). This database is SHARED
-- with production (root CLAUDE.md), so applying this through the tunnel migrates
-- production too. Apply it BEFORE the release that reads it is deployed: every
-- read of a User asks for the two new columns, and without them the whole API
-- answers P2022.
--
--   npx prisma db execute --file prisma/manual-admin-settings-and-patient-access.sql --schema prisma/schema.prisma
--
-- 1. User."isolated" / User."hideMhsLogo" — set by the admin per doctor.
-- 2. DoctorPointScore — the admin's ten scores for a doctor (admin-only table).
-- 3. PatientAccessGrant / PatientAccessCode — a practice opening another
--    practice's patient with the code sent to the patient's own phone.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isolated"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideMhsLogo" BOOLEAN NOT NULL DEFAULT false;

-- ── DoctorPointScore ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DoctorPointScore" (
  "userId"    TEXT NOT NULL,
  "scores"    JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorPointScore_pkey" PRIMARY KEY ("userId")
);

-- ── PatientAccessGrant ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PatientAccessGrant" (
  "id"             TEXT NOT NULL,
  "patientId"      TEXT NOT NULL,
  "doctorId"       TEXT NOT NULL,
  "verifiedMobile" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAccessGrant_pkey" PRIMARY KEY ("id")
);

-- ── PatientAccessCode ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PatientAccessCode" (
  "id"        TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts"  INTEGER NOT NULL DEFAULT 0,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAccessCode_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DoctorPointScore_userId_fkey') THEN
    ALTER TABLE "DoctorPointScore"
      ADD CONSTRAINT "DoctorPointScore_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientAccessGrant_patientId_fkey') THEN
    ALTER TABLE "PatientAccessGrant"
      ADD CONSTRAINT "PatientAccessGrant_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientAccessGrant_doctorId_fkey') THEN
    ALTER TABLE "PatientAccessGrant"
      ADD CONSTRAINT "PatientAccessGrant_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientAccessCode_patientId_fkey') THEN
    ALTER TABLE "PatientAccessCode"
      ADD CONSTRAINT "PatientAccessCode_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientAccessCode_doctorId_fkey') THEN
    ALTER TABLE "PatientAccessCode"
      ADD CONSTRAINT "PatientAccessCode_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PatientAccessGrant_patientId_doctorId_key"
  ON "PatientAccessGrant" ("patientId", "doctorId");
CREATE INDEX IF NOT EXISTS "PatientAccessGrant_doctorId_idx"
  ON "PatientAccessGrant" ("doctorId");
CREATE INDEX IF NOT EXISTS "PatientAccessCode_patientId_doctorId_idx"
  ON "PatientAccessCode" ("patientId", "doctorId");
CREATE INDEX IF NOT EXISTS "PatientAccessCode_patientId_createdAt_idx"
  ON "PatientAccessCode" ("patientId", "createdAt");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "DoctorPointScore"   OWNER TO exhort_user;
ALTER TABLE "PatientAccessGrant" OWNER TO exhort_user;
ALTER TABLE "PatientAccessCode"  OWNER TO exhort_user;
