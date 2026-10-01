// READ-ONLY schema comparison: production ⇄ the throwaway test database.
//
// The test database is built from schema.prisma; production is built by hand
// from prisma/manual-*.sql. If the two differ, a green integration suite is
// describing a database that does not exist. This lists every difference in
// tables, columns (type, nullability) and indexes.
//
// It runs SELECTs against information_schema / pg_indexes and nothing else,
// inside a READ ONLY transaction — it cannot change production.
//
//   node scripts/schema-drift.js        (needs the SSH tunnel and the test DB)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const PROD = process.env.DATABASE_URL;
const TEST = 'postgresql://test:test@127.0.0.1:5544/muqsit_int_test?schema=public';
const IGNORE = new Set(['__muqsit_test_marker', '_prisma_migrations']);

async function snapshot(url) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const columns = await tx.$queryRawUnsafe(
        `SELECT table_name, column_name, data_type, udt_name, is_nullable
           FROM information_schema.columns WHERE table_schema = 'public'`,
      );
      const indexes = await tx.$queryRawUnsafe(
        `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
      );
      return { columns, indexes };
    });
  } finally {
    await db.$disconnect();
  }
}

function keyed(rows, key, val) {
  const m = new Map();
  for (const r of rows) if (!IGNORE.has(r.table_name ?? r.tablename)) m.set(key(r), val(r));
  return m;
}

function diff(label, prod, test) {
  const lines = [];
  for (const [k, v] of prod) {
    if (!test.has(k)) lines.push(`  only in PRODUCTION: ${k}  ${v}`);
    else if (test.get(k) !== v) lines.push(`  differs: ${k}\n      prod: ${v}\n      test: ${test.get(k)}`);
  }
  for (const [k, v] of test) if (!prod.has(k)) lines.push(`  only in TEST (schema.prisma): ${k}  ${v}`);
  console.log(`\n${label}: ${lines.length} difference(s)`);
  for (const l of lines.sort()) console.log(l);
  return lines.length;
}

(async () => {
  if (!PROD) throw new Error('DATABASE_URL is not set in server/.env');
  const [prod, test] = await Promise.all([snapshot(PROD), snapshot(TEST)]);
  const col = (s) =>
    keyed(s.columns, (r) => `${r.table_name}.${r.column_name}`, (r) => `${r.udt_name}${r.is_nullable === 'YES' ? ' NULL' : ' NOT NULL'}`);
  // Index names can differ for the same definition; compare the definition.
  const idx = (s) =>
    keyed(s.indexes, (r) => `${r.tablename}: ${r.indexdef.replace(/INDEX "?[^" ]+"? ON/, 'INDEX ON')}`, () => '');
  const n = diff('columns', col(prod), col(test)) + diff('indexes', idx(prod), idx(test));
  process.exit(n ? 1 : 0);
})().catch((e) => {
  console.error((e.errorCode || e.code) === 'P1001' ? 'Cannot reach a database (is the SSH tunnel up? is the test container running?)' : e);
  process.exit(2);
});
