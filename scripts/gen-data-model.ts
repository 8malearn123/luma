/**
 * Generates docs/DATA_MODEL_REFERENCE.md from the live schema (tables, columns,
 * constraints, RLS status). Run after migrating:  npm run docs:data-model
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

const db = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 1 });
const tables = await db<{ table: string; rls: boolean; force: boolean; comment: string | null }[]>`
  select c.relname as table, c.relrowsecurity as rls, c.relforcerowsecurity as force, obj_description(c.oid) as comment
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations' order by c.relname`;
let out = '# Data model reference (generated)\n\nGenerated from the migrated schema by `scripts/gen-data-model.ts`. Do not edit by hand.\n\n';
out += `Tables: ${tables.length}. RLS-enabled: ${tables.filter((t) => t.rls).length}.\n\n`;
for (const t of tables) {
  const cols = await db<{ name: string; type: string; nullable: string; def: string | null }[]>`
    select column_name as name, data_type as type, is_nullable as nullable, column_default as def
    from information_schema.columns where table_schema = 'public' and table_name = ${t.table} order by ordinal_position`;
  const cons = await db<{ name: string; def: string }[]>`
    select conname as name, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = ${'public.' + t.table}::regclass and contype in ('u','x','f','c','p') order by contype, conname`;
  const idx = await db<{ def: string }[]>`select indexdef as def from pg_indexes where schemaname = 'public' and tablename = ${t.table} and indexdef ilike '%unique%' and indexname not in (select conname from pg_constraint)`;
  out += `## ${t.table}${t.rls ? ' · RLS' + (t.force ? ' (forced)' : '') : ''}\n\n| column | type | null | default |\n|---|---|---|---|\n`;
  for (const c of cols) out += `| ${c.name} | ${c.type} | ${c.nullable === 'YES' ? 'yes' : ''} | ${(c.def ?? '').replace(/\|/g, '\\|').slice(0, 60)} |\n`;
  if (cons.length || idx.length) {
    out += '\nConstraints:\n';
    for (const c of cons) out += `- \`${c.name}\`: ${c.def.replace(/\s+/g, ' ').slice(0, 220)}\n`;
    for (const i of idx) out += `- ${i.def.replace(/^CREATE /, '').slice(0, 220)}\n`;
  }
  out += '\n';
}
writeFileSync('docs/DATA_MODEL_REFERENCE.md', out);
await db.end();
console.log(`wrote docs/DATA_MODEL_REFERENCE.md (${tables.length} tables)`);
