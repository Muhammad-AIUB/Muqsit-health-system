-- Fingerprint of the printed sheet behind the newest AUTO gallery snapshot.
-- Additive and idempotent: NULL on every existing row, which the client reads
-- as "nothing recorded yet, take a snapshot".
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "lastRxImageKey" TEXT;
