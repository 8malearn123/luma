'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, PageHead, statusBadge, useApi } from './hooks';

interface Detail {
  customer: { id: string; displayName: string; phone: string | null; email: string | null; tags: string[]; source: string | null; firstSeenAt: string; privateNotes?: string | null; hasAccount: boolean };
  bookings: { id: string; number: string; status: string; financialStatus: string; startsAt: string; totalMinor: number; services: string | null }[];
  orders: { id: string; number: string; status: string; totalMinor: number; createdAt: string }[];
  consents: { channel: string; purpose: string; status: string; recordedAt: string; source: string }[];
  loyaltyBalance: number | null;
}

export function CustomerDetail({ tenant, id, tz, canNotes }: { tenant: string; id: string; tz: string; canNotes: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<Detail>(`/api/v1/t/${tenant}/customers/${id}`);
  const [notes, setNotes] = useState<string | null>(null);
  const [tags, setTags] = useState<string | null>(null);
  const save = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/customers/${id}`, 'PATCH');
  useUnsavedGuard(notes !== null || tags !== null);
  const c = d.data?.customer;
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {c && d.data && (
        <>
          <PageHead title={c.displayName} crumbs={t('nav.customers')} />
          <p className="small muted">{t('cu.scope_note')}</p>
          <div className="grid cols-2">
            <section className="card">
              <div className="stack">
                <div><span className="label">{t('onb.phone')}: </span><span className="mono">{c.phone ?? '—'}</span></div>
                <div><span className="label">{t('onb.email')}: </span>{c.email ?? '—'}</div>
                <div><span className="label">{t('cu.loyalty')}: </span>{d.data.loyaltyBalance ?? '—'}</div>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const body: Record<string, unknown> = {};
                  if (tags !== null) body.tags = tags.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
                  if (notes !== null) body.privateNotes = notes;
                  if (await save.submit(body)) { setNotes(null); setTags(null); toast(t('common.saved'), 'ok'); void d.reload(); }
                }}>
                  <Field label={t('cu.tags')} hint="، / ,">{(p) => <input {...p} className="input" value={tags ?? c.tags.join('، ')} onChange={(e) => setTags(e.target.value)} />}</Field>
                  {canNotes && <Field label={t('cu.private_notes')}>{(p) => <textarea {...p} className="input" value={notes ?? c.privateNotes ?? ''} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />}</Field>}
                  <ErrorAlert error={save.error} />
                  {(notes !== null || tags !== null) && <button type="submit" className="btn btn-gold btn-sm" disabled={save.busy}>{save.busy ? t('common.saving') : t('common.save')}</button>}
                </form>
              </div>
            </section>
            <section className="card">
              <h2>{t('cu.consents')}</h2>
              {d.data.consents.length === 0 ? <div className="muted small">{t('cu.no_consents')}</div> : (
                <ul className="small">{d.data.consents.map((x) => <li key={x.channel + x.purpose}>{x.channel} · {x.purpose}: <span className={`badge ${x.status === 'granted' ? 'green' : 'red'}`}>{x.status}</span> <span className="muted">({formatDateTime(x.recordedAt, { tz, locale, dateOnly: true })})</span></li>)}</ul>
              )}
            </section>
          </div>
          <section className="card">
            <h2>{t('cu.bookings')}</h2>
            {d.data.bookings.length === 0 ? <div className="muted">{t('common.empty')}</div> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>{t('bk.when')}</th><th>{t('bk.number')}</th><th>{t('bk.services')}</th><th>{t('common.status')}</th><th>{t('bk.total')}</th></tr></thead>
                <tbody>{d.data.bookings.map((b) => (
                  <tr key={b.id}><td className="small">{formatDateTime(b.startsAt, { tz, locale })}</td><td><Link href={`/app/${tenant}/bookings?booking=${b.id}&date=${b.startsAt.slice(0, 10)}`} className="mono small">{b.number}</Link></td>
                    <td className="small">{b.services}</td><td><span className={`badge ${statusBadge(b.status)}`}>{t(`bk.status.${b.status}`)}</span></td><td>{formatMoney(b.totalMinor, 'SAR', locale)}</td></tr>))}</tbody></table></div>
            )}
          </section>
          {d.data.orders.length > 0 && (
            <section className="card">
              <h2>{t('cu.orders')}</h2>
              <ul>{d.data.orders.map((o) => <li key={o.id}><Link href={`/app/${tenant}/orders/${o.id}`} className="mono">{o.number}</Link> · {t(`ord.status.${o.status}`)} · {formatMoney(o.totalMinor, 'SAR', locale)}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </DataState>
  );
}
