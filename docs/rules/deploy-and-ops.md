# Build, deploy, dependencies, git

> **Read this before changing the code it covers.** Named in these rules: `dist/src/main.js`, `scripts/sms-test.ts`, `next.config.mjs`, `client/.gitignore`, `dist/`, `next/image`, `server/tsconfig.build.tsbuildinfo`, `tsconfig.build.json`, `tsconfig.json`, `CORS_ORIGIN`, `NEXT_DIST_DIR`, `NEXT_PUBLIC_API_URL`, `rootDir`, `scripts`.
>
> "At a glance" is an index written on 2026-11-15: one line per entry, to find the one you need. **The entry itself, under "The rules, in full", is what counts** — it was moved here word for word from the root `CLAUDE.md` and `server/CLAUDE.md` and `client/CLAUDE.md`; nothing was reworded. Where an entry says "above", "below", or names a section of a `CLAUDE.md`, that text is now in one of the files of `docs/rules/` ([index](README.md)).

## At a glance

- Manual deploys or builds on the VPS are never instructed: push to `main`; only DB migrations are manual.
- A build is never committed (`client/.gitignore` ignores every `/.next*/`), and a commit's message is not taken for what it holds: before a push, read `git show --stat` of each new commit against its message.
- A framework endpoint the app does not use is not left answering the internet (`images: { unoptimized: true }`), and `npm audit` is weighed by exposure, not read by its count.
- `set -e` is never trusted across an `&&` chain (`deploy.yml`): each build runs in a subshell, the API first, so a failure stops with exit 1 and no restart.
- A push to `main` is never deployed before `test.yml` is green, and never as a different commit from the one tested: `deploy.yml`'s `deploy` job `needs: test` and runs `git merge --ff-only ${{ github.sha }}`; the gate is not removed or bypassed. Proven once by run 44130628179 (green); the red path has not been exercised.
- A deploy is never called good because its commands ran: `deploy.yml`'s `verify` job asks the public URLs after the restart (API 401, doctor app 2xx/3xx, admin only a warning); it detects a dead app, it never rolls back, and a red `verify` is a red deploy — fix at once. Not yet run on GitHub (first run = the release that carries it).
- A file under `.github/workflows/` is never changed without showing the owner the diff and getting a yes, every time (the owner, 2026-11-17).
- A merge commit is not clean because both its parents are: diff its tree against `git merge-tree --write-tree <p1> <p2>`; never run `npm`/`next` in a checkout of `20e80cc`, `834005b`, `3f9699f`. (+2 more)
- How it works — Incident: adding `scripts/sms-test.ts` made the API serve 502 after deploy, with nothing wrong in the file.
- How it works — `tsconfig.json` has no `rootDir`: one `.ts` outside `src/` moves output to `dist/src/main.js`, `node dist/main` fails, pm2 crash-loops, nginx 502.
- How it works — `tsconfig.build.json` excludes `scripts`; any other `.ts` outside `src/` (a `tools/`, a root `foo.ts`) reintroduces the trap.
- `npx tsc --noEmit` cannot catch the rootDir trap: before pushing a new file outside `src/`, run `rm -rf dist && npm run build && ls dist/main.js`; no `dist/main.js` = 502.
- How it works — `tsconfig.build.json` sets `"rootDir": "./src"`, so a stray `.ts` is a TS6059 build error and the deploy stops before `pm2 restart all`; a build failing early leaves `dist` empty.
- `rootDir` belongs in the BUILD config, not `tsconfig.json`, which also type-checks `test/`, `prisma/seed.ts` and `scripts/*.ts` in CI.
- `tsBuildInfoFile` keeps the incremental cache inside `dist/`, else the next build writes nothing (no `dist/main.js`); check any change to these configs with two builds in a row.
- `CORS_ORIGIN` is a comma list and must include every frontend origin; a missing one looks like random auth failures.
- Env: `NEXT_PUBLIC_API_URL` must be set in both `.env.local` and the committed `.env.production`; a missing prod value silently points the live site at `localhost:4000`.
- Image optimizer: keep `images: { unoptimized: true }` in `next.config.mjs` (security; Next 14 advisories) until Next is 15.5.24+, then drop it only if an image is meant to be optimized.
- Build folders: `.gitignore` ignores every `/.next*/` folder (any `NEXT_DIST_DIR`); never commit one.

---

# The rules, in full

## Patterns We Do Not Use

_From the root `CLAUDE.md`._

- We do not instruct manual deploys or builds on the VPS. Push to `main`; only DB migrations are manual.

