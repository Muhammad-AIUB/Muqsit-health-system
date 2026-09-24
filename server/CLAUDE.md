# server/CLAUDE.md — NestJS API

NestJS 10 modular monolith, global prefix `/api`, Prisma 5.22 → shared VPS PostgreSQL (see root CLAUDE.md for the tunnel/migration workflow). Express platform, `trust proxy 1`, JSON body limit 8 MB, uploads served from `/uploads`.

**Every route is catalogued in `docs/API.md`** — paths, DTO shapes, scoping and the
permission keys each one enforces. Keep it in the same commit as a route change.

## Module map (src/)

`auth` (cookie JWT + refresh rotation + OTP email verify) · `users` · `admin` (registrations, tier changes, evict) · `assistants` (doctor→assistant links + permission keys) · `wards` (IPD wards + their teams) · `workstations` (X-Workstation resolution) · `patients` (records, galleries, summaries, family tree, supervised access) · `prescriptions` + `prescription-draft` + `prescription-layout` + `templates` · `opd` / `ipd` (queues, admissions, follow-ups) · `patient-chat` (per-patient team chat + PatientSupervisor + `/supervised`) · `activity` (audit feed) · `medicines` (search) · `patient-notes` (a user's PRIVATE note per patient) · `drug-advice` (the doctor's own ••• advice per medicine/generic) · `mirror` (SSE device mirroring) · `uploads` · `mail` · `research` · `prisma`.

## ⚠️ Rule 1 — every patient-data query is doctor-scoped

Controllers touching practice data use `@UseGuards(JwtAuthGuard, WorkstationGuard)` and take the doctor from `@WorkstationDoctorId()` — **never** from `req.user.id` directly, and never trust a client-sent doctorId in the body. `WorkstationGuard` resolves the `X-Workstation` header: absent/own id → own context; a doctor the user actively assists → that doctor + granted permission keys; anything else → 403.

## ⚠️ Rule 2 — the patient access model (do not widen casually)

| Action | Owner | Assistant (via workstation) | Supervisor (PatientSupervisor) |
|---|---|---|---|
| find by mobile / open / update patient | ✅ | ✅ (as the owner) | ✅ (`accessibleWhere`: owner OR `supervisors.some({doctorId})`) |
| create prescription on the patient | ✅ | ✅ | ✅ — stored under the **supervisor's own** `doctorId` |
| list prescriptions | own `doctorId` only — a supervisor never sees the owner's Rx and vice versa | | |
| DELETE patient | ✅ **owner-only, always** | ❌ | ❌ |

If you add a new patient-scoped endpoint, decide explicitly which column of this table it belongs to and mirror the corresponding `where` shape from `patients.service.ts`.

**Narrower than the table above:** `hmDrugDates` / `hmSymptomDates` (the Health-trend-chart duration overrides) are **owner-only**, and the two denials come from **different layers** — both load-bearing:

| Caller | Stopped by |
|---|---|
| Assistant in the owner's workstation | `patients.controller.ts#update`: `ws.role !== 'owner'` + the key is present → 403 |
| Supervising doctor | *Not* the controller — they act under their **own** workstation, so `ws.role` is `'owner'`. The `patient.doctorId !== doctorId` check in `patients.service.ts#update` is what stops them |

`Patient.imageThumbs` (2026-09-07, `manual-patient-image-thumbs.sql`) is a nullable `Json` side map, `{ [fullImageUrl]: thumbUrl }`, holding 400px copies for the two document galleries. Display-only and additive: it carries no clinical content, nothing was migrated, and a gallery URL absent from it falls back to the full image — which is how every image stored before it reads. It rides the generic `...rest` passthrough in `patients.service.ts#update` and is deliberately **not** in the controller's `RX_LIFECYCLE` set, so an assistant needs exactly the `pt.info` key `prescriptionImages` already requires; it must never widen that, and it only ever travels in the same PATCH as the gallery it describes. The arrays themselves were left alone on purpose — see `client/CLAUDE.md` for why the thumbnails are a side map rather than a richer array.

