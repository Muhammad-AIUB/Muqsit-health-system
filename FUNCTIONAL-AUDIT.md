# Muqsit Health System — Functional Audit & TODO

Audit of what works, what doesn't persist, and what's a stub. Updated as items are fixed.

## 0. Operational
- [ ] **Restart API server** — stop it, run `npx prisma generate` in `server/`, then `npm run dev`.
      New columns (`hmSelectedDrugs`, `familyMembers`, `favouriteInvestigations`, `IpdAdmission.clinical`)
      are live in Postgres but the running NestJS process still uses the old Prisma client.
      All saves silently succeed in Postgres but new columns won't be read back until after restart.

## 1. Not persisted (in-memory only — "save & reload = gone")
- [x] **Family tree** (`familyMembers`) — now saved to `Patient.familyMembers` (JSONB). Loaded on patient open.
- [x] **Health-monitoring drug selections** (`hmDrugs`) — now saved to `Patient.hmSelectedDrugs` (TEXT[]). Loaded on patient open.
- [ ] **Supervising doctor list** — hardcoded mock; add/edit/delete not wired.
- [ ] **Investigation / report images** (base64 `invImages` pool) — findings *text* persists; uploaded **images**
      are session-only. (Bigger fix: upload to the VPS `/uploads`, store URLs.)
- [ ] **On-examination vitals** (OE popup, `OeData`) — folded into investigation text, not stored structured.

## 2. Stub buttons / placeholder views
- [ ] **Message** tab — placeholder, no messaging.
- [ ] **Research companion → Compare / Export** — no click handlers.
- [ ] **Health monitoring → "Export Patient's Data"** card — decorative.
- [ ] **Patient Settings → Data security level** — disabled placeholder.
- [x] **Settings → Badges / Supervisors & role models** — intentionally disabled ("Coming soon").

## 3. By design (not a bug)
- ~~Prescription draft saves only on **Save & print**~~ — **now auto-saved server-side.** The whole editor
  (header + clinical sections + investigation findings + medicines + advice) is debounced-saved to
  `PrescriptionDraft` (one row per doctor) and re-hydrated on reload, so a refresh no longer loses work.
  Save & print still creates the permanent prescription record.
- Investigation findings added via the popup now log to the activity feed (Notification section) on every
  add path — including closing the popup, not just the per-test "Add" button.

## Fix order (this pass)
1. Health-monitoring drug selections — persist on the patient.
2. Family tree — persist on the patient.
3. Supervising doctor list — real add/edit/delete on the patient.
4. Research Export — client-side CSV.
5. Investigation/report image persistence (VPS upload) — larger, separate.
