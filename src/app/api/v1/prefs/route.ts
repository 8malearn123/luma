import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { sql } from '@/server/db';
import { LOCALE_COOKIE } from '@/lib/i18n';

/** Display preferences: locale + theme. Stored in cookies (and on the account when signed in). */
export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ locale: z.enum(['ar', 'en']).optional(), theme: z.enum(['dark', 'light']).optional() }));
  const res = NextResponse.json({ ok: true });
  const opts = { path: '/', sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 365 };
  if (body.locale) {
    res.cookies.set(LOCALE_COOKIE, body.locale, opts);
    if (c.user) await sql()`update users set locale = ${body.locale} where id = ${c.user.userId}`;
  }
  if (body.theme) res.cookies.set('luma_theme', body.theme, opts);
  return res;
});