`Patient.lastRxImageKey` (2026-08-23, `manual-patient-last-rx-image-key.sql`) is a plain `TEXT?` that carries no clinical content: the SHA-256 of the printed sheet behind the newest AUTO snapshot in `prescriptionImages`, so the client can tell a re-save of an unchanged visit from a real edit and stop filing the same paper into the gallery on every click (see `client/CLAUDE.md`). It rides the generic `...rest` passthrough in `patients.service.ts#update` — no service branch of its own — and it is deliberately **not** in `RX_LIFECYCLE`: it only ever travels in the same PATCH as `prescriptionImages`, which already requires `pt.info` for an assistant, so it must not widen that. NULL means "nothing filed yet" and the client always takes a snapshot, which is why the column needed no backfill.

`hmDrugDates` used to sit in the assistant `RX_LIFECYCLE` bypass set — deliberately removed; don't put it back without a permission key. `PATCH /patients/:id` is the **only** route that accepts `UpdatePatientDto`, and these fields are declared on it alone (not on Create/Link), so `ValidationPipe({ whitelist: true })` strips them everywhere else. One door — keep it that way.

**Deleting a doctor must not delete their patients.** A patient is not the property of the account that registered them: the same person returns to a different doctor and is found again by mobile. `admin.service.ts#hardDelete` therefore does a plain user delete and lets `Patient.doctorId`'s `onDelete: SetNull` keep the row, its demographics and its durable history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `familyMembers`). That doctor's own `Prescription` rows still cascade, which is consistent — they were never visible to another doctor. **Known gap:** `accessibleWhere()` matches `{ doctorId }` OR an assigned supervisor, so a patient left with `doctorId = null` is retained but **not reachable** through the mobile lookup. Making unowned patients findable exposes PII across practices and needs its own access design — do not bolt it onto a delete path.

## ⚠️ Rule 2b — an IPD team is NOT a workstation

`wards` (2026-08-15) models a ward and the team that works it: `Ward` (one per
practice, unique name), `IpdTeamMember` (ward + user + `ipd.*` permission keys),
and `IpdAdmission.wardId`.

Two things about it are load-bearing:

- **Every handler in `wards.controller.ts` passes the signed-in user's OWN id**,
  never `@WorkstationDoctorId()`. Deciding who may reach admitted patients is the
  owner's call; an assistant inside the practice must not be able to put anyone
  (least of all themselves) on a ward team. Same posture as `AssistantsController`.
- **`wardId` in an admission body is validated against the doctor's own wards**
  (`ipd.service.ts#resolveWard`) and the ward's real name is written back into
  `wardNo`. A foreign id in a request body widens access exactly like a forged
  header would; an unknown ward is refused rather than silently dropped, so the
  doctor is never left believing a ward team can see a patient it cannot.

**The remaining half — letting a team member log in and reach the ward — is NOT
built, and must not be done by extending `WorkstationsService.resolve`.** Every
patient-data controller reads `workstationDoctorId`, so the moment a ward
membership resolves to a workstation, that member has the practice's patients,
prescriptions and OPD queue too — a ward nurse would silently gain the OPD
record of someone who was never on their ward. Build a narrow IPD-only door
instead: `ipd.service` resolves ward membership itself and returns only that
ward's admissions, and nothing else in the app changes shape.

## ⚠️ Rule 2c — `DoctorRxHabit` is DERIVED, and its write path is load-bearing

`rx-habits` (2026-08-17) learns a doctor's repeated prescribing instructions and
offers them back in the ℞ pad. The domain rules are in the root `CLAUDE.md`;
these are the ones that live in this app's code and are easy to break.

- **The write is awaited, in a try/catch, AFTER `prescription.create` returns.**
  All three parts matter and each was chosen against a specific failure:
  *outside the prescription write*, because a habit failure inside it would roll
  back a prescription the doctor believes was saved and has already printed;
  *awaited*, because every deploy restarts pm2 and a detached promise in flight
  at that moment is simply lost; *caught*, because a convenience must never fail
  the single most important write path in the product.
  `prescriptions.service.spec.ts` is a REGRESSION spec for exactly this — if you
  touch `create()`, it is the test that says whether you broke the record.
- **`patientCount` is never `increment: 1`.** It counts DISTINCT PATIENTS, and
  the answer comes from the record: `priorBlockKeys()` asks whether this patient
  already contributed this block on an EARLIER prescription. One query per save,
  then a set lookup per block. A prescription-count would make one returning
  patient look like routine practice, which defeats the only safety signal the
  feature has.
