// Repair image URLs that were stamped with `http://localhost:<port>` and written
// into the SHARED production database by a local development server.
//
//   node scripts/repair-localhost-image-urls.js --scan
//   node scripts/repair-localhost-image-urls.js --stage <dir>
//   node scripts/repair-localhost-image-urls.js --apply --target https://api.muqsithealthsystem.com
//
// This file is deliberately .js, NOT .ts. `server/tsconfig.json` sets no
// `rootDir`, so a single .ts file outside `src/` moves the whole build output to
// `dist/src/main.js`, `start:prod` cannot resolve it, pm2 crash-loops and nginx
// returns 502. It happened on 2026-07-30. See server/CLAUDE.md.
//
// WHY THIS EXISTS
//   `src/uploads/upload.service.ts` stamps the ABSOLUTE public URL of a file at
//   upload time, from `PUBLIC_URL`. On a developer's laptop that is
//   `http://localhost:4000`, and the database is the live one (dev reaches it
//   through an SSH tunnel — root CLAUDE.md). So every image uploaded while
//   working locally is written into a doctor's real record as a URL no other
//   machine on earth can open: the live site shows "Did not load" and the
//   browser console reads `net::ERR_CONNECTION_REFUSED`. The file itself is
//   fine — it is on the laptop's disk, not the server's.
//
// ⚕️ WHAT IT WILL NOT DO
//   * It NEVER rewrites a URL whose file is not already SERVING at the target
//     origin. Every filename is HEAD-checked first and anything that is not a
//     live 200 is reported and left exactly as it is. A broken link a doctor can
//     see and report is better than a rewritten one that 404s silently.
//   * It changes ONLY the `http://localhost:<port>` prefix of a matched URL. The
//     filename, the array order, the JSON shape, and every other byte of the
//     record are untouched. No image is added, removed, reordered or merged.
//   * Each column is rewritten by ONE atomic UPDATE, so a doctor writing to the
//     same row while it runs cannot lose their edit to a read-modify-write.
//   * It is idempotent: once a URL points at the target origin it no longer
//     matches, so a second run is a no-op.
//
// THE ORDER MATTERS
//   The files must be on the target server BEFORE --apply, or the verification
//   refuses every URL and nothing is written. Use --stage to collect them.

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

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

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// The shape this repairs, and nothing wider. A URL is only ever a candidate when
// it is localhost, on the /uploads/ path, and ends in a single safe filename —
// so a crafted value can never become a path that walks out of the directory.
const LOCAL_URL =
  /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::\d+)?\/uploads\/([A-Za-z0-9._-]+)/g;

// The same shape as a POSIX regex, for the `~` operator and regexp_replace.
// The host and port are ONE group so the replacement can keep the filename.
// A LIKE was tried first and is wrong: `'%localhost:%/uploads/%'` misses
// `127.0.0.1`, misses `http://localhost/uploads/x` (no port at all), and misses
// the `[::1]` form — all of which this repairs and the upload guard refuses.
const PG_LOCAL_HOST = '(localhost|127(\\.[0-9]{1,3}){3}|0\\.0\\.0\\.0|\\[::1\\])';
const PG_LOCAL_URL = `https?://${PG_LOCAL_HOST}(:[0-9]+)?/uploads/`;

// ── scanning ──────────────────────────────────────────────────────────────────
// Ask the database which columns actually hold one of these URLs rather than
// listing the models by hand. An image URL reaches more columns than the two
// galleries — a draft's investigation images, an activity-feed attachment, a
// chat attachment, a ward page — and a hand-written list is how one gets missed.
// The cast that takes `regexp_replace(col::text, …)` back to the column's own
// type, or null when this script must not touch it. Refusing an unknown type is
// the point: a wrong cast on a patient's record is worse than an unrepaired
// image, and the run reports every column it skipped.
function castFor(h) {
  if (h.type === 'text' || h.type === 'character varying') return '';
  if (h.type === 'json') return '::json';
  // jsonb has no key order of its own — it re-sorts by key length then bytes —
  // so rewriting a KEY legitimately reorders the stored text. That is not a
  // loss (`imageThumbs` is read by key lookup), but it means the repaired text
  // is not byte-identical to a naive string replace. Verified pair-by-pair
  // against the real rows before this was first run.
  if (h.type === 'jsonb') return '::jsonb';
  // An array's text form is a Postgres array literal. Round-tripping it is only
  // safe for text[], and only because a URL carries no character the literal
  // has to quote or escape — the replacement changes the host and nothing else.
  if (h.type === 'ARRAY' && h.udt === '_text') return '::text[]';
  return null;
}

async function findColumns(prisma) {
  const cols = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')
    ORDER BY table_name, column_name
  `);

  const hits = [];
  for (const c of cols) {
    const table = c.table_name;
    const column = c.column_name;
    // Identifiers come from information_schema, but they are still interpolated
    // into SQL — accept only plain names, never quote-escape something exotic.
    if (!/^[A-Za-z0-9_]+$/.test(table) || !/^[A-Za-z0-9_]+$/.test(column)) continue;
    let n;
    try {
      const r = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "${column}"::text ~ $1`,
        PG_LOCAL_URL,
      );
      n = r[0] ? r[0].n : 0;
    } catch {
      continue; // a column whose text cast is not allowed cannot hold a URL
    }
    if (n > 0) hits.push({ table, column, rows: n, type: c.data_type, udt: c.udt_name });
  }
  return hits;
}

