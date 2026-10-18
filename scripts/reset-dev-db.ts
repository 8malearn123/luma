/** DEVELOPMENT ONLY: drop and rebuild the local dev schema, then migrate. Refuses non-dev databases. */
import postgres from 'postgres';
import { migrate } from './migrate';

const url = process.env.MIGRATION_DATABASE_URL!;
const name = new URL(url).pathname.slice(1);
if ((process.env.LUMA_DEPLOYMENT === 'production' || (process.env.NODE_ENV === 'production' && process.env.LUMA_DEPLOYMENT !== 'review')) || !/(_dev|_test|_e2e)/.test(name) || process.argv[2] !== '--yes') {
  console.error(`refusing: database "${name}" (pass --yes; only *_dev/_test/_e2e databases)`);
  process.exit(1);
}
const db = postgres(url, { max: 1, onnotice: () => {} });
await db.unsafe('drop schema if exists public cascade; drop schema if exists app cascade; create schema public;');
await db.end();
await migrate(url, process.env.APP_DB_ROLE ?? 'luma_app');