- **`contLines` is a Json column, so it is unknown at every boundary.**
  `sanitiseContLines` returns `null` for anything it cannot read and the block is
  dropped **whole** — never partially. Half a tapering schedule delivered as if
  it were the whole instruction is worse than no suggestion. The client sanitises
  again (`rxHabitRows.ts`); the two layers fail for different reasons.
- **The lookup matches `searchKey` only**, through the SAME normalisation the
  stored key went through, and needs the `text_pattern_ops` index from
  `manual-rx-habits.sql`. The plain btree does NOT serve `LIKE 'prefix%'` here:
  this database's collation is `C.UTF-8`, and Postgres only treats a collation as
  pattern-safe when it is exactly `C`/`POSIX`. Verified with EXPLAIN on
  2026-08-17 — an earlier draft of the design assumed otherwise. LIKE
  metacharacters in the doctor's typing are escaped (`likePrefix`); a bare `%`
  would otherwise match every medicine they have ever prescribed.
- **`list()` attaches each medicine's `generic` from the raw `medicines` table**,
  matched on the same normalised key that grouped the habits. This is a SAFETY
  field, not a label: prescribing-alert rules are written against generics
  (`entecavir`) while the ℞ line carries the brand (`Tablet. Barcavir 0.5 mg`).
  Resolving it on the client from a separate medicines request — the original
  design — made it depend on a race, and a doctor clicking the suggestion before
  that request landed would lose the contraindication warning entirely. One
  bounded prefix query per lookup, wrapped in try/catch: no generic just means
  the line behaves like a hand-typed brand.
- **The boot check never throws.** `onModuleInit` runs one `SELECT 1` and logs a
  single ERROR naming `manual-rx-habits.sql` if the table is unreadable. Because
  the doctor is shown silence on failure by design, the log is the ONLY place a
  dead feature announces itself — and this repo already has two committed-but-
  unapplied manual migrations to prove that matters.
- **`RxHabitsModule` imports `WorkstationsModule`.** `WorkstationGuard` injects
  `WorkstationsService`, and Nest resolves that at BOOT: `npx tsc --noEmit` is
  green without the import and the API then crash-loops on start. Typecheck is
  not enough for a new guarded module — start the server.
`doctor-phrases` (2026-09-21) is the FREE-TEXT sibling of `rx-habits`: it learns
the ADVICE lines and the free-typed ℞ **note** lines a doctor writes, and offers
them back as they type. It is built to the same five rules and shares the same
seam — `PrescriptionsService.create` calls `phrases.recordFrom(...)` beside
`habits.recordFrom(...)`, in the same try/catch that can never fail the save.

- **`manual-doctor-phrase-habit.sql` must be applied** before it does anything.
  Until then `DoctorPhrasesService.onModuleInit` logs one ERROR naming that file
  and the rebuild script, and both fields keep working, silently. That boot
  check is the only place a missing table can be announced: on the clinical
  screen an empty list and a dead feature look identical.
- **`patientCount` is DISTINCT PATIENTS.** `recordFrom` asks the record which
  patients already contributed each signature on an EARLIER prescription
  (`priorSignatures`, excluding the one being learned from) and increments only
  for a genuinely new one. Never `increment: 1` unconditionally.
- **Typography-only normalisation** (`doctor-phrases/normalise.ts`): case,
  whitespace, one trailing full stop. It must never drop a word, number, unit or
  parenthesised qualifier — `Insulin as before` and `Inj. Insulin as before` are
  two instructions. Pinned in `normalise.spec.ts`, including everything it must
  NOT fold.
- **`hidden` is never un-set by a later save.** A suppressed line stays
  suppressed even when the doctor writes it again by hand; un-hiding is the
  PATCH route.
- **Repair, never hand-edit:** `node scripts/rebuild-doctor-phrases.js
  [--dry-run]` recomputes the table from `Prescription.advice` and
  `PrescriptionItem where isNote`, in one transaction, re-applying `hidden`
  **by content** for the same reason the medicine rebuild does.

