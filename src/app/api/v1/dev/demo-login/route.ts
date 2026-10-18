import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { createSession } from '@/server/auth/service';
import { demoLoginAllowed, demoHomeFor } from '@/server/demo';
import { notFound } from '@/server/errors';
import { sql } from '@/server/db';
import { withSessionCookie } from '@/server/http/cookies';
import { audit } from '@/server/audit';

/** Private demo only. 404 in production or when demo mode is off; only is_demo users. */
export const POST = api.public(async (c) => {
  if (!demoLoginAllowed()) throw notFound();
  const { userId } = await c.json(z.object({ userId: z.string().uuid() }));
  const [u] = await sql()<{ id: string }[]>`select id from users where id = ${userId} and is_demo and status = 'active'`;
  if (!u) throw notFound();
  const s = await createSession(u.id, c.ip, c.ua);
  await audit(sql(), { actorUserId: u.id, actorKind: 'user', action: 'auth.demo_login', ip: c.ip });
  return withSessionCookie(NextResponse.json({ ok: true, home: await demoHomeFor(u.id) }), s.token, s.expiresAt);
});
