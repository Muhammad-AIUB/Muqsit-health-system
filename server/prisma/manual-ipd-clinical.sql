-- IPD admission clinical sheet (age, sex, clinical JSON). Safe & idempotent. Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-ipd-clinical.sql

ALTER TABLE "IpdAdmission" ADD COLUMN IF NOT EXISTS "age" INTEGER;
ALTER TABLE "IpdAdmission" ADD COLUMN IF NOT EXISTS "sex" TEXT;
ALTER TABLE "IpdAdmission" ADD COLUMN IF NOT EXISTS "clinical" JSONB NOT NULL DEFAULT '{}';
