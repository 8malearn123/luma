import { NextResponse } from 'next/server';
import { api } from '@/server/http/handler';
import { revokeSession } from '@/server/auth/service';
import { clearSessionCookie } from '@/server/http/cookies';

export const POST = api.public(async (c) => {
  if (c.user) await revokeSession(c.user.sessionId, 'logout');
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
