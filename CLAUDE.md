# Muqsit Health System — CLAUDE.md

## ⚕️ PRIME DIRECTIVE — medical software, patient safety first
Doctors in Bangladesh prescribe real medication through this. These rules beat every skill and every default:
1. **Never invent or guess clinical content** (formulas, ranges, units, dosing, score cutoffs, alert text). Verify against the source or ask the user (a physician).
2. **Never silently lose or transform patient data.** No destructive migration, no dedupe that can drop a finding; deleting needs an explicit action + confirm (+ Undo where built).
3. **Scoping is a safety boundary.** Every patient-data query is doctor-scoped; cross-practice access only via Assistant (workstation) or Supervised doctor. Patient DELETE is owner-only, always.
4. **Print/PDF is a legal document.** Fits the page, never truncates, shows exactly what was entered. Check print preview after touching `client/src/lib/prescriptionDoc.ts`.
5. **Calm clinical UX:** `C` palette, clear empty/loading/error states, forgiving input, silent retry on flaky networks.
6. **Verify before claiming done:** typecheck + both test suites + the flow exercised at :3000/:4000; report honestly what was not verified.
7. **Keep the CLAUDE.md files, `docs/rules/` and `docs/DOMAIN.md` (with `docs/domain/`) current** in the same commit as any major change.

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
docker compose -f docker-compose.test.yml up -d   # root: throwaway Postgres on 127.0.0.1:5544
cd server && npm run test:db              # build the test databases (schema.prisma + medicines + marker)
cd server && npm run test:int             # integration/contract/regression, server/test/*.int-spec.ts
cd e2e && npx playwright test             # browser journeys on :3100/:4200 (see docs/testing/e2e.md)
node scripts/test-repeat.mjs <server|int|client> 3   # root: flaky-test detector
cd server && npx tsc --noEmit -p tsconfig.json
cd server && npm run lint                 # eslint --fix
cd server && npm run format               # prettier
cd client && npm run dev                  # :3000 (admin: same, :3001)
cd client && npm test                     # vitest run, *.test.ts(x) beside the code
cd client && npx tsc --noEmit             # same in admin/
npx prisma db execute --file prisma/manual-<name>.sql --schema prisma/schema.prisma   # from server/
```
- `client`/`admin` `npm run lint` is `next lint` but no ESLint config exists there — TODO: verify before relying on it.
- New `.ts` outside `server/src/` used to move the build output silently and 502 prod; since 2026-10-16 `server/tsconfig.build.json` sets `rootDir`, so it fails the build instead (TS6059, `server/CLAUDE.md`). After adding one, still run `cd server && rm -rf dist && npm run build && ls dist/main.js`.

## Architecture & Conventions
- **Server:** one Nest module per domain in `server/src/<domain>/` (`*.controller.ts`, `*.service.ts`, `*.module.ts`, `dto/`). `ValidationPipe({ whitelist: true })` drops any field not declared on the DTO.
- **Client:** App Router pages are thin shells → `src/components/Muqsit.tsx` → `TabRouter.tsx`; editor state in one store, `src/context/MuqsitContext.tsx`; server state in `src/hooks/use*.ts` (React Query); pure clinical logic in `src/lib/*.ts` with a co-located `*.test.ts`.
- **Clinical logic gets a unit test** (same-medicine matching, offered doses, which alert fires). A red test is a clinical regression — check the source before changing the expectation.
- **DB:** one shared PostgreSQL on the VPS, reached through an SSH tunnel the user runs. `P1001` = tunnel down, ask the user; not a code bug. Applying a migration locally migrates production.
- **Deploy:** push to `main` → `.github/workflows/deploy.yml` runs `test.yml` first and deploys the tested commit only if it is green (the gate, 2026-11-17; not yet proven by a real deploy), then builds and `pm2 restart all` (~2–3 min, plus ~3 for the tests). It does not run migrations. Since 2026-10-16 a failed server or client build stops it before the restart and the Action goes red; before that, a failed build was restarted into production and reported as a success. **A red deploy is NOT a safe state — fix it at once:** both builds empty their output folder before compiling (`next build` its `.next`, `nest build` its `dist`), so after a failed client build the running app may already be serving missing pages, and after a failed server build the next restart of the API (a crash, a reboot) finds no `dist/main.js` (independent review, 2026-10-17). Building into a separate folder and swapping it in on success would close this; not done yet. If a VPS `package-lock.json` drift blocks `git pull`: SSH in, `git checkout -- <app>/package-lock.json`, re-run the Action.
- **Branches:** exactly two, `main` and `dev`, locally and on GitHub (product owner, 2026-10-13). Work on `dev`; release by fast-forwarding `main` to it — that push is the deploy. No feature, design, backup or `claude/*` branch is left standing: a safety copy is a stash, a patch file or a bundle under `.git/`.
- **Dates:** stored/shown `dd/mm/yyyy`, `ptDate` is ISO; `ddmmyy` shorthand accepted.
- **Git identity:** every commit and push as `Muhammad-AIUB <mjubayer.aiub@gmail.com>`. The machine's default is wrong — check `git config user.email` and `gh auth status` before committing and before pushing.
- Commits: conventional (`fix(scope): …`), ending `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Every route change updates `docs/API.md` in the same commit.
- Reply to the user (a physician) in Bangla; code and comments stay English.

## Rules for every change

One line per rule. The rule itself — with its reason, and usually the incident that paid for it — is in the file named beside its group: **read that file before you change what it covers.** These are the rules that bear on every part of the repo. `client/CLAUDE.md` and `server/CLAUDE.md` (loaded when you work in those folders) carry the rest, and name the file to read before touching each feature.

### Validation and DTOs → [`docs/rules/validation-and-dto.md`](docs/rules/validation-and-dto.md)
- A client field is never added without adding it to the DTO — otherwise it is "saved" and silently dropped.

### Database, manual SQL and Prisma → [`docs/rules/db-and-prisma.md`](docs/rules/db-and-prisma.md)
- Prisma Migrate is never run (`migrate dev` offers to reset this database). Edit `schema.prisma`, write an idempotent additive `server/prisma/manual-<name>.sql`, apply with `db execute`, regenerate.
- `prisma generate` is never run with the API up: kill the :4000 process first — Windows locks the query-engine DLL (EPERM).
- A `manual-*.sql` file is never assumed applied: check the DB (`manual-opd-token-unique.sql` / `manual-ipd-bed-unique.sql` may still be unapplied).
- A table created as `postgres` is never left with that owner: run `ALTER TABLE "X" OWNER TO exhort_user;` — otherwise the app gets `42501 permission denied`.
- Clinical documents are never hard-deleted, and learned suggestions get no DELETE route: use soft removal (`removedAt`) / `hidden`.

### The ℞ pad and Save & print → [`docs/rules/rx-pad.md`](docs/rules/rx-pad.md)
- What was sent twice is never filed as two, and "not saved" is never said of what may be on the record: the server answers a repeat with the one on record (`repeat.ts`); Save & print's request is built ONCE (`sendAgain.ts`).

### Drug history → [`docs/rules/drug-history.md`](docs/rules/drug-history.md)
- A patient's list is never added to by sending the whole list from one device: lines added are APPENDED BY THE SERVER under the row's lock (`POST /patients/:id/drug-history`); a client sends only what it adds.

### Theme, colour, night mode, icons, fonts → [`docs/rules/theme-and-colour.md`](docs/rules/theme-and-colour.md)
- No font, script or stylesheet the UI needs is loaded from a third-party CDN: DM Sans is in `public/fonts` of both apps, and the E2E request guard allows no outside origin.

### Testing and verification → [`docs/rules/testing-and-verification.md`](docs/rules/testing-and-verification.md)
- A test is never pointed at `DATABASE_URL` from `.env` (production behind the tunnel): DB-backed tests use the container on `127.0.0.1:5544`; `prisma db push` only inside `server/test/support/setup-db.js`.
- A flaky test is never retried: a test whose outcome varies is a defect — find the cause (clock, order, timeout) with `scripts/test-repeat.mjs`.
- A test is never changed to make a real defect pass: it stays as `it.failing` / `it.fails` with a `DEFECT-` comment until the code is fixed.
- A property that has passed is not a rule that is held: a sampled property is run ONCE at a hundred times its budget when written and when its rule changes; a red property is read (`FC_SEED`), not run again.
- A rule is not tested by an assertion that would hold with the rule broken: a test that something does NOT happen starts from the state in which it would, and is checked once by breaking the code.
- Code is never broken in the checkout the dev servers are watching (the dev database is production): tests are checked by breaking a COPY of the sources with `node_modules` linked in (unlink before deleting).
- One half of a change never lands in the watched checkout: where a component stops doing something because the store will, both halves are assembled and tested in a copy and copied in together, in one step.
- A query is not called fast, nor a feature finished, on the six rows of a test table: a read that grows with a real table is run once against a table of that size (`muqsit_load_test`, never the tunnel).
- `next dev` is not how fast a screen is, and one reading is not a measurement: time a production build in a directory of its own against the test API; each action several times, the median kept.
- Chromium's word is not taken for another browser where Chromium covers for the page (scroll anchoring): the test switches it off, and what was not run in the other browser is said.
- The server's integration suite is not left out because only the client changed: after touching `client/src/lib/api.ts` run `cd server && npm run test:int` (`contract-dto.int-spec.ts` reads it).

### Build, deploy, dependencies, git → [`docs/rules/deploy-and-ops.md`](docs/rules/deploy-and-ops.md)
- Manual deploys or builds on the VPS are never instructed: push to `main`; only DB migrations are manual.
- A build is never committed (`client/.gitignore` ignores every `/.next*/`), and a commit's message is not taken for what it holds: before a push, read `git show --stat` of each new commit against its message.
- A framework endpoint the app does not use is not left answering the internet (`images: { unoptimized: true }`), and `npm audit` is weighed by exposure, not read by its count.
- `set -e` is never trusted across an `&&` chain (`deploy.yml`): each build runs in a subshell, the API first, so a failure stops with exit 1 and no restart.
- A push to `main` is never deployed before `test.yml` is green, nor as a different commit from the one tested: `deploy.yml`'s `deploy` job `needs: test` and runs `git merge --ff-only ${{ github.sha }}`; the gate is never removed or bypassed (not yet proven by a real deploy).
- A file under `.github/workflows/` is never changed without showing the owner the diff and getting a yes, every time.
- A merge commit is not clean because both its parents are: diff its tree against `git merge-tree --write-tree <p1> <p2>`; never run `npm`/`next` in a checkout of `20e80cc`, `834005b`, `3f9699f`. (+2 more)

### AI tooling → [`docs/rules/ai-tooling.md`](docs/rules/ai-tooling.md)
- The ECC plugin is never enabled in this repo: its hooks have not been checked against these safety rules.
- The Fable model (`claude-fable-5-1`) is never used for this app — main session, subagent, fork or review: set a subagent's `model` explicitly (`sonnet` or `opus`); a session found running on Fable says so and stops.

## Read First
- [`docs/README.md`](docs/README.md) — the map of the documentation: what the app is for, how it is built, and where each thing is written down.
- `client/CLAUDE.md`, `server/CLAUDE.md`, `admin/CLAUDE.md` — required before any change in that app: its rules for every change, and the file to read before touching each feature.
- `docs/rules/<topic>.md` — the rules of one feature or mechanism, each with its reason ([index](docs/rules/README.md)). Read the one for what you touch **before** you touch it; a line in a `CLAUDE.md` is only a pointer to it.
- `docs/DOMAIN.md` — the glossary of every domain concept (workstation, assistant, supervised doctor, wards, habits, alerts, drug-history mirror…); the entries, with the physician's decisions behind them, are in `docs/domain/`.
- `docs/FUNCTIONAL-AUDIT.md` — what is open, what is a known limit and what was decided, by area; read its table at session start, and `docs/audit/<topic>.md` before touching that area.
- `docs/ARCHITECTURE.md`, `docs/CODEMAP.md`, `docs/API.md`, `docs/SCHEMA.md` — how the system is built, where each thing lives, every route, every table.

---
This file is a living document. Whenever an implementation gets rejected or corrected during a task, write the lesson down — a rule plus its reason, not just a prohibition:
1. the full entry in the right `docs/rules/<topic>.md`, under "The rules, in full";
2. one line for it in that file's "At a glance";
3. one line here (or in `client/CLAUDE.md` / `server/CLAUDE.md`) when it bears on every change there, or on what a patient is given.

Keep this file short: the reason and the story belong in `docs/rules/`.
