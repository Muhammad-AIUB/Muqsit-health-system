-- Prescription."plan" — the second half of the old "Note / plan" sidebar field,
-- split into its own list on 2026-09-07 (physician's decision).
--
-- Additive and idempotent. Existing rows get an empty array and keep every line
-- they already had in "note": which of those lines were a NOTE and which were a
-- PLAN is a clinical judgement, so nothing is moved across automatically.
--
-- Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-prescription-plan.sql

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "plan" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
