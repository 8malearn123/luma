import { NextResponse, type NextRequest } from 'next/server';

/**
 * 1. Forwards the request path (x-luma-path) so server pages can redirect
 *    back to the originating context after sign-in.
 * 2. Gates the legacy static prototype (public/*.html with localStorage data
 *    and role-switching cards). It is reachable only when
 *    LUMA_LEGACY_PROTOTYPE=1 (private demo); otherwise requests are redirected
 *    to the real, server-backed equivalents. Marketing pages stay public.
 */
const LEGACY_APP_PAGES: Record<string, string> = {
  '/login.html': '/auth/login',
  '/salon.html': '/app',
  '/expert.html': '/app',
  '/admin.html': '/platform',
  '/client.html': '/account',
  '/profile.html': '/account',
  '/staff-portal.html': '/staff',
  '/booking.html': '/discover',
  '/store.html': '/discover',
  '/market.html': '/discover',
  '/salons.html': '/discover',
  '/review.html': '/account',
  '/experience.html': '/discover',
};

export function middleware(req: NextRequest) {
  const path = decodeURIComponent(req.nextUrl.pathname);
  const legacyEnabled = process.env.LUMA_LEGACY_PROTOTYPE === '1' && (process.env.LUMA_DEPLOYMENT ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')) !== 'production';
  if (!legacyEnabled) {
    const legacyDashboard = path.startsWith('/LUMA - ') && /داشبورد|الأدمن/.test(path);
    const target = LEGACY_APP_PAGES[path] ?? (legacyDashboard ? '/app' : null);
    if (target) return NextResponse.redirect(new URL(target, req.url));
  }
  const h = new Headers(req.headers);
  h.set('x-luma-path', req.nextUrl.pathname + req.nextUrl.search);
  if (!h.get('x-request-id')) h.set('x-request-id', crypto.randomUUID());
  return NextResponse.next({ request: { headers: h } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg|icon-192.png|icon-512.png|brand/).*)'],
};
