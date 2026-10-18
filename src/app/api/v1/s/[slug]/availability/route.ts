import { NextResponse } from 'next/server';
import { api } from '@/server/http/handler';
import { availabilityQuery, findAvailability } from '@/server/booking/availability';
import { newSid, publicTenant, recordAvailabilityMiss, runPublic, SESSION_COOKIE } from '@/server/booking/customer';
import { secureCookies } from '@/server/env';

/**
 * Feasible itineraries only. Results are advisory: holds re-verify inside a
 * transaction. Never reveals who occupies a time.
 */
export const POST = api.public<{ slug: string }>(
  async (c) => {
    const t = await publicTenant(c.params.slug);
    const q = await c.json(availabilityQuery);
    const sid = c.req.cookies.get(SESSION_COOKIE)?.value ?? null;
    const r = await runPublic(t, c.user?.userId ?? null, async (tx) => {
      const res = await findAvailability(tx, t.id, q, 'public');
      if (res.reason) await recordAvailabilityMiss(tx, t.id, sid, q.items.map((i) => i.serviceId));
      return res;
    });
    const res = NextResponse.json({ timezone: r.timezone, days: r.days, reason: r.reason ?? null });
    if (!sid) res.cookies.set(SESSION_COOKIE, newSid(), { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/', maxAge: 60 * 60 * 24 * 30 });
    return res;
  },
  { rateLimit: [120, 60] },
);
