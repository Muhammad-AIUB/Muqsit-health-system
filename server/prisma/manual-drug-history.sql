-- Add persistent, date-stamped drug history to Patient (idempotent).
ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "drugHistory" JSONB NOT NULL DEFAULT '[]';
