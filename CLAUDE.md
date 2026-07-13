# Muqsit Health System — CLAUDE.md

## ⚕️ PRIME DIRECTIVE — THIS IS MEDICAL SOFTWARE

Doctors prescribe real medication to real patients through this system. **Every change is held to a 100%-accuracy, patient-safety-first standard.** Non-negotiable rules:

1. **Never invent or guess clinical content.** Formulas, reference ranges, units, drug dosing conventions, score interpretations — verify against the published/established source before writing them. If a value cannot be verified, ask the user (a physician) instead of approximating. A wrong cutoff in a calculator or a wrong unit on a printout can harm a patient.
2. **Never silently lose or transform patient data.** No destructive migration without an idempotent, reviewed SQL script. No dedupe/merge logic that can drop a finding. Deleting patient-visible data always needs an explicit user action, a confirm affordance, and (where built) an Undo.
3. **Scoping is a safety boundary.** A doctor must never see another practice's patients except through the explicit Assistant (workstation) or Supervised-doctor mechanisms. Every new server query touching patient data MUST be doctor-scoped (see server/CLAUDE.md). Patient DELETE stays owner-only, always.
4. **Print/PDF output is a legal medical document.** Prescriptions and reports must fit the printable page, never overlap or truncate values, and show exactly what the doctor entered. Test the print preview after touching `prescriptionDoc.ts` or any download.
5. **International professional healthcare UX.** Calm clinical visual language (the `C` palette), no accidental-destruction paths, clear empty/loading/error states, forgiving inputs (flexible date entry, shorthand parsing), and graceful behavior on flaky networks (silent retry, never a false "you have no access" wall).
6. **Verify before claiming done.** Minimum bar for every change: `npx tsc --noEmit` clean in each touched app, the affected flow exercised (locally at :3000/:4000), and honest reporting if anything was not verified.
7. **Keep these CLAUDE.md files current.** Every MAJOR change — a new feature, a new domain concept, a new data format/protocol, a changed access rule, a new workflow or gotcha — must update the relevant CLAUDE.md (root and/or the app's) in the same commit. Stale guidance in a medical system is a hazard: the next session will follow it.

## What this is

A prescription & practice-management platform for doctors in Bangladesh:

| App | Stack | Port | Purpose |
|---|---|---|---|
| `client/` | Next.js 14 (App Router) + React Query | 3000 | Doctor app — prescription editor, OPD/IPD, patients, records, chat, mirroring |
| `admin/` | Next.js 14 | 3001 | Admin — registrations, account tiers (primary/secondary/premium) |
| `server/` | NestJS 10 + Prisma 5.22 + PostgreSQL | 4000 | REST API under `/api`, cookie auth, uploads, SSE mirror |

Each app has its own `package.json`; the root one only orchestrates (`concurrently`). `FUNCTIONAL-AUDIT.md` at the root is the living audit/TODO of what works, what's a stub and what doesn't persist — check it when picking up loose ends.

## Commands

```bash
# root
npm run dev              # api + web + admin together (concurrently)
npm run install:all      # npm install in all three apps

# server (from server/)
npm run start:dev        # nodemon dev server on :4000
npm run build            # nest build
npx tsc --noEmit -p tsconfig.json   # typecheck (ALWAYS before commit)

# client / admin (from client/ or admin/)
npm run dev              # :3000 / :3001
npm run build            # next build (also typechecks)
npx tsc --noEmit         # fast typecheck (ALWAYS before commit)
```

There is no meaningful automated test suite; the safety net is typecheck + manual flow verification. Do not claim tests passed.

## Database & migrations (READ THIS — unusual setup)

- **One shared PostgreSQL lives on the VPS** (`194.233.82.156`). Local dev reaches it through an SSH tunnel the **user** runs: `ssh -L 5432:localhost:5432 root@<vps> -N`. `P1001 Can't reach database server` = the tunnel dropped → ask the user to bring it up; it is never a code bug.
- **Prisma Migrate is NOT used.** Schema changes = ① edit `schema.prisma`, ② write an **idempotent** SQL file `server/prisma/manual-<name>.sql` (`ADD COLUMN IF NOT EXISTS …`), ③ apply with `npx prisma db execute --file prisma/manual-<name>.sql --schema prisma/schema.prisma`, ④ regenerate the client. The full migration history is the `manual-*.sql` files themselves (~20 of them) — a file existing does NOT guarantee it was applied; verify against the DB when in doubt (`manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` were written as optional and may be unapplied).
- Because the DB is shared, applying a migration locally **also migrates production**. Only additive, idempotent changes.
- **Windows DLL lock:** `prisma generate` fails (EPERM on the query-engine DLL) while the dev server runs. Kill the process on :4000 first (`netstat -ano | grep :4000` → `taskkill //F //PID <pid>`), generate, restart.
- Tables created as the `postgres` superuser need `ALTER TABLE "X" OWNER TO exhort_user;` or the app gets `42501 permission denied`. `ALTER TABLE` on existing tables is fine.

## Deployment — automatic, never manual

Every push to `main` triggers `.github/workflows/deploy.yml`: SSH to the VPS (`/root/muqsit`), `git pull`, install+build client/server (+admin non-fatally), `pm2 restart all`. Takes ~2–3 min; watch the GitHub Actions tab. **Never instruct manual deploys.** The workflow does NOT run DB migrations — those are applied through the tunnel as above. Prod URLs: `muqsithealthsystem.com` (client), `api.muqsithealthsystem.com/api` (API), `admin.muqsithealthsystem.com` (admin).

## Domain concepts (shared vocabulary)

- **Account tiers:** `primary`/`premium` own a practice ("workstation"); `secondary` can only work as someone's assistant (upgrade gate otherwise). New signups start `secondary`; admin app promotes.
- **Workstation:** the practice a request acts on. Client sends `X-Workstation: <doctorId>`; server resolves owner/assistant + permissions. See server/CLAUDE.md.
- **Assistant:** a user another doctor added (`Assistant` table) with granted permission keys; works inside that doctor's workstation.
- **Supervised doctor (4.docx):** per-PATIENT link (`PatientSupervisor`). The supervisor logs into **their own** account, finds the patient by mobile ("SUPERVISED" badge), sees patient info (records/summaries/history) but **never** the owner's prescriptions or draft, and prescribes fresh under their own `doctorId`. No workstation involved.
- **Visit-date model:** the prescription header Date (`ptDate`) stamps investigation findings, on-examination entries, and drug history. Drug history splits Current vs Distant-past **by date**, automatically, on the next visit.
- **Incomplete prescription:** editor auto-saves per-doctor drafts; a patient with content but no "Save & print" carries `incompleteRx` and shows an Incomplete badge in OPD; printing completes it.

## Cross-cutting conventions

- Dates shown/stored in strings are `dd/mm/yyyy`; `ptDate` is ISO internally (`isoToDdmmyyyy` to convert). Flexible input: `ddmmyy` shorthand (e.g. `030626`).
- Commit messages: conventional-commit style (`fix(scope): …`), ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work lands directly on `main` (user-authorized); push after every verified change.
- The user (product owner, a physician) communicates in Bangla — reply in Bangla; keep code/comments in English.
- Per-app details live in `client/CLAUDE.md`, `server/CLAUDE.md`, `admin/CLAUDE.md` — read the one for the area you touch.
