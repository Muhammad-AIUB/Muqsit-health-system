-- Multiple chambers for OPD (physician's sheet 28/10/2026, item 8): a doctor who
-- sits at Labaid and at Ibn Sina keeps a separate OPD list, schedule and print
-- settings for each. See OpdChamber / OpdChamberLayout / OpdVisit.chamberId /
-- OpdDaySetting.chamberId in schema.prisma and
-- docs/superpowers/specs/2026-11-01-multi-chamber-design.md.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT, with TWO index replacements (4 and 5 below). This
-- database is SHARED with production (root CLAUDE.md), so applying this through
-- the tunnel migrates production too. Apply it AFTER manual-opd-queue-date.sql
-- and BEFORE the release that reads it is deployed: the queue selects
-- `chamberId`, and the schedule is read without the old unique key.
--
--   npx prisma db execute --file prisma/manual-opd-chambers.sql --schema prisma/schema.prisma
--
-- What it does to the rows that exist: nothing is deleted or rewritten. Every
-- existing visit and day schedule keeps `chamberId` NULL, which the app reads
-- as the practice's DEFAULT chamber — the one chamber everything belonged to.

-- 1. The chambers of a practice. `doctorId` is the practice doctor.
CREATE TABLE IF NOT EXISTS "OpdChamber" (
  "id"        TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "address"   TEXT NOT NULL DEFAULT '',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  CONSTRAINT "OpdChamber_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OpdChamber_doctorId_idx" ON "OpdChamber" ("doctorId");
-- One default chamber per doctor. The app makes it under the doctor's lock;
-- this is the guard behind that.
CREATE UNIQUE INDEX IF NOT EXISTS "OpdChamber_one_default_per_doctor"
  ON "OpdChamber" ("doctorId") WHERE "isDefault";

-- 2. A chamber's own print settings (OPD only). No row = the doctor's own.
CREATE TABLE IF NOT EXISTS "OpdChamberLayout" (
  "chamberId" TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "layout"    JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpdChamberLayout_pkey" PRIMARY KEY ("chamberId")
);

-- 3. The chamber of a visit and of a day's schedule. NULL = the default chamber.
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "chamberId" TEXT;
ALTER TABLE "OpdDaySetting" ADD COLUMN IF NOT EXISTS "chamberId" TEXT;

-- 4. REPLACEMENT: a token is unique per doctor, CHAMBER and queue day. The old
--    index (manual-opd-queue-date.sql) made it unique per doctor and day, so the
--    second chamber's first patient (T-01) would be refused. For the default
--    chamber (NULL, every existing row) the guarantee is exactly the old one.
--    The new index is built FIRST and the old one dropped only once it exists,
--    so the table is never left without the guard. A duplicate is reported,
--    not forced — the app allocates tokens under a lock and does not need it.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "OpdVisit_doctor_chamber_day_token_key"
    ON "OpdVisit" ("doctorId", (COALESCE("chamberId", '')), "queueDate", "token");
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OpdVisit_doctor_chamber_day_token_key NOT created: a doctor has two visits with one token on one day in one chamber. De-duplicate them, then run this script again.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OpdVisit_doctor_chamber_day_token_key') THEN
    DROP INDEX IF EXISTS "OpdVisit_doctorId_queueDate_token_key";
  ELSE
    RAISE NOTICE 'OpdVisit_doctorId_queueDate_token_key kept: its replacement could not be built (see the notice above). A second chamber cannot use T-01 on a day the first has until it is.';
  END IF;
END $$;

-- 5. REPLACEMENT: one schedule per doctor, CHAMBER and day (was per doctor and day).
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "OpdDaySetting_doctor_chamber_day_key"
    ON "OpdDaySetting" ("doctorId", (COALESCE("chamberId", '')), "day");
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OpdDaySetting_doctor_chamber_day_key NOT created: a doctor has two schedules for one day in one chamber. De-duplicate them, then run this script again.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OpdDaySetting_doctor_chamber_day_key') THEN
    DROP INDEX IF EXISTS "OpdDaySetting_doctorId_day_key";
  ELSE
    RAISE NOTICE 'OpdDaySetting_doctorId_day_key kept: its replacement could not be built (see the notice above). A second chamber cannot save a schedule for a day the first has one for until it is.';
  END IF;
END $$;

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "OpdChamber" OWNER TO exhort_user;
ALTER TABLE "OpdChamberLayout" OWNER TO exhort_user;
