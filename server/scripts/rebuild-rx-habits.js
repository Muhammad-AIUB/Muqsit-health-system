// Rebuild DoctorRxHabit from the prescription record.
//
//   node scripts/rebuild-rx-habits.js --dry-run     # report only, writes nothing
//   node scripts/rebuild-rx-habits.js               # rebuild
//
// This file is deliberately .js, NOT .ts. `server/tsconfig.json` sets no
// `rootDir`, so a single .ts file outside `src/` moves the whole build output
// to `dist/src/main.js`, `start:prod` cannot resolve it, pm2 crash-loops and
// nginx returns 502. It happened on 2026-07-30. See server/CLAUDE.md.
//
// WHAT IT IS FOR
//   DoctorRxHabit is a derived copy of what each doctor has prescribed. If it
//   ever disagrees with the record — a missed write during a deploy, a changed
//   normalisation rule, a restored backup — this script is the repair: it
//   recomputes the whole table from Prescription/PrescriptionItem, so the
//   suggestions can never drift permanently away from what was really signed.
//
// ⚕️ IT NEVER WRITES TO Prescription / PrescriptionItem. Read-only on the record.

const path = require('path');
const fs = require('fs');

// ── env ───────────────────────────────────────────────────────────────────────
// Prisma Client reads process.env at construction and does not load .env itself.
// Parsed here rather than pulling in a dependency this script would be the only
// user of.
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
loadEnv();

