-- Health trend chart: per-patient symptom duration overrides.
-- { [chiefComplaintText]: { sf, upto } } — same shape as "hmDrugDates".
-- Display-only override; the derived range still comes from the patient's
-- prescriptions and is never rewritten.
-- Additive and idempotent: safe to re-run, safe on the shared production DB.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "hmSymptomDates" JSONB;
