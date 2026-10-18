/** Drops and rebuilds the TEST database schema from migrations. Refuses non-test databases. */
import postgres from 'postgres';
import { migrate } from './migrate';

export async function resetTestDb(url: string, appRole: string) {
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/.test(dbName)) throw new Error(`refusing to reset non-test database "${dbName}"`);
  const db = postgres(url, { max: 1, onnotice: () => {} });
  await db.unsafe('drop schema if exists public cascade; drop schema if exists app cascade; create schema public;');
  await db.end();
  await migrate(url, appRole, () => {});
}

const isMain = process.argv[1]?.endsWith('reset-test-db.ts');
if (isMain) {
  resetTestDb(process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://luma_owner:luma_dev_owner@127.0.0.1:5432/luma_test', 'luma_app')
    .then(() => console.log('test database rebuilt'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
