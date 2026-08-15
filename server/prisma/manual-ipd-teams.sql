-- "new correction 2.docx" #2: IPD wards and their teams.
--
-- A Ward belongs to one doctor's practice; every admission on that ward is
-- under the ward's team, and each member carries their own permission keys.
-- IpdAdmission gains a nullable wardId — existing admissions keep their
-- free-typed "wardNo" text and simply belong to no ward until re-assigned,
-- so nothing already recorded is moved or lost.
--
-- Additive and idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS "Ward" (
  "id"        TEXT PRIMARY KEY,
  "doctorId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Ward_doctorId_fkey" FOREIGN KEY ("doctorId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Ward_doctorId_name_key" ON "Ward"("doctorId", "name");
CREATE INDEX IF NOT EXISTS "Ward_doctorId_idx" ON "Ward"("doctorId");

CREATE TABLE IF NOT EXISTS "IpdTeamMember" (
  "id"          TEXT PRIMARY KEY,
  "wardId"      TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status"      TEXT NOT NULL DEFAULT 'active',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IpdTeamMember_wardId_fkey" FOREIGN KEY ("wardId")
    REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IpdTeamMember_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "IpdTeamMember_wardId_userId_key" ON "IpdTeamMember"("wardId", "userId");
CREATE INDEX IF NOT EXISTS "IpdTeamMember_wardId_idx" ON "IpdTeamMember"("wardId");
CREATE INDEX IF NOT EXISTS "IpdTeamMember_userId_idx" ON "IpdTeamMember"("userId");

-- Link an admission to a ward. SET NULL on delete: removing a ward must never
-- delete an admitted patient's record, it only unlinks it.
ALTER TABLE "IpdAdmission" ADD COLUMN IF NOT EXISTS "wardId" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IpdAdmission_wardId_fkey'
  ) THEN
    ALTER TABLE "IpdAdmission"
      ADD CONSTRAINT "IpdAdmission_wardId_fkey" FOREIGN KEY ("wardId")
      REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IpdAdmission_wardId_idx" ON "IpdAdmission"("wardId");

-- Tables created as the postgres superuser are owned by it; the app connects as
-- exhort_user and would get 42501 permission denied without this.
ALTER TABLE "Ward" OWNER TO exhort_user;
ALTER TABLE "IpdTeamMember" OWNER TO exhort_user;