// ── the normalisation algorithm ───────────────────────────────────────────────
// Loaded from the SAME module the API uses — never reimplemented here. A second
// copy of the key algorithm would drift, and the day it drifted this script
// would rewrite every habit row with keys the running server does not produce.
function loadNormalise() {
  const candidates = [
    '../dist/rx-habits/normalise', // normal build output
    '../dist/src/rx-habits/normalise', // if the rootDir trap ever moves it
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch (e) {
      if (e && e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  // Dev machine with no build: compile the TypeScript on the fly.
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', target: 'es2021' },
  });
  return require('../src/rx-habits/normalise');
}

const { PrismaClient } = require('@prisma/client');
const { ALGO_VERSION, normaliseDrugKey, searchKeyOf, signatureOf, blockKey } = loadNormalise();

// Field separators for in-memory composite keys. Named constants rather than
// literal control characters, which are invisible in an editor and do not
// survive every diff tool. Same values as server/src/rx-habits/normalise.ts.
const US = String.fromCharCode(0x1f); // Unit Separator
const RS = String.fromCharCode(0x1e); // Record Separator
const GS = String.fromCharCode(0x1d); // Group Separator

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 200;

// ── block assembly ────────────────────────────────────────────────────────────
// Mirrors RxHabitsService.blocksFrom. Kept here as a small, commented copy
// rather than importing the service, which would drag in Nest's DI container
// and a live PrismaService just to walk an array. The RULES it implements are
// pinned by server/src/rx-habits/blocks.spec.ts.
function blocksFrom(items) {
  const ordered = [...(items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const drafts = [];
  let open = null;

  for (const it of ordered) {
    if (!it) continue;
    if (it.isNote) {
      open = null; // a note TERMINATES the block above it
      continue;
    }
    const line = {
      dose: it.dose || '',
      food: it.instruction || '',
      duration: it.duration || '',
    };
    const drug = (it.drug || '').trim();
    // `isCont` FIRST: savePrescription fills the medicine's name back into every
    // continuation so the printed sheet is self-contained, so a stored taper has
    // a filled drug and only the flag distinguishes it. Rows written before
    // 2026-08-17 have no flag and fall through to the blank-drug rule.
    const isContinuation = it.isCont === true || !drug;
    if (!isContinuation) {
      open = { drugLabel: drug, head: line, contLines: [] };
      drafts.push(open);
    } else if (open) {
      open.contLines.push(line);
    }
    // else: a continuation before any head — malformed, discarded, never guessed.
  }

  const out = [];
  const seen = new Set();
  for (const d of drafts) {
    const filled = (l) => Boolean(l.dose.trim() || l.food.trim() || l.duration.trim());
    // An empty block is not a habit — an unfinished line must never outrank the
    // instruction the doctor actually wanted.
    if (!filled(d.head) && d.contLines.length === 0) continue;
    const drugKey = normaliseDrugKey(d.drugLabel);
    if (!drugKey) continue;
    const signature = signatureOf(d.head, d.contLines);
    const k = blockKey(drugKey, signature);
    if (seen.has(k)) continue; // one prescription is ONE contribution
    seen.add(k);
    out.push({
      drugKey,
      searchKey: searchKeyOf(d.drugLabel),
      drugLabel: d.drugLabel,
      signature,
      dose: d.head.dose,
      food: d.head.food,
      duration: d.head.duration,
      contLines: d.contLines,
    });
  }
  return out;
}

// ── flag preservation: BY CONTENT, NEVER BY SIGNATURE ─────────────────────────
//
// ⚕️ THIS IS THE MOST IMPORTANT FUNCTION IN THE FILE. `signature` is the OUTPUT
// of the normalisation algorithm. Joining old flags to new rows on `signature`
// looks equivalent and is not: the day anyone fixes a normalisation rule, every
// signature changes, every `hidden` flag orphans, and EVERY DOSE THE DOCTOR
// DELIBERATELY SUPPRESSED COMES BACK SILENTLY — including rows suppressed
// because the record itself is malformed (production carries an Avolac row with
// the same sentence in all three columns).
//
// So the flags are re-attached by the fields stored VERBATIM — drugLabel, dose,
// food, duration and the continuation lines — which do not move when the
// normalisation rules change.
//
// Folded here: outer whitespace and case only. That is typography, not the
// normalisation algorithm (no form expansion, no strength-gap closing, no n/a
// drop), so it survives a stray trailing space without ever depending on a rule
// that might be edited.
const fold = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();

function contentKey(doctorId, row) {
  const cont = Array.isArray(row.contLines) ? row.contLines : [];
  const lines = cont
    .map((c) => (c && typeof c === 'object' ? [fold(c.dose), fold(c.food), fold(c.duration)] : ['?', '?', '?']))
    .map((t) => t.join(US))
    .join(RS);
  return [doctorId, fold(row.drugLabel), fold(row.dose), fold(row.food), fold(row.duration), lines].join(GS);
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  const prisma = new PrismaClient();
  const started = Date.now();
  try {
    console.log(DRY_RUN ? '── DRY RUN — nothing will be written ──' : '── REBUILD ──');
    console.log(`algoVersion = ${ALGO_VERSION}`);

    // 1. Read the existing table first, so the doctor's own decisions survive.
    const existing = await prisma.doctorRxHabit.findMany({
      select: {
        id: true, doctorId: true, drugLabel: true, dose: true, food: true,
        duration: true, contLines: true, pinned: true, hidden: true, algoVersion: true,
      },
    });
    const before = existing.length;
    const staleAlgo = existing.filter((r) => r.algoVersion !== ALGO_VERSION).length;

    const flags = new Map();
    for (const r of existing) {
      if (!r.pinned && !r.hidden) continue;
      flags.set(contentKey(r.doctorId, r), { pinned: r.pinned, hidden: r.hidden });
    }
    const flagsToReapply = flags.size;

    console.log(`Existing rows: ${before}  (${staleAlgo} built by an older algoVersion)`);
    console.log(`Rows carrying a pinned/hidden flag: ${flagsToReapply}`);

    // 2. Stream every prescription, oldest first, and recompute from scratch.
    //    Oldest-first matters: drugLabel and the verbatim instruction fields end
    //    up holding the doctor's MOST RECENT spelling, matching the write path.
    const habits = new Map(); // doctorId+GS+drugKey+GS+signature → accumulator
    let scanned = 0;
    let skip = 0;
    for (;;) {
      const page = await prisma.prescription.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: BATCH,
        select: {
          id: true, doctorId: true, patientId: true, createdAt: true,
          items: {
            orderBy: { order: 'asc' },
            select: { drug: true, dose: true, duration: true, instruction: true, isNote: true, isCont: true, order: true },
          },
        },
      });
      if (page.length === 0) break;
      for (const rx of page) {
        scanned += 1;
        for (const b of blocksFrom(rx.items)) {
          const key = [rx.doctorId, b.drugKey, b.signature].join(GS);
          let acc = habits.get(key);
          if (!acc) {
            acc = { doctorId: rx.doctorId, patients: new Set(), lastUsedAt: rx.createdAt, block: b };
            habits.set(key, acc);
          }
          acc.patients.add(rx.patientId);
          // patientCount counts DISTINCT PATIENTS, not prescriptions.
          if (rx.createdAt >= acc.lastUsedAt) {
            acc.lastUsedAt = rx.createdAt;
            acc.block = b; // most recent spelling / verbatim instruction wins
          }
        }
      }
      skip += page.length;
    }

    // 3. Build the desired table and re-attach the flags by content.
    const byDoctor = new Map();
    let reapplied = 0;
    for (const acc of habits.values()) {
      const b = acc.block;
      const row = {
        doctorId: acc.doctorId,
        drugKey: b.drugKey,
        searchKey: b.searchKey,
        drugLabel: b.drugLabel,
        signature: b.signature,
        algoVersion: ALGO_VERSION,
        dose: b.dose,
        food: b.food,
        duration: b.duration,
        contLines: b.contLines,
        patientCount: acc.patients.size,
        lastUsedAt: acc.lastUsedAt,
        pinned: false,
        hidden: false,
      };
      const f = flags.get(contentKey(acc.doctorId, row));
      if (f) {
        row.pinned = f.pinned;
        row.hidden = f.hidden;
        reapplied += 1;
        flags.delete(contentKey(acc.doctorId, row));
      }
      if (!byDoctor.has(acc.doctorId)) byDoctor.set(acc.doctorId, []);
      byDoctor.get(acc.doctorId).push(row);
    }

    const after = [...byDoctor.values()].reduce((n, rows) => n + rows.length, 0);
    const orphaned = [...flags.keys()];

    console.log(`Prescriptions scanned: ${scanned}`);
    console.log(`Habit rows computed:   ${after}  (was ${before})`);
    console.log(`Flags re-applied:      ${reapplied} of ${flagsToReapply}`);
    if (orphaned.length) {
      console.log(
        `⚠ Flags that could NOT be matched: ${orphaned.length} — the prescription ` +
          'they came from is no longer in the record, so the habit no longer exists. ' +
          'These suggestions will simply not appear; nothing was resurrected.',
      );
      for (const k of orphaned.slice(0, 10)) {
        console.log(`    · ${k.split(GS).slice(1, 5).join(' | ')}`);
      }
    }

    // Sample, so the operator can eyeball what was built.
    const sample = [...habits.values()]
      .sort((a, b) => b.patients.size - a.patients.size)
      .slice(0, 8);
    console.log('\nTop rows by distinct patients:');
    for (const s of sample) {
      const b = s.block;
      const instr = [b.dose, b.food, b.duration].map((v) => v.trim()).filter(Boolean).join(' · ') || '(blank)';
      const taper = b.contLines.length ? ` +${b.contLines.length} taper line(s)` : '';
      console.log(`    ${s.patients.size}× patients  ${b.drugLabel}  ${instr}${taper}`);
    }

    if (DRY_RUN) {
      console.log('\nDry run — no changes written.');
      return;
    }

    // 4. Write, one transaction per doctor: a crash can never leave one doctor's
    //    suggestions half-rebuilt, and re-running produces exactly this table.
    let written = 0;
    for (const [doctorId, rows] of byDoctor) {
      await prisma.$transaction([
        prisma.doctorRxHabit.deleteMany({ where: { doctorId } }),
        prisma.doctorRxHabit.createMany({ data: rows }),
      ]);
      written += rows.length;
    }
    // Doctors who have habit rows but no longer any prescription producing them.
    const stale = await prisma.doctorRxHabit.deleteMany({
      where: { doctorId: { notIn: [...byDoctor.keys()] } },
    });
    if (stale.count) console.log(`Removed ${stale.count} row(s) for doctors with no derivable habits.`);

    const total = await prisma.doctorRxHabit.count();
    console.log(`\nWrote ${written} row(s). Table now holds ${total}.`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } catch (e) {
    console.error('\nREBUILD FAILED — the table was left as it was for any doctor not yet processed.');
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
