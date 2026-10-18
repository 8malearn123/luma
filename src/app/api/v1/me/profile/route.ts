import { z } from 'zod';
import { api } from '@/server/http/handler';
import { sql } from '@/server/db';

export const GET = api.user(async (c) => {
  const [p] = await sql()`select u.display_name, u.email, u.phone, u.locale, cp.full_name, cp.preferred_locale
                          from users u left join customer_profiles cp on cp.user_id = u.id where u.id = ${c.user.userId}`;
  return { profile: p };
});

export const PATCH = api.user(async (c) => {
  const b = await c.json(z.object({ fullName: z.string().trim().min(2).max(120), preferredLocale: z.enum(['ar', 'en']) }));
  await sql()`insert into customer_profiles (user_id, full_name, preferred_locale) values (${c.user.userId}, ${b.fullName}, ${b.preferredLocale})
              on conflict (user_id) do update set full_name = excluded.full_name, preferred_locale = excluded.preferred_locale, updated_at = now()`;
  await sql()`update users set display_name = ${b.fullName}, locale = ${b.preferredLocale} where id = ${c.user.userId}`;
  return { ok: true };
});
