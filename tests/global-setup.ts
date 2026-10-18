import { resetTestDb } from '../scripts/reset-test-db';

export default async function setup() {
  await resetTestDb(process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://luma_owner:luma_dev_owner@127.0.0.1:5432/luma_test', process.env.APP_DB_ROLE ?? 'luma_app');
}
