import { defineConfig } from '@playwright/test';

/**
 * End-to-end suite against a real Next.js production build and a dedicated,
 * freshly migrated + seeded database (luma_e2e). Run: npm run test:e2e
 * (requires `npm run build` first; the global setup rebuilds the e2e DB).
 */
const PORT = 3100;
const DB = 'luma_e2e';
export const E2E_ENV = {
  // production build, private review deployment: sandbox payments + dev outbox + demo sign-in
  LUMA_DEPLOYMENT: 'review',
  LUMA_DEV_OTP: '1',
  LUMA_DEMO_MODE: '1',
  PAYMENTS_SANDBOX_ENABLED: '1',
  APP_BASE_URL: `http://127.0.0.1:${PORT}`,
  DATABASE_URL: `postgres://luma_app:luma_dev_app@127.0.0.1:5432/${DB}`,
  MIGRATION_DATABASE_URL: `postgres://luma_owner:luma_dev_owner@127.0.0.1:5432/${DB}`,
  APP_DB_ROLE: 'luma_app',
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdef0123456789abcdef',
  LUMA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  STORAGE_LOCAL_DIR: './storage-e2e',
};

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.ts/,
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: '../..',
    port: PORT,
    reuseExistingServer: false,
    timeout: 120000,
    env: E2E_ENV,
  },
});