- We do not commit a build, and we do not take a commit's message for what it holds. A production build of the doctor app into `client/.next-share`, made to try the app on another PC, went into a commit — 203 MB, two webpack caches of over 90 MB each among it — under the message "Add TypeScript type definitions … update package.json to use ES modules", which described Next's own generated files. The commit before it carried `client/tsconfig.json` as `next dev` rewrites it for the browser suite, which `docs/testing/e2e.md` says is never committed. Both were pushed to `origin/siam` with the machine's default identity and taken back out of the branch before reaching `dev` (2026-10-16). `client/.gitignore` now ignores every `/.next*/` folder, whatever `NEXT_DIST_DIR` named it. Before a push, read `git show --stat` of each new commit against its message.
- We do not leave a framework's endpoint answering the internet because the app does not use it, and we do not read `npm audit` by its count. On 2026-10-16 it listed critical remote-code-execution advisories for Next 14 with no 14.x fix. One was in the image optimizer, which neither Next app uses and `next start` serves to anyone; `images: { unoptimized: true }` closes it (`imageOptimizerOff.test.ts`). multer under Nest 10 carried eight DoS advisories on the PUBLIC upload route; an `overrides` entry lifts it, and the route now takes one file and no text field (`server/CLAUDE.md`). The rest is weighed by exposure, not counted (`FUNCTIONAL-AUDIT.md`, "Dependency advisories"): `xlsx` only writes, and `proxy-addr` needs a trusted subnet this app does not configure. The Next 15 and Nest 12 upgrades are still open.
- We do not trust `set -e` across an `&&` chain. `deploy.yml` ran each build as `cd client && npm install && npm run build && cd ..`. `set -e` ignores a failure inside an `&&` list, so a failed build let the script carry on from the wrong directory, skip the builds after it and `pm2 restart all` onto the failure, and the Action reported success. That held for a failed client build, a failed server build and a failed `prisma generate` alike: the workflow's own script, run with stubbed commands, restarted production and exited 0 for each (2026-10-16). Each build now runs in a subshell, the API first, and the same run stops at each failure with exit 1 and no restart.

- We do not deploy what the tests have not passed, nor a different commit from the one they passed. Until 2026-11-17 `deploy.yml` ran on every push to `main` and `test.yml` only on pull requests, which this repo does not use, so no release ever waited for the suites. The contract test "calls only routes the API really serves" was red on `dev` at `08a4a64` (three manual `test.yml` runs on 2026-11-17, the same one failure each time) and five commits since `344be1e` went out while it was, by the files' dates, red (not run on each; `testing-and-verification.md`, "We do not leave out the server's integration suite…"). `deploy.yml` now has a `test` job that calls `test.yml` (`workflow_call`, no secrets) and a `deploy` job with `needs: test`: a red suite deploys nothing and production stays on the last good commit. The deploy step runs `git fetch origin main` and `git merge --ff-only ${{ github.sha }}` instead of `git pull --ff-only origin main`, so a push that lands while the tests run cannot ship untested code. Checked in a throwaway repo: the old pull jumped to the later, untested commit; the new step stops at the tested one, does nothing when the box is already there, and stops without merging or resetting when the box has diverged (the `--ff-only` rule above). One deploy runs at a time (`concurrency` on the `deploy` job). Cost: the suites' time on every release (`test.yml` takes about 3 minutes, measured; a deploy is then about 5–6, an estimate). **Proven once, not fully:** the first real deploy after this change (run 44130628179, 2026-11-17, commit `10d315e`) was green in 6 min 16 s — the server and client test jobs about 3 minutes (they run in parallel), then the deploy about 3 — and the VPS log showed `Updating 08a4a64..10d315e` and `Fast-forward`. The red path (a failing test stopping the deploy) has not been exercised: it rests on GitHub's documented `needs` behaviour and one independent review, and a deliberately red commit is never pushed to `main` to prove it (the safe proof would be a throwaway private repo with the same job shape and a dummy deploy job; not made). There is no bypass switch, and none is added without the owner. Still open: Playwright and `admin` are not in `test.yml`; the builds still empty `.next` and `dist` on the box. (The health check after the restart is the next entry.)

