'use client';

import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import { tapi, useLoad } from '../catalog/client';
import type { TeamRefs } from './TeamManager';

interface Rule { id: string; staffId: string | null; staffName: string | null; serviceId: string | null; serviceName: string | null; kind: 'percentage' | 'fixed'; rateBps: number | null; fixedMinor: number | null; effectiveFrom: string; effectiveTo: string | null }

/** Configurable commission rules. Earned entries snapshot the rule; refunds create explicit reversals. */
export function CommissionsPanel({ slug, refs }: { slug: string; refs: TeamRefs }) {
  const t = useT();
  const locale = useLocale();
  const list = useLoad<{ items: Rule[] }>(tapi(slug, '/staff/commissions'));
  const staff = useLoad<{ items: { id: string; displayName: string }[] }>(tapi(slug, '/staff'));
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ staffId: '', serviceId: '', kind: 'percentage' as 'percentage' | 'fixed', value: '', effectiveFrom: today });
  const [err, setErr] = useState<ApiError | null>(null);
  const create = useSubmit(tapi(slug, '/staff/commissions'));
  const end = async (id: string) => {
    try {
      await apiFetch(tapi(slug, `/staff/commissions/${id}`), { method: 'POST', body: { effectiveTo: today } });
      await list.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  return (
    <section className="stack" aria-label={t('team.tab.commissions')}>
      <ErrorAlert error={err ?? list.error} />
      <p className="small muted">{t('team.commission_note')}</p>
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 90 }} /> : !list.data?.items.length ? <EmptyState icon="commission" title={t('team.no_commissions')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('ops.specialist')}</th><th>{t('nav.services')}</th><th>{t('team.commission')}</th><th>{t('common.from')}</th><th>{t('common.to')}</th><th /></tr></thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr key={r.id}>
                  <td>{r.staffName ?? t('team.all_staff')}</td>
                  <td>{r.serviceName ?? t('team.all_services')}</td>
                  <td>{r.kind === 'percentage' ? `${(r.rateBps ?? 0) / 100}%` : formatMoney(r.fixedMinor, 'SAR', locale)}</td>
                  <td className="mono">{r.effectiveFrom}</td>
                  <td className="mono">{r.effectiveTo ?? '—'}</td>
                  <td>{!r.effectiveTo && <button type="button" className="btn btn-sm" onClick={() => end(r.id)}>{t('team.end_rule')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        const minor = parseMoneyToMinor(f.value);
        const body = { staffId: f.staffId || null, serviceId: f.serviceId || null, kind: f.kind, effectiveFrom: f.effectiveFrom, ...(f.kind === 'percentage' ? { rateBps: minor } : { fixedMinor: minor }) };
        if (await create.submit(body)) { setF({ ...f, value: '' }); await list.reload(); }
      }}>
        <h3>{t('team.new_rule')}</h3>
        <div className="row">
          <select className="input" aria-label={t('ops.specialist')} value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
            <option value="">{t('team.all_staff')}</option>
            {(staff.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </select>
          <select className="input" aria-label={t('nav.services')} value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
            <option value="">{t('team.all_services')}</option>
            {refs.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="row">
          <select className="input" aria-label={t('team.commission')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'percentage' })}>
            <option value="percentage">%</option>
            <option value="fixed">{t('common.sar')}</option>
          </select>
          <input className="input input-ltr" style={{ maxWidth: 120 }} aria-label={t('team.value')} placeholder={f.kind === 'percentage' ? '10' : '25'} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <input type="date" className="input" aria-label={t('common.from')} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
        </div>
        <ErrorAlert error={create.error} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!f.value || create.busy}><Icon name="plus" size={14} /> {t('common.add')}</button>
      </form>
    </section>
  );
}