- **Repair, never hand-edit:** `node scripts/rebuild-rx-habits.js [--dry-run]`
  recomputes the table from `Prescription`/`PrescriptionItem`, one transaction
  per doctor, and re-applies `pinned`/`hidden` **by content**. Do not "simplify"
  that to a `signature` join — a signature is the OUTPUT of the normalisation
  algorithm, so the day a rule is edited every signature changes, every flag
  orphans, and every deliberately suppressed dose comes back silently. The
  script loads `normalise.ts` from `dist/` (or via ts-node) rather than
  reimplementing it, and must stay `.js` — see the `rootDir` trap below.

## `drug-advice` — the doctor's own standing advice (2026-09-24)

`DoctorDrugAdvice` (`manual-drug-advice.sql`, applied 2026-09-24) holds what a
doctor writes in the ℞ pad's ••• box. Unlike the two habit tables it is NOT
derived — every line is typed by the doctor, so there is no rebuild script and
nothing learns into it. `PUT /drug-advice` replaces a key's lines (empty =
cleared). Scope is `@WorkstationDoctorId()`; an assistant needs `rx.advice` to
write. Keys (`drug-advice/keys.ts`): scope `medicine` reuses
`rx-habits/normalise.ts#normaliseDrugKey` (strength included), scope `generic`
folds case and spacing only. The client mirrors both in `lib/rxDrugAdvice.ts`.
Boot check logs one ERROR naming the SQL file if the table is unreadable.

## ⚠️ `patient-notes` — keyed by the SIGNED-IN USER, on purpose (2026-09-24)

`DoctorPatientNote` (`manual-doctor-patient-note.sql`, applied 2026-09-24) is the
one patient-scoped table that is NOT keyed by the workstation doctor: the
physician's rule is that a personal note is visible to the person who wrote it
and nobody else — not an assistant in the owner's workstation, not the owner
reading an assistant's. So `@CurrentUser().id` is the ONLY key a note is read or
written under, and `@WorkstationDoctorId()` is used for one thing: proving the
patient is reachable through `PatientsService.get` (404 otherwise). Do not
"fix" this to the workstation doctor, and never log it to `activity`.
`patientInfo` is written on create only. Pinned in `patient-notes.service.spec.ts`.

## ⚠️ Rule 2d — the IPD `clinical` column is REPLACED, so new per-admission data gets its own route

`ipd.service.ts#update` writes `dto.clinical` verbatim (`data = { ...dto }`). Two
consequences, both of which have to be designed around rather than lived with:

- **A key the client omits is DELETED**, not left alone. No error, nothing in the
  admission feed. The client builds the payload with `lib/ipdClinical.ts#mergeIpdClinical`
  (start from the stored object, lay the known fields on top), and this side keeps
  `preserveAnalogueSheets` for the case the client guard cannot cover: an old tab
  still open on a ward PC after a deploy, or a rollback of the build that introduced
  the key. Both halves are pinned in `ipd.service.spec.ts` / `ipdClinical.test.ts`.
- **Two writers silently clobber each other.** There is no version check, and the
  ward-team design means more than one person on one admission is the normal case,
  not the rare one. Still open for the clinical fields — its own issue, and it needs
  a 409 flow that does not cost the doctor their typing.

So **new per-admission data does not ride this PATCH.** The analogue (paper)
order-sheet pages are the worked example: `POST /ipd/:id/analogue`,
`PATCH|DELETE /ipd/:id/analogue/:sheetId`, `POST .../restore`. Each one re-reads the
admission inside a transaction, touches exactly one entry (or appends), and writes
`clinical` back with every other key passed through. A whole-array write would have
just relocated the clobber — two devices photographing the same sheet would
overwrite each other's pages.

Four more rules there are safety, not style:

- **The server assigns `id` and `addedAt`.** The id is the handle every per-page
  route addresses, and ward PCs have wrong clocks — a clinical timestamp is not
  something to take from a browser.
- **Removal is SOFT** (`removedAt` / `removedBy`). These are medico-legal documents:
  the entry keeps its place, the file stays on disk, and a page removed by mistake is
  recoverable long after the client's Undo bar is gone.
