import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../auth/service';
import { isProduction } from '../env';

export function withSessionCookie(res: NextResponse, token: string, expiresAt: Date): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: isProduction(), sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
