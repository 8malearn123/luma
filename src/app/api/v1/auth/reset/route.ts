import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { resetPassword } from '@/server/auth/service';
import { clearSessionCookie } from '@/server/http/cookies';

export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ identifier: z.string().min(5).max(254), code: z.string().max(10), password: z.string().max(200) }));
  await resetPassword(body.identifier, body.code, body.password, c.ip);
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
