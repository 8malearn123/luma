/** Rebuilds the e2e database (migrate + seed) before the Playwright suite. */
import { execFileSync } from 'node:child_process';
import { E2E_ENV } from './playwright.config';

const env = { ...process.env, ...E2E_ENV, NODE_ENV: 'development' };
execFileSync('node', ['--import', 'tsx', 'scripts/reset-dev-db.ts', '--yes'], { env, stdio: 'inherit' });
execFileSync('node', ['--import', 'tsx', 'scripts/seed.ts'], { env, stdio: 'inherit' });
