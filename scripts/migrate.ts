/**
 * Migration runner (forward-only, transactional, checksummed).
 *   npm run db:migrate
 * Uses MIGRATION_DATABASE_URL (schema owner). After migrating it syncs the
 * capability catalog into permissions/role_permissions and grants the app
 * role (APP_DB_ROLE) least-privilege access: append-only ledgers get no
 * UPDATE/DELETE. Never drops or resets data.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';
import { PERMISSIONS, ROLE_DEFAULTS, ROLES } from '../src/server/tenancy/capabilities';

export const APPEND_ONLY_TABLES = [
  'audit_logs',
  'stock_movements',
  'financial_entries',
  'points_entries',
  'gift_card_entries',
  'booking_events',
  'subscription_events',
  'attendance_events',
  'commission_entries',
  'incident_reviews',
  'page_versions',
  'plan_versions',
  'campaign_events',
  'fulfillment_events',
];

export async function migrate(url: string, appRole: string, log = console.log) {
  const db = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await db`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    const dir = path.resolve(process.cwd(), 'db/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Map((await db`select name, checksum from schema_migrations`).map((r) => [r.name, r.checksum]));
    for (const f of files) {
      const body = readFileSync(path.join(dir, f), 'utf8');
      const sum = createHash('sha256').update(body).digest('hex');
      if (applied.has(f)) {
        if (applied.get(f) !== sum) throw new Error(`Migration ${f} was modified after being applied. Add a new migration instead.`);
        continue;
      }
      log(`applying ${f}`);
      await db.begin(async (tx) => {
        // migrations are trusted: data-seeding statements run in the system RLS scope
        await tx`select set_config('app.system', 'on', true)`;
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name, checksum) values (${f}, ${sum})`;
      });
    }

    // capability catalog (source of truth: src/server/tenancy/capabilities.ts)
    await db.begin(async (tx) => {
      for (const r of ROLES) {
        await tx`insert into roles (key, name_ar, name_en) values (${r.key}, ${r.nameAr}, ${r.nameEn})
          on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en`;
      }
      for (const p of PERMISSIONS) {
        await tx`insert into permissions (key, category, description, delegable_to)
          values (${p.key}, ${p.category}, ${p.description}, ${p.delegableTo as string[]})
          on conflict (key) do update set category = excluded.category, description = excluded.description,
            delegable_to = excluded.delegable_to`;
      }
      await tx`delete from role_permissions`;
      for (const [role, caps] of Object.entries(ROLE_DEFAULTS)) {
        for (const c of caps) await tx`insert into role_permissions (role_key, permission_key) values (${role}, ${c})`;
      }
    });

    // least-privilege grants for the application role
    const r = db(appRole);
    await db`grant usage on schema public, app to ${r}`;
    await db`grant select, insert, update, delete on all tables in schema public to ${r}`;
    await db`grant usage, select on all sequences in schema public to ${r}`;
    await db`grant execute on all functions in schema app to ${r}`;
    for (const t of APPEND_ONLY_TABLES) await db`revoke update, delete on ${db(t)} from ${r}`;
    await db`revoke insert, update, delete on schema_migrations, permissions, roles, role_permissions, unit_conversions from ${r}`;
    log('migrations complete');
  } finally {
    await db.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  const url = process.env.MIGRATION_DATABASE_URL;
  const role = process.env.APP_DB_ROLE ?? 'luma_app';
  if (!url) {
    console.error('MIGRATION_DATABASE_URL is required');
    process.exit(1);
  }
  migrate(url, role).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
