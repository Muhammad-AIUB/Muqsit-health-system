-- Add persistent on-examination history to Patient (idempotent).
ALTER TABLE "Patient"
  ADD COLUMN IF NOT EXISTS "onExaminationSummary" JSONB NOT NULL DEFAULT '[]';
