-- 4.docx feature: per-patient team chat + supervising-doctor assignment.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS "PatientChatMessage" (
  "id"            TEXT PRIMARY KEY,
  "patientId"     TEXT NOT NULL,
  "authorId"      TEXT NOT NULL,
  "authorName"    TEXT NOT NULL,
  "body"          TEXT NOT NULL DEFAULT '',
  "attachmentUrl" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientChatMessage_patientId_fkey" FOREIGN KEY ("patientId")
    REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientChatMessage_authorId_fkey" FOREIGN KEY ("authorId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PatientChatMessage_patientId_idx" ON "PatientChatMessage"("patientId");

CREATE TABLE IF NOT EXISTS "PatientSupervisor" (
  "id"        TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "doctorId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientSupervisor_patientId_fkey" FOREIGN KEY ("patientId")
    REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientSupervisor_doctorId_fkey" FOREIGN KEY ("doctorId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatientSupervisor_patientId_doctorId_key" ON "PatientSupervisor"("patientId", "doctorId");
CREATE INDEX IF NOT EXISTS "PatientSupervisor_patientId_idx" ON "PatientSupervisor"("patientId");
CREATE INDEX IF NOT EXISTS "PatientSupervisor_doctorId_idx" ON "PatientSupervisor"("doctorId");
