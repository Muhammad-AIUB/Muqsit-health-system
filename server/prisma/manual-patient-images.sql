-- Patient document galleries (prescription/report image URLs). Safe & idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-patient-images.sql

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "prescriptionImages" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "reportImages" TEXT[] NOT NULL DEFAULT '{}';
