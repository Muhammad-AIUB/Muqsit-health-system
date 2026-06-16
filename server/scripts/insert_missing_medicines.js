// One-off: insert the missing medicine rows (from _missing_rows.json) into the
// VPS `medicines` table. Re-checks existing keys at run time so re-running can
// never create duplicates. Inserts in batches inside a single transaction.

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");

const MISSING = "C:/Users/mdjub/Downloads/_missing_rows.json";
const BATCH = 500;
const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();
const keyOf = (r) => [norm(r.brandName), norm(r.strength), norm(r.dosageForm), norm(r.company)].join("|");

(async () => {
  const p = new PrismaClient();
  try {
    const before = (await p.$queryRawUnsafe('SELECT COUNT(*)::int n FROM medicines'))[0].n;

    // Current keys in the table (guards against partial / repeat runs).
    const existingRows = await p.$queryRawUnsafe(
      'SELECT "brandName","strength","dosageForm","company" FROM medicines',
    );
    const existing = new Set(existingRows.map(keyOf));

    const all = JSON.parse(fs.readFileSync(MISSING, "utf8"));
    const seen = new Set();
    const rows = all.filter((r) => {
      if (!r.brandName || !r.genericName) return false;
      const k = keyOf(r);
      if (existing.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log(`Table before: ${before} rows`);
    console.log(`Will insert: ${rows.length} rows (skipped ${all.length - rows.length} already-present/dupe)`);
    if (rows.length === 0) { await p.$disconnect(); return; }

    const cols = ["genericName", "brandName", "dosageForm", "strength", "company", "priceRaw", "price"];
    const stmts = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = slice.map((r) => {
        const base = params.length;
        params.push(r.genericName, r.brandName, r.dosageForm ?? null, r.strength ?? null, r.company ?? null, r.priceRaw ?? null, r.price ?? null);
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`;
      });
      const sql = `INSERT INTO medicines ("genericName","brandName","dosageForm","strength","company","priceRaw","price") VALUES ${tuples.join(",")}`;
      stmts.push(p.$executeRawUnsafe(sql, ...params));
    }

    await p.$transaction(stmts);

    const after = (await p.$queryRawUnsafe('SELECT COUNT(*)::int n FROM medicines'))[0].n;
    console.log(`Table after: ${after} rows  (+${after - before})`);
    await p.$disconnect();
  } catch (e) {
    console.error("FAILED:", e.message);
    await p.$disconnect();
    process.exit(1);
  }
})();
