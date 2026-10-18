-- "Revision Notes" (physician's sheet, 18/10/2026, item 4): one notebook per
-- signed-in user.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT. This database is SHARED with production (root
-- CLAUDE.md), so applying this through the tunnel migrates production too.
-- It creates one new table and touches nothing that exists.
--
--   npx prisma db execute --file prisma/manual-revision-notes.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "DoctorRevisionNote" (
  "id"        TEXT NOT NULL,
  -- the signed-in user who owns it — never the workstation doctor
  "userId"    TEXT NOT NULL,
  "html"      TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DoctorRevisionNote_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DoctorRevisionNote_userId_fkey') THEN
    ALTER TABLE "DoctorRevisionNote"
      ADD CONSTRAINT "DoctorRevisionNote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DoctorRevisionNote_userId_key"
  ON "DoctorRevisionNote" ("userId");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "DoctorRevisionNote" OWNER TO exhort_user;
