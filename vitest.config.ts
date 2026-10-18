import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  // tsconfig keeps jsx: preserve for Next.js; tests that render components need the automatic runtime
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://luma_app:luma_dev_app@127.0.0.1:5432/luma_test',
      MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://luma_owner:luma_dev_owner@127.0.0.1:5432/luma_test',
      APP_DB_ROLE: 'luma_app',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
      LUMA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      LUMA_DEV_OTP: '1',
      LUMA_DEMO_MODE: '0',
      PAYMENTS_SANDBOX_ENABLED: '1',
      DB_POOL_MAX: '20',
    },
  },
});
