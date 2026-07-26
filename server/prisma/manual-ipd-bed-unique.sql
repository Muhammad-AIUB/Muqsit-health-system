-- Recommended uniqueness guard for IPD bed occupancy.
-- A bed may hold at most one non-discharged admission per doctor. The
-- application now verifies this inside a transaction on create/update
-- (ipd.service.ts assertBedFree), which is correct on its own, but a partial
-- unique index is the only hard guarantee against a concurrent double-booking.
-- Apply manually (DB migrations are manual here):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-ipd-bed-unique.sql
--
-- Partial index: uniqueness is enforced only for active (non-discharged)
-- admissions, so a bed freed by discharge can be reassigned. If any legacy
-- duplicate active (doctorId, bed) rows already exist this will fail —
-- discharge or reassign the duplicates first.

CREATE UNIQUE INDEX IF NOT EXISTS "IpdAdmission_doctor_bed_active_key"
  ON "IpdAdmission" ("doctorId", "bed")
  WHERE "status" <> 'Discharge';
