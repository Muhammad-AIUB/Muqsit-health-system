import type { PrismaClient } from '@prisma/client';

// The ONLY database a test may touch. The dev DATABASE_URL reaches production
// through an SSH tunnel that looks like `localhost:5432`, so "it is on
// localhost" proves nothing — the port, the name suffix and a marker table
// that only setup-db.js creates are all required.
export const TEST_DB_HOST = '127.0.0.1:5544';
export const TEST_DB_MARKER = '__muqsit_test_marker';
export const TEST_DB_NAMES = [
  'muqsit_int_test',
  'muqsit_int2_test',
  'muqsit_e2e_test',
  'muqsit_load_test',
] as const;

export function testDbUrl(name: string): string {
  return `postgresql://test:test@${TEST_DB_HOST}/${name}?schema=public`;
}

export function assertTestDbUrl(url: string | undefined): void {
  let ok = false;
  try {
    const u = new URL(url ?? '');
    ok = u.host === TEST_DB_HOST && u.pathname.slice(1).endsWith('_test');
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new Error(
      `REFUSING TO RUN: DATABASE_URL is not the throwaway test database ` +
        `(expected host ${TEST_DB_HOST} and a name ending "_test"). ` +
        `Tests must never reach the shared production database.`,
    );
  }
}

// Second, independent proof taken from the live connection itself.
export async function assertTestDatabase(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<{ db: string; marker: string | null }[]>(
    `SELECT current_database() AS db, to_regclass('public."${TEST_DB_MARKER}"')::text AS marker`,
  );
  if (!row || !row.db.endsWith('_test') || !row.marker) {
    throw new Error(
      `REFUSING TO RUN: connected database "${row?.db}" is not a prepared test ` +
        `database (marker table missing). Run \`npm run test:db\`.`,
    );
  }
}

// Empties every application table. `medicines` is reference data seeded by
// setup-db.js and is kept, as is the marker.
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await assertTestDatabase(prisma);
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'
       AND tablename NOT IN ('medicines', '${TEST_DB_MARKER}')`,
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
