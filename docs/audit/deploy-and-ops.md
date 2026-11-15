# Build, deploy, dependencies — open threads, known limits, decisions

> Part of the functional audit ([index](../FUNCTIONAL-AUDIT.md)). The rules for this code are in [`docs/rules/deploy-and-ops.md`](../rules/deploy-and-ops.md).
>
> "At a glance" is an index written on 2026-11-15; **the thread itself, under "The threads, in full", is what counts** — moved here word for word from `FUNCTIONAL-AUDIT.md`, in its original order. A status below is how the thread reads, not a check of the code: before acting on one, read it.

## At a glance

**To do — engineering work that is known and not done**

- **Not timed, and not known — check nginx gzip** — Real list sizes, production catalogue, phones, Firefox/Safari, VPS compression not timed; for the operator: check that nginx gzips `application/json`.
- **Next.js 14 → 15.5.24+, both apps** — On 14.2.35 advisories have no 14.x fix: Windows-hosted RCE (GHSA-p293-qw3h-jr36) and RSC DoS; Next 15 brings React 19 and async request APIs, a major upgrade.
- **Nest 10 → 12** — `@nestjs/core` (moderate), `body-parser` (low), `lodash` via `@nestjs/config`; the multer override is a stopgap that comes out with this upgrade.
- **nodemailer 6.10.1 → 10.1.2+** — Seventeen advisories; addresses pass `@IsEmail()` first so exposure is low; major version, needs a real SMTP send to verify.
- **Non-breaking fixes, not applied** — `qs`, `proxy-addr`, `file-type`, `nanoid`, `source-map-js`: `npm audit fix` without `--force`, one lockfile change per app, with its own verification.

**Closed — kept as the record of what was done or decided**

- **The deploy restarted production onto a failed build** — `set -e` ignored `&&` failures; each build now runs in a subshell, API first, and a failure stops the script before `pm2 restart all` (`deploy.yml`).
- **The image optimizer is off in both Next apps** — `images.unoptimized` closes GHSA-2xp9-vwfh-vxw4 (critical RCE via AVIF), GHSA-h64f-5h5j-jqjh and GHSA-3x4c-7xq6-9pq8 on an unused endpoint.
- **The server build fails on a `.ts` outside `src/` (`rootDir`)** — Instead of moving its output and 502ing.
- **`xlsx` 0.18.5 is not exposed** — No npm fix; both advisories are in READING a sheet and the app only writes one (`InvestigationDownload.tsx`); recorded so it is not looked at again.

---

# The threads, in full

## Open threads — decisions owed, not bugs (2026-07-27)

### Add Bulk Medicine (2026-10-13) — what it does not do, for the physician

- [ ] **Not timed, and not known:** how many medicines a real doctor's list
  holds (it was not read — the dev database is production); the production
  catalogue; a phone or an old tablet, where drawing costs several times a
  laptop's; Firefox and Safari; and whether the VPS compresses the answer —
  2,000 medicines are 550 KB of JSON, the API does not compress by itself,
  and on a hospital's Wi-Fi that matters more than any of the above. **For
  the operator:** check that nginx gzips `application/json`.

### Dependency advisories and the deploy script (2026-10-16)

Fixed on `siam` (before release):
- **The deploy restarted production onto a failed build and reported success.** `set -e` ignores a failure inside an `&&` chain. Each build now runs in a subshell, the API first, and a failure stops the script before `pm2 restart all` (`deploy.yml`; the workflow's own script was run with stubbed commands for each failure, before and after).
- **The image optimizer is off in both Next apps** (`images.unoptimized`). It closes GHSA-2xp9-vwfh-vxw4 (critical, remote code execution when an AVIF file is optimized), GHSA-h64f-5h5j-jqjh and GHSA-3x4c-7xq6-9pq8 on an endpoint nothing used.

- **The server build fails on a `.ts` outside `src/`** (`rootDir`) instead of moving its output and 502ing.

Open — each needs its own upgrade and its own verification pass:
- [ ] **Next.js 14 → 15.5.24+, both apps.** On 14.2.35, `npm audit` lists advisories with no 14.x fix. Two matter most:
  - Unauthenticated remote code execution on **Windows-hosted** servers (GHSA-p293-qw3h-jr36, critical, "no known workaround"). Production runs on Linux, but a Windows development machine whose `next dev` port the network can reach is exposed.
  - Denial of service through React Server Components (GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, high), which apply to any App Router app.

  Next 15 brings React 19 and async request APIs: a major upgrade of the screen doctors prescribe through.
- [ ] **Nest 10 → 12:** `@nestjs/core` (an injection advisory, moderate), `body-parser` (low), and `lodash` through `@nestjs/config` (`_.template` and `_.unset` / `_.omit`; this app hands `@nestjs/config` env-var names, not request data). The multer override is a stopgap that comes out with this upgrade.
- [ ] **nodemailer 6.10.1 → 10.1.2+.** Seventeen advisories. The high ones are DoS in its address parser, plus file read / SSRF through `raw` messages and OAuth2 TLS validation (neither is used here). Every address that reaches it has passed `@IsEmail()` first (register / verify-OTP DTOs), which turns away the crafted address lists the DoS needs. Exposure is low, but it is a major version, and it needs a real SMTP send to verify.
- [ ] **Non-breaking fixes, not applied:** `qs` (request-parsing DoS, moderate); `proxy-addr` (critical, but only with a trusted SUBNET — `trust proxy 1` is a hop count and does not reach that code); `file-type` (only `@nestjs/common`'s file validators use it, and this app has its own check); `nanoid` and `source-map-js` (build time). `npm audit fix` without `--force` takes them: one lockfile change per app, with its own verification.
- **`xlsx` 0.18.5 is not exposed; recorded so it is not looked at again.** npm has no fix. Both advisories (prototype pollution, ReDoS) are in READING a sheet, and the app only writes one (`InvestigationDownload.tsx`: `aoa_to_sheet`, `writeFile`). A feature that reads an uploaded spreadsheet in the browser would change that.
