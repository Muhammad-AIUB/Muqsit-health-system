// Backfill Patient.imageThumbs for images uploaded before thumbnails existed.
//
//   node scripts/backfill-image-thumbs.js --dry-run   # report only, writes nothing
//   node scripts/backfill-image-thumbs.js             # generate and record
//   node scripts/backfill-image-thumbs.js --limit 50  # first N patients (a trial run)
//
// This file is deliberately .js, NOT .ts. `server/tsconfig.json` sets no
// `rootDir`, so a single .ts file outside `src/` moves the whole build output to
// `dist/src/main.js`, `start:prod` cannot resolve it, pm2 crash-loops and nginx
// returns 502. It happened on 2026-07-30. See server/CLAUDE.md.
//
// WHAT IT IS FOR
//   From 2026-09-07 every image added to a patient's "All prescriptions(Image)"
//   or "All reports(image)" gallery uploads a 400px copy beside it, recorded in
//   `Patient.imageThumbs` as { [fullImageUrl]: thumbUrl }. Images filed BEFORE
//   that have no entry, so their 150x110 tile still pulls the full original —
//   48 of them on a real record. This generates the missing copies from the
//   files already on this server's disk.
//
// ⚕️ WHAT IT WILL NOT DO
//   * It NEVER touches `prescriptionImages` / `reportImages`. Those arrays are
//     the record — their order is the doctor's own order — and this script only
//     ever adds keys to a display-only side map. Nothing a doctor can see as
//     clinical content is created, moved or removed.
//   * It NEVER overwrites an existing entry, so it is safe to re-run: a URL
//     already in the map is skipped and reported as such.
//   * It never deletes an original. The thumbnail is a NEW file beside it.
//   * It does not touch the ward's analogue order sheets
//     (`IpdAdmission.clinical.analogueSheets`). Those are medico-legal pages
//     written through per-page routes with their own soft-delete and audit
//     trail, and a script doing read-modify-write on that column could clobber
//     a ward round in progress. Backfilling them needs its own design.
//
// WHERE IT HAS TO RUN
//   On the machine that HOLDS the files — the VPS for production images. The
//   database is shared, the `uploads/` directory is not. A URL whose file is
//   not on this disk is skipped and counted, never guessed at.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');

// ── env ───────────────────────────────────────────────────────────────────────
// Prisma Client reads process.env at construction and does not load .env itself.
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ── sharp, installed on demand INTO ITS OWN DIRECTORY ─────────────────────────
// `scripts/.tools/`, never `server/node_modules`, and never `package.json`.
// Three reasons, each learned the hard way on this project:
//   * `npm install` runs on the VPS on every deploy. A native module that fails
//     to build there would take the API down for a convenience script.
//   * Installing into `server/node_modules` makes npm reconcile the whole tree:
//     a run here reported "added 10 packages, removed 4, changed 64" — that is
//     the live API's dependencies moving underneath it, to add a resizer.
//   * Touching `package-lock.json` is what blocked a deploy on 2026-07-20 (see
//     the root CLAUDE.md). An isolated prefix cannot.
// `scripts/.tools/` is gitignored; delete it when the backfill is done.
const TOOLS_DIR = path.join(__dirname, '.tools');

function requireSharp() {
  const local = path.join(TOOLS_DIR, 'node_modules', 'sharp');
  for (const attempt of [local, 'sharp']) {
    try { return require(attempt); } catch { /* try the next */ }
  }

  console.log(`sharp is not installed — installing it into ${TOOLS_DIR} (nothing else is touched)…`);
  try {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    // An empty package.json stops npm walking up to server/package.json and
    // treating this as an install into the API's own tree.
    const manifest = path.join(TOOLS_DIR, 'package.json');
    if (!fs.existsSync(manifest)) {
      fs.writeFileSync(manifest, JSON.stringify({ name: 'mhs-backfill-tools', private: true, version: '1.0.0' }, null, 2));
    }
    // `shell: true` on Windows is required, not cosmetic: since the fix for
    // CVE-2024-27980, Node refuses to spawn a .cmd (npm.cmd) without it and
    // fails with a bare EINVAL. No argument here contains a space, so the shell
    // has nothing to mis-split.
    const isWin = process.platform === 'win32';
    execFileSync(
      isWin ? 'npm.cmd' : 'npm',
      ['install', 'sharp', '--no-audit', '--no-fund'],
      { cwd: TOOLS_DIR, stdio: 'inherit', shell: isWin },
    );
  } catch (e) {
    console.error('Could not install sharp:', e.message);
    console.error(`Install it by hand and re-run:  cd ${TOOLS_DIR} && npm install sharp`);
    process.exit(1);
  }

  try {
    return require(local);
  } catch (e) {
    // npm can finish writing after it returns; a second run always works.
    console.error('sharp installed but could not be loaded yet — re-run the script.', e.message);
    process.exit(1);
  }
}

