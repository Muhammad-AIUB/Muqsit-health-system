// The only servers this suite may talk to. Never 3000 / 4000: those are the
// developer's own dev servers, and the dev API's database is production.
export const API_PORT = 4200;
// server/test/support/env.ts allows exactly this origin through CORS.
export const WEB_PORT = 3100;
export const TEST_DB_NAME = 'muqsit_e2e_test';
export const API_URL = `http://localhost:${API_PORT}/api`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
