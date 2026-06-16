-- Wire former localStorage features to Postgres. Safe & idempotent: only
-- ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS — nothing is dropped, so
-- the 20k-row `medicines` table is untouched. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-wire-localstorage.sql

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "previousComplaints" TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "PrescriptionLayout" ADD COLUMN IF NOT EXISTS "rxType" TEXT NOT NULL DEFAULT 'ipd';
ALTER TABLE "PrescriptionLayout" ADD COLUMN IF NOT EXISTS "opdLayout" TEXT NOT NULL DEFAULT 'single';

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "hmDrugDates" JSONB;

CREATE TABLE IF NOT EXISTS "PrescriptionTemplate" (
  "id"        TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "category"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "items"     JSONB NOT NULL DEFAULT '[]',
  "order"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrescriptionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrescriptionTemplate_doctorId_category_idx"
  ON "PrescriptionTemplate" ("doctorId", "category");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PrescriptionTemplate_doctorId_fkey'
  ) THEN
    ALTER TABLE "PrescriptionTemplate"
      ADD CONSTRAINT "PrescriptionTemplate_doctorId_fkey"
      FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