// ── the same size and quality the browser uses on a new upload ────────────────
// client/src/lib/imageThumbs.ts: THUMB_MAX_DIM = 400, quality 0.8, and
// client/src/lib/compressImage.ts scales by min(1, maxDim / longest side) — so
// the long side is capped at 400 and a smaller image is never enlarged. `fit:
// inside` + `withoutEnlargement` is exactly that; JPEG quality 80 is the same
// 0.8 canvas.toBlob uses. Keep these in step with that file, or a backfilled
// tile will not match one uploaded today.
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 80;

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// The URL the app will serve this file at. Same rule as
// src/uploads/upload.service.ts — if PUBLIC_URL is wrong here, every backfilled
// thumbnail points somewhere the browser cannot reach.
function publicBase() {
  const base = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
  return base.replace(/\/$/, '');
}

// The local file behind an upload URL, or null when it is not on this disk.
// The name is taken from the URL's LAST path segment and re-joined, so a
// crafted value cannot walk out of the uploads directory.
function localFileFor(url) {
  if (typeof url !== 'string') return null;
  const marker = '/uploads/';
  const at = url.lastIndexOf(marker);
  if (at === -1) return null;
  const name = url.slice(at + marker.length).split(/[?#]/)[0];
  if (!name || name.includes('/') || name.includes('\\')) return null;
  const file = path.join(UPLOAD_DIR, path.basename(name));
  if (path.dirname(file) !== UPLOAD_DIR) return null;
  return fs.existsSync(file) ? file : null;
}

// Read the stored map the same way the client does: keep only usable pairs and
// drop anything else, rather than trusting a Json column's shape.
function safeThumbMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [url, thumb] of Object.entries(value)) {
    if (typeof url === 'string' && url && typeof thumb === 'string' && thumb) out[url] = thumb;
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitAt = args.indexOf('--limit');
  const limit = limitAt !== -1 ? Number(args[limitAt + 1]) : null;

  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (and server/.env has none). Aborting.');
    process.exit(1);
  }

  const sharp = requireSharp();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const base = publicBase();
  console.log(`uploads directory : ${UPLOAD_DIR}`);
  console.log(`thumbnail URL base: ${base}`);
  console.log(`mode              : ${dryRun ? 'DRY RUN — nothing will be written' : 'WRITING'}`);

  // ⚕️ The database is SHARED between local development and production (see the
  // root CLAUDE.md: dev reaches the live Postgres through an SSH tunnel). A run
  // on a developer's laptop therefore writes into the doctors' real records —
  // and every thumbnail URL it minted would point at `localhost:4000`, which on
  // the live site is a broken image behind a mixed-content block. The files it
  // resized are the developer's own local uploads, so this is never the run that
  // was wanted. Refuse it, and say exactly what to do instead.
  if (!dryRun && /^https?:\/\/(localhost|127\.0\.0\.1|\[?::1\]?)(:|\/|$)/i.test(base)) {
    console.error(
      `\nRefusing to write: PUBLIC_URL resolves to ${base}, so every thumbnail URL would\n` +
      `point at this machine — unreachable from the live site, and this database is shared\n` +
      `with production. Run this ON THE SERVER that holds the files, where PUBLIC_URL is the\n` +
      `real domain. To backfill a genuinely local-only database anyway, pass --allow-localhost.`,
    );
    if (!args.includes('--allow-localhost')) process.exit(1);
    console.error('--allow-localhost given — continuing.\n');
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`\nNo uploads directory at ${UPLOAD_DIR}. Run this on the server that holds the files.`);
    process.exit(1);
  }
  console.log('');

  const patients = await prisma.patient.findMany({
    select: { id: true, name: true, prescriptionImages: true, reportImages: true, imageThumbs: true },
    orderBy: { createdAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  const stats = { patients: patients.length, touched: 0, made: 0, already: 0, missing: 0, notSmaller: 0, failed: 0 };

  for (const p of patients) {
    const rx = Array.isArray(p.prescriptionImages) ? p.prescriptionImages : [];
    const rep = Array.isArray(p.reportImages) ? p.reportImages : [];
    // One image can legitimately sit in both galleries — de-duplicate so it is
    // resized once and both tiles read the same small copy.
    const urls = [...new Set([...rx, ...rep])].filter((u) => typeof u === 'string' && u);
    if (urls.length === 0) continue;

    const stored = safeThumbMap(p.imageThumbs);
    const added = {};

    for (const url of urls) {
      if (stored[url]) { stats.already++; continue; }

      const file = localFileFor(url);
      if (!file) {
        stats.missing++;
        console.log(`  skip  [not on this disk] ${url}`);
        continue;
      }

      const name = `${randomUUID()}.jpg`;
      const dest = path.join(UPLOAD_DIR, name);
      try {
        const originalBytes = fs.statSync(file).size;
        if (dryRun) {
          stats.made++;
          console.log(`  would make ${path.basename(file)} -> <new>.jpg  (${Math.round(originalBytes / 1024)} KB original)`);
          continue;
        }

        const out = await sharp(file)
          .rotate() // honour the EXIF orientation of a phone photo before resizing
          .resize({ width: THUMB_MAX_DIM, height: THUMB_MAX_DIM, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: THUMB_QUALITY })
          .toBuffer();

        // The browser keeps the original whenever the re-encode is not smaller
        // (compressImage). Do the same: leave no entry, and the tile falls back
        // to the full image exactly as it does today. Writing a "thumbnail"
        // bigger than the thing it stands in for would be a regression.
        if (out.length >= originalBytes) {
          stats.notSmaller++;
          console.log(`  skip  [resize not smaller] ${path.basename(file)}`);
          continue;
        }

        fs.writeFileSync(dest, out);
        added[url] = `${base}/uploads/${name}`;
        stats.made++;
        console.log(
          `  made  ${path.basename(file)} ${Math.round(originalBytes / 1024)} KB -> ${name} ${Math.round(out.length / 1024)} KB`,
        );
      } catch (e) {
        stats.failed++;
        console.log(`  FAIL  ${path.basename(file)}: ${e.message}`);
      }
    }

    if (Object.keys(added).length === 0) continue;
    stats.touched++;

    if (dryRun) continue;

    // Re-read the row inside a transaction with a lock before merging. The app
    // writes this same column whenever a doctor adds an image, and a plain
    // read-modify-write from a long-running script would silently drop whatever
    // landed while it was resizing. Same posture as patients.service#linkNew.
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT "imageThumbs" FROM "Patient" WHERE "id" = ${p.id} FOR UPDATE`;
      const fresh = safeThumbMap(locked[0] && locked[0].imageThumbs);
      // `fresh` wins: an entry the app wrote a moment ago is the newer truth.
      await tx.patient.update({
        where: { id: p.id },
        data: { imageThumbs: { ...added, ...fresh } },
      });
    });
    console.log(`  saved ${Object.keys(added).length} thumbnail(s) for patient ${p.id}\n`);
  }

  console.log('\n──────── summary ────────');
  console.log(`patients scanned      : ${stats.patients}`);
  console.log(`patients updated      : ${stats.touched}`);
  console.log(`thumbnails ${dryRun ? 'to make  ' : 'made     '}  : ${stats.made}`);
  console.log(`already had one       : ${stats.already}`);
  console.log(`file not on this disk : ${stats.missing}`);
  console.log(`resize not smaller    : ${stats.notSmaller}`);
  console.log(`failed                : ${stats.failed}`);
  if (dryRun) console.log('\nDRY RUN — nothing was written. Re-run without --dry-run to apply.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nAborted:', e.message);
  process.exit(1);
});
