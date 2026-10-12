import { assertTestDbUrl, testDbUrl } from './test-db';

// Runs before any module is imported (jest `setupFiles`, and first line of
// serve.ts). ConfigModule and Prisma both read server/.env, but neither
// overrides a variable that is already set — so setting these here is what
// keeps the production DATABASE_URL in .env from ever being used by a test.
const url = testDbUrl(process.env.TEST_DB_NAME ?? 'muqsit_int_test');
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else-0123456789';
process.env.JWT_EXPIRES_IN = '15m';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_SAMESITE = 'lax';
process.env.COOKIE_DOMAIN = '';
// Exactly one origin, and a local one: the test web server. It is on 3100
// unless the browser suite was moved for a run (e2e/ports.ts).
const webOrigin = process.env.TEST_WEB_ORIGIN || 'http://localhost:3100';
if (!/^http:\/\/localhost:\d{4,5}$/.test(webOrigin)) throw new Error(`TEST_WEB_ORIGIN=${webOrigin} is not a local test origin`);
process.env.CORS_ORIGIN = webOrigin;
process.env.PUBLIC_URL = 'http://localhost:4100';
// The test database is genuinely local-only, which is the one case this flag
// exists for (see upload.service.ts).
process.env.ALLOW_LOCALHOST_UPLOAD_URLS = 'true';
// Never send real mail or SMS from a test run, whatever .env holds.
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMS_CUSTOMER_ID = '';
process.env.SMS_API_KEY = '';

assertTestDbUrl(process.env.DATABASE_URL);