async function collectUrls(prisma, hits) {
  const found = new Map(); // filename -> { url, where: Set }
  for (const h of hits) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "${h.column}"::text AS v FROM "${h.table}" WHERE "${h.column}"::text ~ $1`,
      PG_LOCAL_URL,
    );
    for (const r of rows) {
      LOCAL_URL.lastIndex = 0;
      let m;
      while ((m = LOCAL_URL.exec(r.v)) !== null) {
        const file = m[1];
        const cur = found.get(file) ?? { url: m[0], where: new Set() };
        cur.where.add(`${h.table}.${h.column}`);
        found.set(file, cur);
      }
    }
  }
  return found;
}

// ── verification ──────────────────────────────────────────────────────────────
// A URL is only rewritten when the file is already being served at the target.
function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
    req.end();
  });
}

async function verifyAll(files, target, concurrency = 6) {
  const names = [...files];
  const live = new Set();
  const dead = new Map();
  let i = 0;
  const worker = async () => {
    while (i < names.length) {
      const name = names[i++];
      const url = `${target}/uploads/${name}`;
      const code = await head(url);
      if (code === 200) live.add(name);
      else dead.set(name, code);
      const done = live.size + dead.size;
      if (done % 20 === 0) console.log(`  verified ${done}/${names.length}…`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return { live, dead };
}

// ── staging ───────────────────────────────────────────────────────────────────
// Copy the files the database still points at out of THIS machine's uploads
// directory, so they can be moved to the server that has to serve them.
function stage(files, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let copied = 0;
  const missing = [];
  for (const name of files) {
    const src = path.join(UPLOAD_DIR, path.basename(name));
    if (path.dirname(src) !== UPLOAD_DIR || !fs.existsSync(src)) { missing.push(name); continue; }
    fs.copyFileSync(src, path.join(dir, path.basename(name)));
    copied++;
  }
  return { copied, missing };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const has = (f) => args.includes(f);
  // A flag's value is never another flag: `--stage --apply` must not silently
  // stage into a directory called "--apply".
  const valueOf = (f) => {
    const at = args.indexOf(f);
    if (at === -1) return null;
    const v = args[at + 1];
    return v && !v.startsWith('--') ? v : null;
  };

  const apply = has('--apply');
  const stageDir = valueOf('--stage');
  const target = (valueOf('--target') ?? process.env.REPAIR_TARGET_URL ?? '').replace(/\/+$/, '');

  // ⚕️ The target must be an origin OTHER MACHINES can reach, or this tool
  // becomes the bug it repairs. `--target http://localhost:4000` would verify
  // every file as a live 200 (they are on this disk, and the dev server is very
  // likely up) and then rewrite the whole database to localhost — turning a
  // partial outage into a total one, with the run reporting complete success.
  if (target) {
    let url = null;
    try { url = new URL(target); } catch { /* reported below */ }
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      console.error(`--target must be an absolute http(s) origin. Got: ${target}`);
      process.exit(1);
    }
    if (/^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0)$/i.test(url.hostname) && !has('--allow-local-target')) {
      console.error(
        `\nRefusing: --target ${target} is a local address. Rewriting the shared database to\n` +
        `point at this machine is exactly the fault being repaired — and every file would\n` +
        `"verify" because they are already on this disk. Pass the real public origin\n` +
        `(e.g. https://api.muqsithealthsystem.com), or --allow-local-target if you truly\n` +
        `mean a database only this machine uses.`,
      );
      process.exit(1);
    }
  }

  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (and server/.env has none). Aborting.');
    process.exit(1);
  }

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  console.log(`mode          : ${apply ? 'APPLY — the database will be written' : stageDir ? 'STAGE' : 'SCAN — nothing will be written'}`);
  console.log(`uploads on me : ${UPLOAD_DIR}${fs.existsSync(UPLOAD_DIR) ? '' : '  (absent)'}`);
  console.log('');

  console.log('Scanning every text/JSON column in the database…');
  const hits = await findColumns(prisma);
  if (hits.length === 0) {
    console.log('\nNo localhost image URL anywhere in the database. Nothing to repair.');
    await prisma.$disconnect();
    return;
  }
  console.log('\n--- columns holding a localhost image URL ---');
  for (const h of hits) console.log(`  ${String(h.rows).padStart(5)} row(s)  ${h.table}.${h.column}  (${h.type})`);

  const found = await collectUrls(prisma, hits);
  console.log(`\ndistinct files referenced: ${found.size}`);
  const onDisk = fs.existsSync(UPLOAD_DIR) ? new Set(fs.readdirSync(UPLOAD_DIR)) : new Set();
  const here = [...found.keys()].filter((f) => onDisk.has(f));
  console.log(`  present in THIS machine's uploads/: ${here.length}`);
  console.log(`  not on this machine              : ${found.size - here.length}`);

  if (stageDir) {
    const { copied, missing } = stage(found.keys(), stageDir);
    console.log(`\nStaged ${copied} file(s) into ${path.resolve(stageDir)}`);
    if (missing.length) {
      console.log(`${missing.length} file(s) are NOT on this machine and could not be staged:`);
      for (const m of missing) console.log(`  ${m}`);
    }
    console.log('\nNext: copy them to the server that serves /uploads, e.g.');
    console.log(`  scp ${path.resolve(stageDir)}/* root@<vps>:/root/muqsit/server/uploads/`);
    console.log('Then re-run with --apply --target https://api.muqsithealthsystem.com');
    await prisma.$disconnect();
    return;
  }

  if (!target) {
    console.log('\nPass --target <origin> (e.g. https://api.muqsithealthsystem.com) to verify');
    console.log('which of these files are already being served there, and --apply to rewrite.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nVerifying each file against ${target}/uploads/ …`);
  const { live, dead } = await verifyAll(found.keys(), target);
  console.log(`  serving (HTTP 200): ${live.size}`);
  console.log(`  NOT serving       : ${dead.size}`);
  for (const [name, code] of dead) {
    console.log(`    ${code || 'no response'}  ${name}   [${[...found.get(name).where].join(', ')}]`);
  }

  if (live.size === 0) {
    console.log('\nNothing is serving at the target yet — the files still have to be copied there.');
    console.log('Run with --stage <dir> first. Nothing was written.');
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log(`\nSCAN ONLY — ${live.size} URL(s) would be rewritten to ${target}.`);
    console.log('Re-run with --apply to write.');
    await prisma.$disconnect();
    return;
  }

  // Only the VERIFIED filenames are eligible. Building the pattern from that set
  // (rather than a bare host match) is what guarantees an unreachable image is
  // left alone instead of being pointed at a 404.
  //
  // The alternation is CHUNKED. 274 filenames is an ~11 KB regex, and Postgres
  // refuses one past its own complexity limit ("invalid regular expression:
  // regular expression is too complex") — which on an unchunked run would fail
  // somewhere in the middle, after earlier columns had already been rewritten.
  const CHUNK = 40;
  const names = [...live];
  const batches = [];
  for (let i = 0; i < names.length; i += CHUNK) batches.push(names.slice(i, i + CHUNK));

  console.log(`\nRewriting ${live.size} verified URL(s) to ${target}, in ${batches.length} batch(es) …`);
  let total = 0;

  // ONE transaction for the whole repair, for two reasons.
  //
  // A gallery array and the `imageThumbs` map that describes it are different
  // COLUMNS, so separate statements would leave a window where a doctor's page
  // reads a repaired array against an unrepaired thumbnail map. That window is
  // survivable here (a thumbnail miss falls back to the full image, by design)
  // but it costs nothing to close, and the next column pair might not be as
  // forgiving.
  //
  // The second reason is the one that matters: if anything fails part-way, a
  // patient's record must not be left half-rewritten. All of it lands, or none
  // of it does. The timeout is generous because this runs over an SSH tunnel.
  await prisma.$transaction(
    async (tx) => {
      for (const h of hits) {
        const cast = castFor(h);
        if (cast === null) {
          console.log(`  SKIP  ${h.table}.${h.column} — unsupported type ${h.type}/${h.udt}`);
          continue;
        }
        let forColumn = 0;
        for (const batch of batches) {
          const alternation = batch.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
          const pattern = `${PG_LOCAL_URL}(${alternation})`;
          // \4 is the filename: groups 1-3 belong to PG_LOCAL_HOST and the port.
          const replacement = `${target}/uploads/\\4`;
          // Set-based UPDATE, never read-modify-write: a doctor saving to the
          // same row mid-run cannot have their write silently dropped.
          const sql =
            `UPDATE "${h.table}" SET "${h.column}" = regexp_replace("${h.column}"::text, $1, $2, 'g')${cast} ` +
            `WHERE "${h.column}"::text ~ $1`;
          forColumn += await tx.$executeRawUnsafe(sql, pattern, replacement);
        }
        if (forColumn > 0) console.log(`  ${String(forColumn).padStart(5)} row update(s)  ${h.table}.${h.column}`);
        total += forColumn;
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  // Say what is actually left, rather than trusting the arithmetic above.
  console.log('\nRe-scanning to confirm…');
  const left = await findColumns(prisma);
  const leftUrls = left.length ? await collectUrls(prisma, left) : new Map();

  console.log(`\n──────── summary ────────`);
  console.log(`row updates issued    : ${total}`);
  console.log(`URLs verified + fixed : ${live.size}`);
  console.log(`left alone (not live) : ${dead.size}`);
  console.log(`still localhost in DB : ${leftUrls.size} file(s) across ${left.length} column(s)`);
  if (leftUrls.size) {
    for (const h of left) console.log(`    ${String(h.rows).padStart(5)} row(s)  ${h.table}.${h.column}`);
    console.log('Copy the remaining files to the server and re-run; nothing else is needed.');
  } else {
    console.log('No localhost image URL remains anywhere in the database.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\nAborted:', e.message);
  process.exit(1);
});
