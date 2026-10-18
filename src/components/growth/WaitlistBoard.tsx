'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, tzLabel } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';

interface Entry {
  id: string;
  status: string;
  desiredFrom: string;
  desiredTo: string;
  timeWindows: { start: string; end: string }[];
  offersCount: number;
  notifyConsent: boolean;
  createdAt: string;
  serviceName: string;
  staffName: string | null;
  customerName: string;
  liveOffer: { id: string; slotStart: string; expiresAt: string; staffName: string } | null;
}

const BADGE: Record<string, string> = { active: 'blue', offered: 'gold', fulfilled: 'green', expired: '', cancelled: '' };

export function WaitlistBoard({ tenant, timezone, status, entries }: { tenant: string; timezone: string; status: string; entries: Entry[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const scan = useSubmit<unknown, { offersIssued: number }>(`/api/v1/t/${tenant}/waitlist/scan`);
  const filters = ['', 'active', 'offered', 'fulfilled', 'expired', 'cancelled'];
  return (
    <section className="card">
      <div className="toolbar">
        <nav className="chips" aria-label={t('common.filter')}>
          {filters.map((f) => (
            <Link key={f} href={f ? `?status=${f}` : '?'} className="chip" aria-pressed={status === f} style={{ textDecoration: 'none' }}>
              {f ? t(`growth.wl.status.${f}`) : t('common.all')}
            </Link>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={scan.busy}
          onClick={async () => {
            const r = await scan.submit({});
            if (r) {
              toast(t('growth.wl.scan_done', { n: r.offersIssued }), 'ok');
              router.refresh();
            }
          }}
        >
          <Icon name="sparkle" size={16} /> {t('growth.wl.scan')}
        </button>
      </div>
      <ErrorAlert error={scan.error} />
      {entries.length === 0 ? (
        <EmptyState icon="clock" title={t('growth.wl.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('growth.customer')}</th>
                <th>{t('growth.loyalty.service')}</th>
                <th>{t('growth.wl.desired')}</th>
                <th>{t('growth.wl.offers')}</th>
                <th>{t('common.status')}</th>
                <th>{t('growth.wl.live_offer')} <span className="small muted">({tzLabel(timezone, locale)})</span></th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id}>
                  <td className="mono small">{i + 1}</td>
                  <td>{e.customerName} {e.notifyConsent && <span className="badge" title={t('growth.wl.consent')}><Icon name="bell" size={12} /></span>}</td>
                  <td>{e.serviceName}<div className="small muted">{e.staffName ?? t('growth.wl.any_staff')}</div></td>
                  <td className="small mono">{e.desiredFrom} → {e.desiredTo}{e.timeWindows.length > 0 && <div>{e.timeWindows.map((w) => `${w.start}–${w.end}`).join(', ')}</div>}</td>
                  <td className="mono">{e.offersCount}</td>
                  <td><span className={`badge ${BADGE[e.status] ?? ''}`}>{t(`growth.wl.status.${e.status}`)}</span></td>
                  <td className="small">
                    {e.liveOffer ? (
                      <>
                        {formatDateTime(e.liveOffer.slotStart, { tz: timezone, locale })} · {e.liveOffer.staffName}
                        <div className="muted">{t('growth.wl.expires')}: {formatDateTime(e.liveOffer.expiresAt, { tz: timezone, locale, timeOnly: true })}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    {(e.status === 'active' || e.status === 'offered') && (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { if (!confirm(t('common.confirm'))) return; await apiFetch(`/api/v1/t/${tenant}/waitlist/${e.id}`, { method: 'DELETE' }); router.refresh(); }}>
                        {t('common.cancel')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
