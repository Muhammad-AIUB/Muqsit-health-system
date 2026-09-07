-- Patient.imageThumbs — small copies for the two document galleries.
--
-- { [fullImageUrl]: thumbUrl } for "All prescriptions(Image)" and
-- "All reports(image)". Purely additive and display-only: a gallery URL with no
-- entry here falls back to the full image, which is how every image stored
-- before this column reads. Nothing is migrated and no existing value changes.
--
-- Idempotent — safe to re-run.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "imageThumbs" JSONB;
