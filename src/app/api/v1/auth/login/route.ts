import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { login } from '@/server/auth/service';
import { withSessionCookie } from '@/server/http/cookies';

export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ identifier: z.string().min(5).max(254), password: z.string().min(1).max(200) }));
  const r = await login(body.identifier, body.password, c.ip, c.ua);
  if (r.status === 'verification_required') {
    return { verificationRequired: true, destination: r.destination, devOutbox: r.deliveryMode === 'dev_outbox' };
  }
  return withSessionCookie(NextResponse.json({ ok: true }), r.token, r.expiresAt);
});
