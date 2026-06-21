-- 3.docx feature: age auto-increment.
-- Records the calendar year a manual age was entered, so displayed age can be
-- computed as age + (currentYear - ageAsOfYear). Idempotent.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "ageAsOfYear" INTEGER;
