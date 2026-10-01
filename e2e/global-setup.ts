import { execSync } from 'child_process';
import { join } from 'path';
import { API_PORT, TEST_DB_NAME, WEB_URL } from './ports';

// Runs after both web servers are up.
//
// 1. Empties the throwaway E2E database and creates the doctors the specs sign
//    in as. The seed script itself refuses any database but the test container
//    (server/test/support/test-db.ts) — the dev DATABASE_URL is production.
// 2. Asks the dev server for the two routes every journey opens, so `next dev`
//    compiles them here (a minute or more on a cold cache) instead of inside
//    the first test's timeout.
export default async function globalSetup() {
  execSync('npx ts-node --transpile-only test/seed-e2e.ts', {
    cwd: join(__dirname, '..', 'server'),
    stdio: 'inherit',
    env: { ...process.env, TEST_DB_NAME, TEST_PORT: String(API_PORT) },
  });

  for (const path of ['/login', '/prescription']) {
    const res = await fetch(`${WEB_URL}${path}`, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`warm-up of ${path} answered ${res.status}`);
  }
}
