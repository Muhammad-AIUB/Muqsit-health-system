-- Incomplete-prescription tracking.
-- Patient.incompleteRx: saved-but-not-printed editor snapshot (restored on lookup).
-- OpdVisit.rxStatus: incomplete | complete badge for the queue card.
-- Idempotent.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "incompleteRx" JSONB;
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "rxStatus" TEXT;
