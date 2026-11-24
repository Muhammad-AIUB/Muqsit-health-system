-- Advice and Advised tests saved on a prescription template (24/11/2026).
-- See PrescriptionTemplate.advice / .adviceTest in schema.prisma.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It adds two JSONB columns with an empty-list default and touches nothing that
-- exists: every template already saved keeps its medicines and reads as having
-- no advice. Apply it BEFORE the release that reads it — every read of a
-- template asks for these columns, so without them GET /prescription-templates
-- fails (P2022).
--
--   npx prisma db execute --file prisma/manual-template-advice.sql --schema prisma/schema.prisma

ALTER TABLE "PrescriptionTemplate" ADD COLUMN IF NOT EXISTS "advice"     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PrescriptionTemplate" ADD COLUMN IF NOT EXISTS "adviceTest" JSONB NOT NULL DEFAULT '[]';
