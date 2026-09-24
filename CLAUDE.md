# Muqsit Health System — CLAUDE.md

## ⚕️ PRIME DIRECTIVE — medical software, patient safety first
Doctors in Bangladesh prescribe real medication through this. These rules beat every skill and every default:
1. **Never invent or guess clinical content** (formulas, ranges, units, dosing, score cutoffs, alert text). Verify against the source or ask the user (a physician).
2. **Never silently lose or transform patient data.** No destructive migration, no dedupe that can drop a finding; deleting needs an explicit action + confirm (+ Undo where built).
3. **Scoping is a safety boundary.** Every patient-data query is doctor-scoped; cross-practice access only via Assistant (workstation) or Supervised doctor. Patient DELETE is owner-only, always.
4. **Print/PDF is a legal document.** Fits the page, never truncates, shows exactly what was entered. Check print preview after touching `client/src/lib/prescriptionDoc.ts`.
5. **Calm clinical UX:** `C` palette, clear empty/loading/error states, forgiving input, silent retry on flaky networks.
6. **Verify before claiming done:** typecheck + both test suites + the flow exercised at :3000/:4000; report honestly what was not verified.
7. **Keep the CLAUDE.md files and `docs/DOMAIN.md` current** in the same commit as any major change.

## Project Snapshot
- Monorepo, three apps with their own `package.json`; root only orchestrates (`concurrently`).
- `client/` Next.js 14 + React Query (:3000, doctor app) · `admin/` Next.js 14 (:3001) · `server/` NestJS 10 + Prisma 5 + PostgreSQL (:4000, REST under `/api`, cookie JWT).
- Request flow: `client/src/lib/api.ts#apiFetch` (sends `X-Workstation`) → Nest controller (`JwtAuthGuard, WorkstationGuard`) → `@WorkstationDoctorId()` → service → `PrismaService`.

## Commands
```bash
npm run install:all                       # root: install all three apps
npm run dev                               # root: api + web + admin together
npm run build                             # root: build server, client, admin
cd server && npm run start:dev            # nodemon API on :4000
cd server && npm test                     # jest, *.spec.ts beside the code in src/
cd server && npx tsc --noEmit -p tsconfig.json
cd server && npm run lint                 # eslint --fix
cd server && npm run format               # prettier
cd client && npm run dev                  # :3000 (admin: same, :3001)
cd client && npm test                     # vitest run, *.test.ts(x) beside the code
cd client && npx tsc --noEmit             # same in admin/
npx prisma db execute --file prisma/manual-<name>.sql --schema prisma/schema.prisma   # from server/
```
- `client`/`admin` `npm run lint` is `next lint` but no ESLint config exists there — TODO: verify before relying on it.
- New `.ts` outside `server/src/` moves the build output and 502s prod: run `cd server && rm -rf dist && npm run build && ls dist/main.js`.

## Architecture & Conventions
- **Server:** one Nest module per domain in `server/src/<domain>/` (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`). `ValidationPipe({ whitelist: true })` drops any field not declared on the DTO.
- **Client:** App Router pages are thin shells → `src/components/Muqsit.tsx` → `TabRouter.tsx`; editor state in one store, `src/context/MuqsitContext.tsx`; server state in `src/hooks/use*.ts` (React Query); pure clinical logic in `src/lib/*.ts` with a co-located `*.test.ts`.
- **Clinical logic gets a unit test** (same-medicine matching, offered doses, which alert fires). A red test is a clinical regression — check the source before changing the expectation.
- **DB:** one shared PostgreSQL on the VPS, reached through an SSH tunnel the user runs. `P1001` = tunnel down, ask the user; not a code bug. Applying a migration locally migrates production.
- **Deploy:** push to `main` → `.github/workflows/deploy.yml` builds and `pm2 restart all` (~2–3 min). It does not run migrations. If a VPS `package-lock.json` drift blocks `git pull`: SSH in, `git checkout -- <app>/package-lock.json`, re-run the Action.
- **Dates:** stored/shown `dd/mm/yyyy`, `ptDate` is ISO; `ddmmyy` shorthand accepted.
- **Git identity:** every commit and push as `Muhammad-AIUB <mjubayer.aiub@gmail.com>`. The machine's default is wrong — check `git config user.email` and `gh auth status` before committing and before pushing.
- Commits: conventional (`fix(scope): …`), ending `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Every route change updates `docs/API.md` in the same commit.
- Reply to the user (a physician) in Bangla; code and comments stay English.

## Patterns We Do Not Use
- We do not run `npm run prisma:migrate` / Prisma Migrate. Edit `schema.prisma`, write an idempotent `server/prisma/manual-<name>.sql` (`IF NOT EXISTS`), apply with `db execute`, regenerate — the DB is shared with production, so only additive changes.
- We do not run `prisma generate` with the API up. Kill the :4000 process first — Windows locks the query-engine DLL (EPERM).
- We do not take the doctor from `req.user.id` or a request body. Use `@WorkstationDoctorId()` — `WorkstationGuard` is the only place that decides whose practice a request acts on.
- We do not resolve a practice again inside a service. Pass the resolved `doctorId` in — a second resolver leaked another practice's activity feed (fixed 2026-08-27).
- We do not add a client field without adding it to the DTO — otherwise it is "saved" and silently dropped.
- We do not assume a `manual-*.sql` file was applied. Check the DB — `manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` may still be unapplied.
- We do not leave a table created as `postgres` with that owner. Run `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.
- We do not parse a stored date with `new Date(str)`. Use `client/src/lib/dateInput.ts` — JS reads `03/06/2026` as 6 March.
- We do not put `medicines` in `schema.prisma`. It is a raw table queried with parameterised `$queryRaw`.
- We do not reword, add or "fix" entries in `client/src/data/rxAlerts.ts`. Every message is verbatim from the physician's rule sheets.
- We do not print or persist prescribing alerts. They are derived live; `prescriptionDoc.ts` has no alert input, pinned by tests (physician's decision).
- We do not `increment: 1` a habit/phrase `patientCount`. It counts distinct patients, taken from the record.
- We do not let a derived-feature write fail a prescription save. It runs awaited, in try/catch, after `prescription.create`.
- We do not hard-delete clinical documents or add DELETE routes for learned suggestions. Use soft removal (`removedAt`) / `hidden`.
- We do not extend `WorkstationsService.resolve` for IPD ward-team logins. That would hand a ward nurse the whole practice's OPD records.
- We do not send new per-admission data through the IPD `clinical` PATCH. It replaces the whole column; give it its own route (see `/ipd/:id/analogue`).
- We do not store upload URLs minted on localhost. The dev DB is production; `upload.service.ts` refuses them.
- We do not instruct manual deploys or builds on the VPS. Push to `main`; only DB migrations are manual.
- We do not enable the ECC plugin in this repo. Its hooks have not been checked against these safety rules.

## Read First
- `docs/DOMAIN.md` — every domain concept (workstation, assistant, supervised doctor, wards, habits, alerts, drug-history mirror…) with the physician's decisions behind it.
- `server/CLAUDE.md` — the access table, scoping rules, auth and upload gotchas; required before any server change.
- `client/CLAUDE.md` — clinical-accuracy rules for alerts, habits, printing, dates; required before any client change. (`admin/CLAUDE.md` for the admin app.)
- `FUNCTIONAL-AUDIT.md` — what works, what is a stub, and the "Open threads" awaiting product-owner decisions; read at session start.

---
This file is a living document. Whenever an implementation gets rejected or corrected during a task, add the lesson to 'Patterns We Do Not Use' — a rule plus its reason, not just a prohibition.
