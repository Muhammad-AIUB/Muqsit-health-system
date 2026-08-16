-- 5.docx feature: prescribing habit suggestions ("my usual dose") in the ℞ pad.
--
-- DoctorRxHabit is a DERIVED table: one row per (doctor, medicine incl.
-- strength, whole instruction block), written after a prescription commits and
-- fully rebuildable from the record via server/scripts/rebuild-rx-habits.js.
-- It never writes back to Prescription / PrescriptionItem, so nothing already
-- recorded is moved, rewritten or lost by this migration.
--
-- Additive and idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS "DoctorRxHabit" (
  "id"           TEXT PRIMARY KEY,
  "doctorId"     TEXT NOT NULL,

  -- Matching keys: typography-normalised only. Two strengths never fold, and a
  -- parenthesised form qualifier ("Tablet (Enteric Coated).") stays in the key.
  "drugKey"      TEXT NOT NULL,   -- "tablet. napa 500mg"
  "searchKey"    TEXT NOT NULL,   -- "napa 500mg" (form prefix stripped)
  "drugLabel"    TEXT NOT NULL,   -- "Tablet. Napa 500mg" — what gets inserted

  -- The instruction block, echoed verbatim from a saved prescription.
  "signature"    TEXT NOT NULL,
  "algoVersion"  INTEGER NOT NULL DEFAULT 1,
  "dose"         TEXT NOT NULL,
  "food"         TEXT NOT NULL,
  "duration"     TEXT NOT NULL,
  "contLines"    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- DISTINCT PATIENTS, not prescriptions.
  "patientCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"   TIMESTAMP(3) NOT NULL,

  "pinned"       BOOLEAN NOT NULL DEFAULT false,
  "hidden"       BOOLEAN NOT NULL DEFAULT false,

  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DoctorRxHabit_doctorId_fkey" FOREIGN KEY ("doctorId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The upsert key for the write path.
CREATE UNIQUE INDEX IF NOT EXISTS "DoctorRxHabit_doctorId_drugKey_signature_key"
  ON "DoctorRxHabit"("doctorId", "drugKey", "signature");

-- The read path: searchKey LIKE 'prefix%' scoped to one doctor.
--
-- TWO indexes, and the second one is not redundant. Verified on this database
-- with EXPLAIN on 2026-08-17:
--
--   plain btree        → Index Cond: ("doctorId" = $1)
--                        Filter:     ("searchKey" ~~ 'ta%')      ← scans the doctor
--   text_pattern_ops   → Index Cond: ("doctorId" = $1 AND
--                                     "searchKey" ~>=~ 'ta' AND ~<~ 'tb')
--
-- The design assumed a plain btree would serve the prefix because this
-- database's collation is C.UTF-8. It does not: Postgres only treats a
-- collation as pattern-safe when it is exactly "C" or "POSIX", and "C.UTF-8"
-- is a different glibc locale. Without text_pattern_ops the prefix degrades to
-- a scan of every habit the doctor has ever accumulated, on every keystroke,
-- while a patient is in the chair.
--
-- The plain index is kept because it is what `@@index([doctorId, searchKey])`
-- in schema.prisma declares, and because it serves ordering by doctor. Write
-- cost is irrelevant on a table written once per saved prescription.
CREATE INDEX IF NOT EXISTS "DoctorRxHabit_doctorId_searchKey_idx"
  ON "DoctorRxHabit"("doctorId", "searchKey");
CREATE INDEX IF NOT EXISTS "DoctorRxHabit_doctorId_searchKey_pattern_idx"
  ON "DoctorRxHabit"("doctorId", "searchKey" text_pattern_ops);

-- Not created by this feature, but depended on by it: PrescriptionItem has no
-- index on its foreign key (pg_indexes showed only PrescriptionItem_pkey), and
-- the rebuild script reads every prescription's items. listByPatient already
-- joins them today, so this helps an existing path too.
CREATE INDEX IF NOT EXISTS "PrescriptionItem_prescriptionId_idx"
  ON "PrescriptionItem"("prescriptionId");

-- Tables created as the postgres superuser are owned by it; the app connects as
-- exhort_user and would get 42501 permission denied without this.
ALTER TABLE "DoctorRxHabit" OWNER TO exhort_user;
