import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { verifyContact } from '@/server/auth/service';
import { withSessionCookie } from '@/server/http/cookies';

export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ identifier: z.string().min(5).max(254), code: z.string().trim().max(10) }));
  const s = await verifyContact(body.identifier, body.code, c.ip, c.ua);
  return withSessionCookie(NextResponse.json({ ok: true }), s.token, s.expiresAt);
});
