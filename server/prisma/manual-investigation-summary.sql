-- Persistent per-patient investigation history (records page summary + downloads).
-- Array of { date, category, test, value }. Idempotent.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "investigationSummary" JSONB NOT NULL DEFAULT '[]'::jsonb;
