// Boots the real API on :4100 against a throwaway test database, for the
// browser (E2E) and k6 (load) suites. Same pipeline as production; mail is
// captured and the rate limiter does not count — both suites drive every
// request from one address.
//
//   TEST_DB_NAME=muqsit_e2e_test npm run test:serve
import './support/env';
import { createTestApp } from './support/app';

async function main() {
  const t = await createTestApp();
  const port = Number(process.env.TEST_PORT ?? 4100);
  await t.app.listen(port);
  console.log(`test API on http://localhost:${port}/api  db=${process.env.TEST_DB_NAME ?? 'muqsit_int_test'}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