- **Every operation writes an `IpdEvent` in the same transaction**, attributed to the
  signed-in user (not the workstation's doctor), so the admission's own feed says who
  added or removed a page.
- **`assertMayEditAnalogue` deliberately does NOT require `ipd.analogue` of an
  assistant.** The `ipd.*` keys are ticked per `IpdTeamMember` and are kept out of the
  assistant editor on purpose (`client/CLAUDE.md`) — an assistant reaches IPD with no
  key at all. Requiring one here would revoke something they can already do on every
  other field of the same screen. The doctor and their assistants pass; any OTHER
  actor (the ward-team login, when it is built) needs the key. Real the day that door
  opens, denies nobody today.

## ⚠️ Rule 3 — ValidationPipe strips unknown fields

`main.ts` uses `ValidationPipe({ whitelist: true })`. **Any new field the client sends must be added to the DTO** (`src/*/dto/*.ts`) or it is silently dropped — a classic "saved but nothing persisted" bug. For JSON columns follow the existing pattern in `patients.service.ts#update`: destructure the field, cast via `Prisma.InputJsonValue`, use `Prisma.DbNull` for explicit nulls.

## Auth architecture (don't regress these)

- Access token `mhs_at` (15 min) + refresh `mhs_rt` (rotated, path `/api/auth`), both httpOnly. `publicUser()` must keep returning `accountTier` — the client's tier gates read it from the login/refresh response.
- **Rotation grace window (30 s)** in `auth.service.ts#refresh`: a just-rotated token presented again while the family has a live successor is a benign concurrent-refresh race (multiple tabs / client+admin share the cookie) → issue a fresh token. Only replay after the window, or against a dead family, revokes the family. Removing this brings back the "everyone logs out on reload" bug.
- Client `apiFetch` silently refreshes once on 401 and only logs out on a definitive rejection; keep server semantics compatible.
- `revokeAllForUser` is the admin evict path; sessions die within one access-token lifetime.

## Prisma specifics

- Regenerating on Windows requires the dev server stopped (root CLAUDE.md). If a freshly added column isn't in the generated client yet, the codebase uses loose casts (`const extra = rest as Record<string, unknown>`) — acceptable short-term, regenerate ASAP.
- JSON columns carrying medical history (`investigationSummary`, `onExaminationSummary`, `drugHistory`, `incompleteRx`, `familyMembers`, IPD `clinical`) are **append/merge on the client, whole-value writes on the server**. Never "fix up" their contents server-side without an explicit migration script.
- Seed: `npm run seed` (needs `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`).

## SSE mirror

`mirror` fans out editor snapshots per user in-memory. The `@Sse('stream')` route sets `X-Accel-Buffering: no` — required or nginx buffers the stream in prod and mirroring "stops working". Keep it on any new SSE route.

## ⚠️ Adding a `.ts` file OUTSIDE `src/` can take production down

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

No `dist/main.js` means the deploy will 502. The permanent fix is an explicit
`"rootDir": "./src"` in `tsconfig.json`, which turns the silent move into a compile
error; not done yet because it needs its own verification pass.

## Gotchas

- **The medicine database is a raw Postgres table `medicines` that is NOT in `schema.prisma`** — `medicines.service.ts` queries it with `$queryRaw` (bound params, brand-before-generic ranking). Don't look for a Prisma model, don't let a destructive schema push touch it, and keep any new query parameterized.
- Email (OTP verification, notifications) is nodemailer over SMTP — `SMTP_HOST/SMTP_USER/SMTP_PASS` env. Without them the transporter is null (dev): signup OTP won't arrive; that's configuration, not a bug.
- **SMS** (`sms/sms.service.ts`, 24bulksmsbd) — `SMS_CUSTOMER_ID/SMS_API_KEY`, optional `SMS_API_URL`. Same unconfigured-is-fine posture as mail: it logs instead of sending. **`SmsModule` is deliberately NOT in `AppModule`** — nothing consumes it yet (it exists for the cross-practice OTP-consent design). Wire it in when a caller lands. Two rules if you do: `send()` returns `{ok, detail, ms, raw}` and must never be `void`-ed into a swallowed catch — a lost access code that nobody hears about is the whole failure mode; and the gateway answers **HTTP 200 for business failures too** (bad key, no balance), so status alone is not proof of delivery, which is why the body is pattern-checked and the first few raw responses are logged. Numbers go through `normaliseBdMobile()`, which refuses anything that isn't `01[3-9]XXXXXXXX` rather than guessing — a guessed digit sends a patient's code to a stranger.
- `CORS_ORIGIN` env is a comma list and must include every frontend origin (localhost:3000/3001 + prod domains) — a missing origin looks like random auth failures.
- Activity log (`activity`) is the doctor-facing audit trail; when adding a feature that records clinical input, log it (`section`, `detail`, optional `imageUrl`) so it appears in "Notifications, Chats & Reports". `detail` is capped at **400 chars** — trim free-text names (a chief complaint is doctor-typed) before interpolating, or the whole log call 400s. **`ActivityService` takes an already-resolved `doctorId` and must never resolve a practice itself.** It used to re-derive one from what it treated as a user id (`Assistant where assistantId = …`); because the controller passes `@WorkstationDoctorId()`, a doctor who ALSO assists someone else silently read and wrote the OTHER practice's feed — patient names and clinical detail across the boundary Rule 1 exists to hold. Fixed 2026-08-27 (CSO audit) and pinned by `activity.service.spec.ts`, which asserts `prisma.assistant` is never touched. The general rule: **`WorkstationGuard` is the only place allowed to decide whose practice a request acts on** — a service that resolves it again is a second, unreviewed answer to the same question.
- **Backfilling old thumbnails: `node scripts/backfill-image-thumbs.js [--dry-run] [--limit N]`** (2026-09-07). Generates the 400px copies for gallery images filed before `imageThumbs` existed, with sharp, at the same size and quality the browser uses (400px long side, JPEG q80 — keep it in step with `client/src/lib/imageThumbs.ts`). Four things about it are deliberate: it **only ever adds keys** to the display-only map and never touches `prescriptionImages` / `reportImages`; it **must run on the machine that holds the files** (the DB is shared, `uploads/` is not — a laptop run skips the 178 production images and finds only its own), and it **refuses to write when `PUBLIC_URL` is localhost** because that run would put unreachable thumbnail URLs into the doctors' real records; it installs sharp into **`scripts/.tools/`** rather than `server/node_modules`, since a plain `npm install sharp` here reported *"added 10 packages, removed 4, changed 64"* — the live API's dependency tree moving to add a resizer — and touching `package-lock.json` is what blocked a deploy on 2026-07-20; and it merges under a `FOR UPDATE` lock so a doctor adding an image mid-run is not silently overwritten. It does **not** cover the ward's analogue order sheets: that column is written through per-page routes with their own soft-delete and audit trail, and a script doing read-modify-write on it could clobber a round in progress.
- **`/uploads` is served `immutable, max-age=365d` (2026-09-07), and that is correctness, not speed.** express.static's default is `Cache-Control: public, max-age=0`, which caches the bytes but makes the browser **revalidate every one of them on every use**. A patient records page carries dozens of images (48 on a real record), `api.muqsithealthsystem.com` negotiates **no HTTP/2** (verified: no ALPN), so those revalidations queue six at a time behind the app's own API calls and the SSE mirror stream — every tile sat blank until its round trip returned, and one request dropped on a clinic connection left it blank until the whole page was reloaded. That was the reported "images are broken until I reload". `immutable` is a fact here, not a hope: every upload is written under a fresh `randomUUID()` name and nothing in the app rewrites one, so a changed image is always a new URL and a stale cache entry cannot show a doctor the wrong page. **Do not add an overwrite-in-place upload path without removing this first.** The client's other half is the failed-tile retry in `ImageGallery` (`client/CLAUDE.md`).
- **⚕️ An upload URL is ABSOLUTE and carries the environment that minted it — so a localhost one is REFUSED (2026-09-20).** `upload.service.ts` stamps `${PUBLIC_URL}/uploads/<uuid>` into the patient's record at upload time. On a laptop that is `http://localhost:4000`, and **the database is the live one** (dev tunnels to it), so every image uploaded while working locally landed in a doctor's real record as an address no other machine can open: the live site showed "Did not load" and the console read `net::ERR_CONNECTION_REFUSED`. It hid for months because it looks perfect on the machine that created it, and it reached further than the two galleries — the scan found **274 files across `ActivityLog.imageUrl` (266 rows), `Patient.prescriptionImages`, `reportImages`, `imageThumbs` and `pictureUrl`**. `uploadImage` now throws `503` **before `writeFileSync`** (a refused upload must not leave an orphan on disk) whenever the origin resolves to localhost/127.0.0.1/::1/0.0.0.0, unless `ALLOW_LOCALHOST_UPLOAD_URLS=true`. That flag is opt-in and **never inferred**: the tunnel makes the production database look like `localhost:5432`, so the `DATABASE_URL` host cannot tell a local database from the live one. Anything but the exact string `true` fails closed. Pinned in `upload.service.spec.ts`.
  - **Repair, never hand-edit: `node scripts/repair-localhost-image-urls.js [--scan|--stage <dir>|--apply --target <origin>]`.** It finds the URLs by asking `information_schema` which text/JSON column actually holds one, rather than listing models by hand — that is how the 266 activity-feed rows were found at all. Three rules are safety, not style: it **HEAD-checks every filename at the target first and rewrites only a live 200** (a broken link a doctor can report beats a rewritten one that 404s silently); it changes **only the host prefix** of a matched URL, never the filename, array order or JSON shape; and each column is one **atomic UPDATE**, so a doctor saving the same row mid-run cannot lose their write to a read-modify-write. Idempotent — a repaired URL no longer matches. **Order matters: the files must be copied to the serving machine BEFORE `--apply`**, or verification refuses everything and nothing is written (`--stage` collects them for `scp`).
- **⚕️ ONE format table, and it reads the BYTES (2026-09-20).** `upload.service.ts#sniff` is the single gate deciding what may be stored: **JPEG, PNG, GIF, BMP, WEBP, AVIF, HEIC/HEIF, TIFF**. Three things changed and each fixed a real rejection or a real unviewable file:
  - **TIFF was refused outright.** Most document scanners produce it, so a doctor picking their own scan was told "File is not a valid JPEG, PNG or WEBP image". Now accepted.
  - **The stored EXTENSION now comes from the content, never the filename.** It used to prefer the uploaded name and fall back to the MIME subtype, so HEIC bytes were saved as `.jpg` whenever the browser sent `application/octet-stream` (routine on Windows) — served as `image/jpeg` and undrawable by anything. The extension decides the `Content-Type` express.static serves, so it has to describe the bytes.
  - **The multer MIME filter is gone**, deliberately. It refused anything whose `Content-Type` did not start with `image/`, which threw away real HEIC and TIFF uploads. The header is caller-supplied and was never evidence; an empty filter plus the magic-byte check is strictly stronger than a trusted-header filter plus the same check. Five HEIF brands a real iPhone emits (`hevx`, `heim`, `heis`, `hevm`, `hevs`) were also missing and read to the doctor as a corrupt photo.
  - **SVG stays refused, permanently.** It is a script-bearing document and this app renders stored images inline — that is a security boundary, not a format gap. PDF is refused too (it is not an image; the galleries render `<img>`).
  - The rejection message now names every accepted format. It used to say "JPEG, PNG or WEBP" while the code also took GIF, BMP, AVIF and HEIC, sending doctors to convert files that would have been accepted.
  - The client mirrors this table in `client/src/lib/imageFormats.ts` and converts HEIC/TIFF to JPEG **before** upload, so one arriving here is a browser that could not. The two copies are pinned by tests sharing the same signature literals (`upload.service.spec.ts` ⇄ `imageFormats.test.ts`) — **edit one, edit both.**
- **CORS is registered BEFORE `useStaticAssets` in `main.ts` (2026-09-24), and the order is load-bearing.** express.static answers a file itself and never calls `next()`, so with CORS registered after it every real `/uploads` file went out with no `Access-Control-Allow-Origin` (only 404s had one). The galleries' Download PDF reads the image bytes with `fetch`, which the browser refuses cross-origin without it. Only the `CORS_ORIGIN` list is allowed; `<img>` loading is unaffected.
- Uploaded files are on-disk under `uploads/` (served at `/uploads/<file>`) — hosted URLs, never base64 into the DB. `server/.gitignore` anchors this as `/uploads/`: an unanchored `uploads/` **also matched `src/uploads/`**, the upload module, so a new file added there was silently untracked and never deployed. Keep the leading slash.
- The upload size limit is **8 MB on purpose**. `compressImage()` on the client returns the ORIGINAL file whenever `createImageBitmap` throws (HEIC on most desktop browsers), for GIFs, and whenever the re-encode isn't smaller — and `upload.service.ts#checkMagic` accepts `heic`/`heif`/`avif` deliberately. iPhone report photos are routinely 3-8 MB; a tighter ceiling rejects real uploads. The hardening that matters is the magic-byte check, not the last few MB.
