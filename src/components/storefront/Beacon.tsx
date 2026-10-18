'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Storefront analytics beacon: one page_view per route change (plus
 * service_view / product_view on detail pages). Refreshes of the same path in
 * the same tab are not re-counted. Previews/builder/members are flagged as
 * internal on the server; conversions are recorded server-side only.
 */
export function Beacon({ slug }: { slug: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    let seenKey = '';
    try {
      seenKey = `luma_pv:${pathname}`;
      if (sessionStorage.getItem(seenKey)) {
        last.current = pathname;
        return;
      }
    } catch {}
    last.current = pathname;
    const m = /\/s\/[^/]+\/(services|products)\/([0-9a-f-]{36})$/.exec(pathname);
    const utm = { source: search.get('utm_source') ?? undefined, medium: search.get('utm_medium') ?? undefined, campaign: search.get('utm_campaign') ?? undefined };
    const send = (type: string, extra: Record<string, unknown> = {}) =>
      fetch('/api/v1/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-luma-request': '1' },
        credentials: 'same-origin',
        keepalive: true,
        body: JSON.stringify({ eventId: crypto.randomUUID(), type, slug, path: pathname, referrer: document.referrer || undefined, utm, ...extra }),
      }).catch(() => {});
    send('page_view');
    if (m) send(m[1] === 'services' ? 'service_view' : 'product_view', { entityType: m[1] === 'services' ? 'service' : 'product', entityId: m[2] });
    if (/\/booking$/.test(pathname)) send('booking_start');
    if (/\/checkout$/.test(pathname)) send('checkout_start');
    try {
      sessionStorage.setItem(seenKey, '1');
    } catch {}
  }, [pathname, search, slug]);
  return null;
}
