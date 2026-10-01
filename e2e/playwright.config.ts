import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';
import { API_PORT, API_URL, TEST_DB_NAME, WEB_PORT, WEB_URL } from './ports';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  // A flaky test is a defect to fix, not to retry.
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // The real API against the throwaway Docker Postgres. `test:serve`
      // imports test/support/env.ts first, which overrides DATABASE_URL.
      command: 'npm run test:serve',
      cwd: join(__dirname, '..', 'server'),
      env: { TEST_DB_NAME, TEST_PORT: String(API_PORT) },
      // 401 without a cookie — which Playwright accepts as "up".
      url: `${API_URL}/auth/me`,
      reuseExistingServer: true,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // A process env var wins over client/.env.local in Next, so the browser
      // bundle talks to the test API. Its own distDir keeps it out of the
      // `.next` a developer's dev server is using.
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: join(__dirname, '..', 'client'),
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_DIST_DIR: '.next-e2e' },
      url: `${WEB_URL}/login`,
      reuseExistingServer: true,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
