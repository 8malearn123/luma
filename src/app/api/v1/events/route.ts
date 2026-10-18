import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { api } from '@/server/http/handler';
import { withTenant } from '@/server/db';
import { tenantBySlug } from '@/server/tenancy/context';
import { CLIENT_EVENT_TYPES, deviceOf, eventInput, isBot, recordEvent, referrerHost } from '@/server/analytics/events';
import { rateLimit } from '@/server/rate-limit';
import { secureCookies } from '@/server/env';

const SID = 'luma_sid';
const VID = 'luma_vid';
const SESSION_IDLE_SEC = 30 * 60;

/**
 * Storefront analytics beacon. Public, rate-limited, deduplicated by eventId.
 * Session/visitor ids are random first-party cookies (stored server-side only as
 * HMACs). Owner previews, builder canvas and signed-in members of the business
 * are recorded as internal and excluded from metrics. Conversion events are
 * server-side only and rejected here.
 */
export const POST = api.public(async (c) => {
  await rateLimit(`events:${c.ip ?? 'anon'}`, 300, 60);
  const body = await c.json(eventInput);
  if (!CLIENT_EVENT_TYPES.includes(body.type)) return NextResponse.json({ ok: false, reason: 'server_only_type' }, { status: 422 });
  const tenant = await tenantBySlug(body.slug);
  if (!tenant) return NextResponse.json({ ok: true }); // indistinguishable; nothing stored
  const jar = await cookies();
  const sid = jar.get(SID)?.value && /^[a-f0-9-]{36}$/.test(jar.get(SID)!.value) ? jar.get(SID)!.value : randomUUID();
  const vid = jar.get(VID)?.value && /^[a-f0-9-]{36}$/.test(jar.get(VID)!.value) ? jar.get(VID)!.value : randomUUID();
  let member = false;
  if (c.user) {
    const rows = await withTenant({ tenantId: tenant.id, userId: c.user.userId }, (tx) => tx`select 1 from tenant_memberships where user_id = ${c.user!.userId} and status = 'active'`);
    member = rows.length > 0;
  }
  const internal = !!body.preview || member || (body.path ?? '').startsWith('/preview') || c.req.headers.get('x-luma-builder') === '1';
  const stored = await withTenant({ tenantId: tenant.id }, (tx) =>
    recordEvent(tx, {
      tenantId: tenant.id,
      eventId: body.eventId,
      type: body.type,
      sessionRaw: sid,
      visitorRaw: vid,
      entityType: body.entityType ?? null,
      entityId: body.entityId ?? null,
      path: body.path ?? null,
      referrerHost: referrerHost(body.referrer, c.req.nextUrl.host),
      utm: body.utm,
      device: deviceOf(c.ua),
      isBot: isBot(c.ua),
      isInternal: internal,
    }),
  );
  const res = NextResponse.json({ ok: true, stored });
  const opts = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: secureCookies() };
  res.cookies.set(SID, sid, { ...opts, maxAge: SESSION_IDLE_SEC });
  res.cookies.set(VID, vid, { ...opts, maxAge: 60 * 60 * 24 * 365 });
  return res;
});
