-- Patient national ID — enterable in Patient Settings, searchable from the
-- top-bar search alongside mobile. Idempotent.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "nid" TEXT;
