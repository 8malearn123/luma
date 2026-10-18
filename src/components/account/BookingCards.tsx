'use client';

import Link from 'next/link';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState } from '../ui/forms';

export interface MyBooking {
  id: string;
  number: string;
  status: string;
  financialStatus: string;
  startsAt: string | Date;
  totalMinor: number;
  currency: string;
  tenantName: string;
  tenantSlug: string;
  timezone: string;
  services: string[];
}

const tone = (s: string) => (s === 'confirmed' || s === 'completed' ? 'green' : s === 'cancelled' || s === 'expired' || s === 'no_show' ? 'red' : 'amber');

export function BookingCards({ items, grouped = false }: { items: MyBooking[]; grouped?: boolean }) {
  const t = useT();
  const locale = useLocale();
  if (!items.length)
    return (
      <EmptyState icon="calendar" title={t('account.no_bookings')}>
        <Link href="/discover">{t('account.discover')}</Link>
      </EmptyState>
    );
  const groups = grouped ? [...new Set(items.map((i) => i.tenantSlug))].map((slug) => ({ slug, name: items.find((i) => i.tenantSlug === slug)!.tenantName, list: items.filter((i) => i.tenantSlug === slug) })) : [{ slug: '', name: '', list: items }];
  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g.slug || 'all'} className="stack">
          {grouped && (
            <h3 style={{ margin: '8px 0 0' }}>
              <Link href={`/s/${g.slug}`}>{g.name}</Link>
            </h3>
          )}
          {g.list.map((b) => (
            <Link key={b.id} href={`/account/bookings/${b.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div className="row between">
                <strong>{grouped ? b.services.join('، ') || b.number : b.tenantName}</strong>
                <span className={`badge ${tone(b.status)}`}>{t(`booking.status.${b.status}`)}</span>
              </div>
              {!grouped && <div className="small muted">{b.services.join('، ')}</div>}
              <div className="row between small">
                <span>{formatDateTime(b.startsAt, { tz: b.timezone, locale })}</span>
                <span>
                  {formatMoney(b.totalMinor, b.currency, locale)} · {t(`booking.fin.${b.financialStatus}`)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
