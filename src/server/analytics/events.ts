import { z } from 'zod';
import type { Tx } from '../db';
import { hmacHex } from '../crypto';

/**
 * Storefront analytics events.
 *  - session: a pseudonymous first-party cookie (random id, 30-min idle
 *    window enforced client-side); only an HMAC of it is stored.
 *  - visitor: a long-lived first-party cookie, also stored only as an HMAC.
 *  - event_id: client-generated UUID; duplicates (retries, iframe refreshes
 *    re-sending the same id) are ignored by UNIQUE (tenant_id, event_id).
 *  - is_internal: builder canvas, owner previews and signed-in members of the
 *    tenant are excluded from every metric; is_bot for known crawler UAs.
 */
export const EVENT_TYPES = ['page_view', 'service_view', 'product_view', 'booking_start', 'checkout_start', 'booking_confirmed', 'order_paid', 'search', 'availability_miss'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Types a browser may send. Conversions (booking_confirmed, order_paid) are emitted server-side only. */
export const CLIENT_EVENT_TYPES: EventType[] = ['page_view', 'service_view', 'product_view', 'booking_start', 'checkout_start', 'search', 'availability_miss'];

export const eventInput = z.object({
  eventId: z.string().uuid(),
  type: z.enum(EVENT_TYPES),
  slug: z.string().regex(/^[a-z0-9-]{3,48}$/),
  entityType: z.enum(['service', 'product', 'staff', 'page']).optional(),
  entityId: z.string().uuid().optional(),
  path: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  utm: z.object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(80).optional() }).optional(),
  preview: z.boolean().optional(),
});

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|httpclient|go-http/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

export function deviceOf(ua: string | null | undefined): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!ua) return 'unknown';
  if (/ipad|tablet|kindle|silk/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  if (/windows|macintosh|x11|linux|cros/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function referrerHost(ref: string | undefined, selfHost: string): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.host === selfHost) return null; // internal navigation is not a traffic source
    return u.hostname.replace(/^www\./, '').slice(0, 120);
  } catch {
    return null;
  }
}

export const pseudonym = (kind: 'session' | 'visitor', raw: string) => hmacHex(`analytics|${kind}|${raw}`).slice(0, 32);

export interface RecordEventInput {
  tenantId: string;
  eventId: string;
  type: EventType;
  sessionRaw: string;
  visitorRaw?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  path?: string | null;
  referrerHost?: string | null;
  utm?: { source?: string; medium?: string; campaign?: string };
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  isBot: boolean;
  isInternal: boolean;
  at?: Date;
}

/** Returns true when stored, false when it was a duplicate. */
export async function recordEvent(tx: Tx, e: RecordEventInput): Promise<boolean> {
  const r = await tx`
    insert into analytics_events (tenant_id, event_id, type, session_hash, visitor_hash, entity_type, entity_id, path, referrer_host,
                                  utm_source, utm_medium, utm_campaign, device, is_bot, is_internal, at)
    values (${e.tenantId}, ${e.eventId}, ${e.type}, ${pseudonym('session', e.sessionRaw)}, ${e.visitorRaw ? pseudonym('visitor', e.visitorRaw) : null},
            ${e.entityType ?? null}, ${e.entityId ?? null}, ${e.path?.slice(0, 300) ?? null}, ${e.referrerHost ?? null},
            ${e.utm?.source?.slice(0, 80) ?? null}, ${e.utm?.medium?.slice(0, 80) ?? null}, ${e.utm?.campaign?.slice(0, 80) ?? null},
            ${e.device}, ${e.isBot}, ${e.isInternal}, ${e.at ?? new Date()})
    on conflict (tenant_id, event_id) do nothing returning id`;
  return r.length > 0;
}

/** Server-side conversion events (never trusted from the browser). */
export async function recordConversion(tx: Tx, tenantId: string, type: 'booking_confirmed' | 'order_paid', refId: string, sessionRaw: string | null, utm?: RecordEventInput['utm']) {
  await recordEvent(tx, {
    tenantId,
    // deterministic id → a conversion is counted once per booking/order
    eventId: uuidFrom(`${type}:${refId}`),
    type,
    sessionRaw: sessionRaw ?? `server:${refId}`,
    entityType: null,
    entityId: null,
    utm,
    device: 'unknown',
    isBot: false,
    isInternal: false,
  });
}

export function uuidFrom(s: string): string {
  const h = hmacHex(`uuid|${s}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