- We do not call a deploy good because its commands ran. `pm2 restart all` exiting 0 means pm2 started the processes, not that they answer; until 2026-11-17 nothing after the restart asked the live app anything (the 2026-10-16 entry above is the same gap one step earlier: a failed build reported as a success). `deploy.yml` now has a third job, `verify` (`needs: deploy`, so it does not run when `test` or `deploy` failed; a GitHub runner, `permissions: {}`, no secret, no third-party action). With no cookie it asks the public URLs every 5 s, giving each up to about 100 s (90 s of waiting plus a last request of up to 10 s; at worst about 5½ minutes for the job, inside its 8-minute limit; a few seconds when the app answers — 2 s measured locally): the API `https://api.muqsithealthsystem.com/api/patients` must answer exactly 401 (Nest is up and its auth guard is loaded), the doctor app `https://muqsithealthsystem.com/` 2xx or 3xx (`/` answers 307 to `/prescription`, with no `Location` header — Next's own redirect, normal), and `https://admin.muqsithealthsystem.com/` 2xx or 3xx but only as a warning, like its non-fatal build. Public URLs, because the nginx and pm2 ports are not in the repo. Limits, written so a green `verify` is not over-read: it only DETECTS — it rolls nothing back, so a red `verify` means "production may be down, look now" and the deploy has already happened; it does not show that the database works, nor which commit is running (no version endpoint exists); a runner the box refuses would read as a false red. Found by the independent review (no Critical or Important finding), left as written limits: one good answer is enough, so a process that answers once and then crash-loops under pm2 would pass (a database that is down at boot gives no listener and a red result, because `PrismaService.onModuleInit` awaits `$connect()`); the doctor-app check shows that Next answers, not that `/prescription` renders (`/` is a prerendered redirect served from Next's own cache), and any 3xx is accepted without looking at who sent it; `verify` is outside the `deploy-production` concurrency group, so with two pushes close together a later deploy's build (which empties `.next`) can turn the earlier commit's `verify` red — a true signal about production at that moment, put on the wrong commit. Hardening, each a workflow change that needs the owner's yes: two good answers 10–15 s apart; also asking `/prescription`. The same change added a log-only line to the VPS script that prints `node -v` and `npm -v` (CI tests on Node 20 with `npm ci`; the box runs `npm install` and its Node was never checked). Checked locally on 2026-11-17 with the script taken out of the YAML and run as `bash -e`: against the live URLs (401, 307, 200) and against local stand-in servers — API answering 200, nothing listening, doctor app 502 for good: red; admin down: a warning and exit 0; API 502 then 401: it waits, then passes. **Not yet run on GitHub** (`actionlint` was not available either): remove this sentence after the first green `verify`. An invalid workflow file shows as a failed run with no jobs ("workflow file issue") and deploys nothing.

- We do not change a file under `.github/workflows/` without showing the owner the diff and getting a yes, every time (the owner, 2026-11-17). The code here is written and pushed by Claude, which makes Claude able to weaken the very gate that checks its own work, by mistake or for convenience, and the workflow files are the one place where a quiet change removes the safety net (they also hold the pinned action that carries the VPS key). A yes to one change is not a yes to the next. Lint it, say what was not proven, then ask.

