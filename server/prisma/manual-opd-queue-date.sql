-- OPD queue by day (physician's sheet, 28/10/2026): a patient can be booked for
-- today or a later day, a day's patients have an order the doctor can change, and
-- each day has its own chamber schedule. See OpdVisit.queueDate / position and the
-- OpdDaySetting model in schema.prisma.
--
-- ⚕️ ADDITIVE AND IDEMPOTENT, with ONE replacement (below). This database is
-- SHARED with production (root CLAUDE.md), so applying this through the tunnel
-- migrates production too. Apply it BEFORE the release that reads it is deployed:
-- the queue reads and writes `queueDate` / `position`, and without them every OPD
-- request would fail.
--
--   npx prisma db execute --file prisma/manual-opd-queue-date.sql --schema prisma/schema.prisma
--
-- What it does to the rows that exist: nothing is deleted or rewritten. Each
-- OpdVisit gets the Dhaka day it was CREATED on as its `queueDate` and its arrival
-- order within that doctor's day as its `position` — only where it has none, so a
-- second run changes nothing. A row an older build writes between this script and
-- the deploy has neither; the new code reads such a row as the day it was created.

-- 1. The day a visit is booked for (Dhaka calendar day, yyyy-mm-dd) and its place.
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "queueDate" TEXT;
ALTER TABLE "OpdVisit" ADD COLUMN IF NOT EXISTS "position" INTEGER;

-- 2. Backfill the day from `createdAt`. Bangladesh is a fixed UTC+6 with no DST
--    (the same arithmetic as src/opd/dhaka-day.ts and manual-opd-token-unique.sql).
UPDATE "OpdVisit"
   SET "queueDate" = to_char(("createdAt" + interval '6 hours')::date, 'YYYY-MM-DD')
 WHERE "queueDate" IS NULL;

-- 3. Backfill the place: arrival order within the doctor's day, after any place
--    already given there (so a second run, or a day that already has some,
--    never repeats a number).
UPDATE "OpdVisit" v
   SET "position" = COALESCE(m."mx", 0) + r."rn"
  FROM (
         SELECT "id", "doctorId" AS "d", "queueDate" AS "q",
                row_number() OVER (PARTITION BY "doctorId", "queueDate" ORDER BY "createdAt", "id") AS "rn"
           FROM "OpdVisit"
          WHERE "position" IS NULL AND "queueDate" IS NOT NULL
       ) r
  LEFT JOIN (
         SELECT "doctorId", "queueDate", max("position") AS "mx"
           FROM "OpdVisit"
          GROUP BY "doctorId", "queueDate"
       ) m ON m."doctorId" = r."d" AND m."queueDate" = r."q"
 WHERE v."id" = r."id";

CREATE INDEX IF NOT EXISTS "OpdVisit_doctorId_queueDate_position_idx"
  ON "OpdVisit" ("doctorId", "queueDate", "position");

-- 4. THE ONE REPLACEMENT. manual-opd-token-unique.sql (if it was applied) makes a
--    token unique per doctor and per day of `createdAt`. A patient booked today
--    for a LATER day is written today, so the later day's first token (T-01)
--    would collide with today's T-01 and the booking would be refused. The token
--    is per QUEUE day now: drop that index and keep the same guarantee on the day
--    the visit is booked for. Rows with no `queueDate` (written by an older
--    build) are not covered by it, as NULLs never are. If a duplicate token for
--    one doctor and day already exists the new index cannot be built; that is
--    reported, not forced — the app allocates tokens under a lock and does not
--    need it to be correct.
DROP INDEX IF EXISTS "OpdVisit_doctor_day_token_key";

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "OpdVisit_doctorId_queueDate_token_key"
    ON "OpdVisit" ("doctorId", "queueDate", "token");
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'OpdVisit_doctorId_queueDate_token_key NOT created: a doctor has two visits with one token on one day. De-duplicate them, then run this script again.';
END $$;

-- 5. A day's chamber schedule: when the first patient is seen, an optional break,
--    and the minutes set aside for each patient. One row per doctor per day.
CREATE TABLE IF NOT EXISTS "OpdDaySetting" (
  "id"                TEXT NOT NULL,
  "doctorId"          TEXT NOT NULL,
  "day"               TEXT NOT NULL,
  "startTime"         TEXT NOT NULL,
  "breakStart"        TEXT,
  "breakEnd"          TEXT,
  "minutesPerPatient" INTEGER NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpdDaySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpdDaySetting_doctorId_day_key"
  ON "OpdDaySetting" ("doctorId", "day");

-- Tables created as the postgres superuser are unreadable by the app without
-- this (42501 permission denied) — see root CLAUDE.md.
ALTER TABLE "OpdDaySetting" OWNER TO exhort_user;
