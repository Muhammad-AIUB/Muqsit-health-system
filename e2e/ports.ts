// The only servers this suite may talk to. Never 3000 / 4000: those are the
// developer's own dev servers, and the dev API's database is production.
//
// 4200 and 3100 unless another program holds them. On 2026-10-12 another
// project's dev server was listening on 3100: the suite would have "reused"
// it as its own. Set E2E_API_PORT / E2E_WEB_PORT to move the pair for a run
// (the test API is told the web address it must allow — playwright.config.ts).
const port = (name: string, usual: number): number => {
  const raw = process.env[name];
  if (!raw) return usual;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`${name}=${raw} is not a port`);
  // The developer's own servers: web, admin and the API whose database is production.
  if ([3000, 3001, 4000].includes(n)) throw new Error(`${name}=${raw}: the browser suite never runs on the developer's own ports`);
  return n;
};

export const API_PORT = port('E2E_API_PORT', 4200);
// server/test/support/env.ts allows exactly this origin through CORS.
export const WEB_PORT = port('E2E_WEB_PORT', 3100);
if (API_PORT === WEB_PORT) throw new Error('E2E_API_PORT and E2E_WEB_PORT are the same port');
export const TEST_DB_NAME = 'muqsit_e2e_test';
export const API_URL = `http://localhost:${API_PORT}/api`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
