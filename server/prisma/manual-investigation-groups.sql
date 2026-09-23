-- User."investigationGroups" — each doctor's own investigation groups
-- ([{ "name": "...", "tests": ["...", ...] }]), made in Advised tests /
-- investigation → "Investigations group" (physician's request, 2026-09-24).
--
-- Additive and idempotent: every existing user starts with an empty list and
-- nothing else is touched.
--
-- Run with:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/manual-investigation-groups.sql

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "investigationGroups" JSONB NOT NULL DEFAULT '[]'::jsonb;