- We do not take a merge commit for clean because both its parents are. On 2026-11-03 `3f9699f` merged two clean parents (`78acbd4`, `2696e1a`) and also added what neither had: an `init` file in the root, `client/`, `server/` and `admin/` (obfuscated code on one 31 KB line behind padding), a 30 KB line in both `next.config.mjs`, and `node init &&` in every dev/build/start script — the 2026-10-28 payload again, under the machine's own author name, one hidden in the conflict resolution of an ordinary merge. A deploy of it would have run the payload on the VPS. Before a merge is taken, `git merge-tree --write-tree <p1> <p2>` gives the clean automatic merge: diff the merge's tree against it, and every file that differs outside the files it reports as conflicted is not a resolution. A file with a line over ~800 characters outside the `.md` files is read before anything is run. The genuine merge is `f8c298c` (deployed 2026-11-03; its tree is exactly the clean automatic re-merge). `20e80cc`, `834005b` and `3f9699f` are rewrites of it pushed by the collaborator ALPHAMAN-0 on 2026-11-06 — each the same message and author date, each adding the same eleven paths — and each deploy of them stopped at `git pull` on the VPS ("divergent branches"): production stayed on `f8c298c` and the payload never ran there (`deploy.yml` now says `--ff-only` and why never to reset). On 2026-11-07 `main` and `dev` were given a merge commit (`d5b1042`) whose first parent is the rewritten tip and whose second is the genuine lineage — a plain fast-forward push, since a force push was refused in that session. Its tree is clean, the VPS moved forward from `f8c298c` and the Action went green; the three rewrites remain in the history as ancestors. Taking them out needs a force push of both branches to the genuine lineage (the owner's call). They are also kept in `.git/evidence-origin-3f9699f.bundle`. Never run `npm`/`next` in a checkout of those three; `main` is not protected on GitHub, and a collaborator with push can still rewrite it again — see the repo settings.

## ⚠️ Adding a `.ts` file OUTSIDE `src/` can take production down

_From `server/CLAUDE.md`._

Happened 2026-07-30: `scripts/sms-test.ts` was added, CI deployed, and the API
served **502** until it was reverted-by-fix. Nothing was wrong with the file.

`tsconfig.json` sets **no `rootDir`**, so TypeScript infers it from the common root
of the input files. Every `.ts` used to live under `src/` (`scripts/` held only
`.js`/`.py`, `prisma` and `test` are excluded), so the inferred root was `src/` and
`nest build` emitted `dist/main.js`. Add one `.ts` anywhere else and the common root
becomes the project root: output silently moves to `dist/src/main.js`, `start:prod`
(`node dist/main`) can't resolve it, pm2 crash-loops, nginx returns 502.

`tsconfig.build.json` now excludes `scripts`, so that one path is safe. Anything
else outside `src/` (a `tools/`, a root-level `foo.ts`) reintroduces it.

**`npx tsc --noEmit` cannot catch this** — it type-checks and emits nothing, so it
is green either way. Before pushing a new file outside `src/`, run the real build
and check the artifact:

```bash
cd server && rm -rf dist && npm run build && ls dist/main.js
```

No `dist/main.js` means the deploy will 502.

**Since 2026-10-16 `tsconfig.build.json` sets `"rootDir": "./src"`**, and the silent
move is a compile error: `TS6059: File 'tools/stray.ts' is not under 'rootDir'`,
`nest build` exits 1, and the deploy stops before `pm2 restart all` (it builds each
app in a subshell — `deploy.yml`). In THIS failure TypeScript still writes
`dist/main.js` in the right place, so a later restart finds it — not in every
failed build: `nest build` empties `dist` first, so a build that fails before
writing leaves a later restart with nothing to start (root `CLAUDE.md`, Deploy). Checked in a copy of `server/` with a
stray `tools/stray.ts`: without the setting the build was GREEN with its output at
`dist/src/main.js`; with it, red. Two things about it are load-bearing:

- **It is in the BUILD config, not `tsconfig.json`.** `tsconfig.json` has no
  `include`, so it also reads `test/`, `prisma/seed.ts` and `scripts/*.ts` — the
  CI typecheck (`tsc --noEmit -p tsconfig.json`) checks them, and a `rootDir`
  there would refuse them.
- **`tsBuildInfoFile` keeps the incremental cache inside `dist/`.** `incremental`
  is on, and given a `rootDir`, TypeScript puts its cache beside the config
  (`server/tsconfig.build.tsbuildinfo`) instead of in `dist/`. `nest build`
  deletes `dist/` but not that file, so the NEXT build read a cache saying
  everything was already written and wrote nothing: exit 0 and no
  `dist/main.js` — the 502 this guards against, on the second deploy. The first
  version of this change did exactly that, and only a second build in a row
  showed it. A change to these configs is checked with two builds in a row.

## Gotchas

_From `server/CLAUDE.md`._

- `CORS_ORIGIN` env is a comma list and must include every frontend origin (localhost:3000/3001 + prod domains) — a missing origin looks like random auth failures.

## client/CLAUDE.md

_From `client/CLAUDE.md`._

**Env trap:** `NEXT_PUBLIC_API_URL` must be set in both `.env.local` (dev, gitignored) and **`.env.production` (committed — the deployed build uses it)**. A missing prod value silently points the live site at `localhost:4000`.

**⚠️ The image optimizer is off (`images: { unoptimized: true }` in `next.config.mjs`, 2026-10-16) — a security setting.** Nothing here uses `next/image`, but `next start` answers `/_next/image` for anyone, and on Next 14 that endpoint carries advisories with no 14.x fix: remote code execution when an AVIF file is optimized (GHSA-2xp9-vwfh-vxw4, critical), a denial of service and a disk-filling cache. With the setting on, the route answers 404 before reading anything. `src/lib/imageOptimizerOff.test.ts` pins it for this app and `admin/`, and fails if a source file imports `next/image` (an image would then be shown unoptimized). Keep it until Next is past those advisories (15.5.24+) — and then drop it only if an image is meant to be optimized.

**Build folders:** `.gitignore` ignores every `/.next*/` (`.next`, `.next-e2e`, `.next-verify`, or any other `NEXT_DIST_DIR`); never commit one (2026-10-16 — a 203 MB build in `.next-share` was committed and pushed once).
