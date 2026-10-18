'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, formatMoney, parseMoneyToMinor } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { CustomerPicker } from './CustomerPicker';

interface Plan {
  id: string;
  name: string;
  priceMinor: number;
  validityDays: number;
  entitlements: { serviceId: string; sessions: number }[];
}
interface Membership {
  id: string;
  status: string;
  endsAt: string;
  planName: string;
  customerName: string;
  entitlements: { serviceName: string; total: number; reserved: number; consumed: number }[];
}

export function MembershipsManager({ tenant, plans, memberships, services }: { tenant: string; plans: Plan[]; memberships: Membership[]; services: { id: string; name: string }[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; name: string; price: string; validityDays: number; entitlements: { serviceId: string; sessions: number }[] } | null>(null);
  const [selling, setSelling] = useState<Plan | null>(null);
  const [customer, setCustomer] = useState<{ id: string; displayName: string; phone: string | null } | null>(null);
  const [sale, setSale] = useState({ method: 'cash' as 'cash' | 'card_terminal', reference: '' });
  const save = useSubmit<unknown, { id: string }>(() => (editing?.id ? `/api/v1/t/${tenant}/memberships/plans/${editing.id}` : `/api/v1/t/${tenant}/memberships/plans`), editing?.id ? 'PATCH' : 'POST');
  const sell = useSubmit<unknown, { membershipId: string }>(`/api/v1/t/${tenant}/memberships/sell`);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name ?? '—';

  return (
    <div className="grid cols-2">
      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>{t('growth.mem.plans')}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ name: '', price: '', validityDays: 90, entitlements: [{ serviceId: services[0]?.id ?? '', sessions: 4 }] })}>
            <Icon name="plus" size={14} /> {t('growth.mem.add_plan')}
          </button>
        </div>
        {plans.length === 0 ? (
          <EmptyState icon="ticket" title={t('growth.mem.empty_plans')} />
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {plans.map((p) => (
              <li key={p.id} className="card" style={{ padding: 12 }}>
                <div className="row between">
                  <strong>{p.name}</strong>
                  <span>{formatMoney(p.priceMinor, 'SAR', locale)}</span>
                </div>
                <div className="small muted">
                  {p.entitlements.map((e) => `${svcName(e.serviceId)} × ${e.sessions}`).join(' · ')} — {p.validityDays} {t('growth.mem.validity')}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-gold btn-sm" onClick={() => setSelling(p)}>{t('growth.mem.sell')}</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing({ id: p.id, name: p.name, price: String(p.priceMinor / 100), validityDays: p.validityDays, entitlements: p.entitlements })}>{t('common.edit')}</button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { if (!confirm(t('growth.archive_confirm'))) return; await apiFetch(`/api/v1/t/${tenant}/memberships/plans/${p.id}`, { method: 'DELETE' }); router.refresh(); }}>
                    {t('common.archive')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>{t('growth.mem.active')}</h2>
        {memberships.length === 0 ? (
          <EmptyState icon="users" title={t('growth.mem.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>{t('growth.customer')}</th><th>{t('growth.mem.plans')}</th><th>{t('growth.mem.usage')}</th><th>{t('growth.mem.ends')}</th><th>{t('common.status')}</th></tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <td>{m.customerName}</td>
                    <td>{m.planName}</td>
                    <td className="small">{m.entitlements.map((e) => `${e.serviceName}: ${e.consumed}/${e.reserved}/${e.total}`).join(' · ')}</td>
                    <td className="small">{formatDateTime(m.endsAt, { locale, dateOnly: true })}</td>
                    <td>
                      <span className={`badge ${m.status === 'active' ? 'green' : ''}`}>{m.status}</span>
                      {m.status === 'active' && (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { const reason = prompt(t('growth.reason')); if (!reason) return; await apiFetch(`/api/v1/t/${tenant}/memberships/${m.id}/cancel`, { method: 'POST', body: { reason } }); router.refresh(); }}>
                          {t('growth.mem.cancel')}
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

      {editing && (
        <Drawer title={editing.id ? t('common.edit') : t('growth.mem.add_plan')} onClose={() => setEditing(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await save.submit({ name: editing.name, priceMinor: parseMoneyToMinor(editing.price) ?? 0, validityDays: editing.validityDays, entitlements: editing.entitlements });
              if (r) {
                setEditing(null);
                router.refresh();
              }
            }}
          >
            <ErrorAlert error={save.error} />
            <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}</Field>
            <Field label={t('common.price')} hint={t('growth.sar_hint')} required>{(p) => <input {...p} className="input" inputMode="decimal" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />}</Field>
            <Field label={t('growth.mem.validity')} required>{(p) => <input {...p} className="input" type="number" min={7} max={730} value={editing.validityDays} onChange={(e) => setEditing({ ...editing, validityDays: Number(e.target.value) })} />}</Field>
            <fieldset>
              <legend>{t('growth.mem.entitlements')}</legend>
              {editing.entitlements.map((en, i) => (
                <div key={i} className="row" style={{ marginBottom: 6 }}>
                  <select className="input" aria-label={t('growth.loyalty.service')} style={{ flex: 2 }} value={en.serviceId} onChange={(e) => setEditing({ ...editing, entitlements: editing.entitlements.map((x, j) => (j === i ? { ...x, serviceId: e.target.value } : x)) })}>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input className="input" aria-label={t('growth.mem.sessions')} style={{ flex: 1 }} type="number" min={1} max={100} value={en.sessions} onChange={(e) => setEditing({ ...editing, entitlements: editing.entitlements.map((x, j) => (j === i ? { ...x, sessions: Number(e.target.value) } : x)) })} />
                  <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => setEditing({ ...editing, entitlements: editing.entitlements.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing({ ...editing, entitlements: [...editing.entitlements, { serviceId: services[0]?.id ?? '', sessions: 1 }] })}>
                <Icon name="plus" size={14} /> {t('growth.mem.add_service')}
              </button>
            </fieldset>
            <div className="form-actions"><button className="btn btn-gold" disabled={save.busy || editing.entitlements.length === 0}>{t('common.save')}</button></div>
          </form>
        </Drawer>
      )}

      {selling && (
        <Drawer title={`${t('growth.mem.sell')} — ${selling.name}`} onClose={() => setSelling(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!customer) return;
              const r = await sell.submit({ planId: selling.id, tenantCustomerId: customer.id, sale: selling.priceMinor > 0 ? sale : null });
              if (r) {
                setSelling(null);
                setCustomer(null);
                router.refresh();
              }
            }}
          >
            <ErrorAlert error={sell.error} />
            <CustomerPicker tenant={tenant} value={customer} onChange={setCustomer} />
            {selling.priceMinor > 0 && (
              <fieldset>
                <legend>{t('growth.sold_on_site')} · {formatMoney(selling.priceMinor, 'SAR', locale)}</legend>
                <div className="grid cols-2" style={{ gap: 10 }}>
                  <select className="input" aria-label={t('common.select')} value={sale.method} onChange={(e) => setSale({ ...sale, method: e.target.value as 'cash' | 'card_terminal' })}>
                    <option value="cash">{t('growth.method_cash')}</option>
                    <option value="card_terminal">{t('growth.method_terminal')}</option>
                  </select>
                  <input className="input" aria-label={t('growth.reference')} placeholder={t('growth.reference')} required value={sale.reference} onChange={(e) => setSale({ ...sale, reference: e.target.value })} />
                </div>
              </fieldset>
            )}
            <div className="form-actions"><button className="btn btn-gold" disabled={sell.busy || !customer}>{t('growth.mem.sell')}</button></div>
          </form>
        </Drawer>
      )}
    </div>
  );
}
