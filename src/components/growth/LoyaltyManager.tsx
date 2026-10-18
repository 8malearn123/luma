'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, formatMoney, parseMoneyToMinor } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';

interface Rules {
  enabled: boolean;
  pointsPerSar: number;
  expiryDays: number | null;
  tiers: { name: string; minPoints: number }[];
  reverseOnRefund: boolean;
}
interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  rewardKind: 'discount_fixed' | 'discount_percent' | 'free_service';
  rewardValue: number;
  serviceId: string | null;
  serviceName: string | null;
}
interface Account {
  tenantCustomerId: string;
  displayName: string;
  balance: number;
  lastActivity: string | null;
}
interface Coupon {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  minTotalMinor: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  perCustomerLimit: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
}

export function LoyaltyManager({
  tenant,
  initial,
}: {
  tenant: string;
  initial: { rules: Rules; rewards: Reward[]; accounts: Account[]; coupons: Coupon[]; services: { id: string; name: string }[] };
}) {
  const t = useT();
  const [tab, setTab] = useState<'program' | 'members' | 'coupons'>('program');
  return (
    <>
      <div className="tabs" role="tablist">
        {(['program', 'members', 'coupons'] as const).map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {k === 'program' ? t('growth.loyalty.title') : k === 'members' ? t('growth.loyalty.members') : t('growth.coupons.title')}
          </button>
        ))}
      </div>
      {tab === 'program' && (
        <div className="grid cols-2">
          <RulesForm tenant={tenant} rules={initial.rules} />
          <Rewards tenant={tenant} rewards={initial.rewards} services={initial.services} />
        </div>
      )}
      {tab === 'members' && <Members tenant={tenant} accounts={initial.accounts} rewards={initial.rewards} />}
      {tab === 'coupons' && <Coupons tenant={tenant} coupons={initial.coupons} />}
    </>
  );
}

function RulesForm({ tenant, rules }: { tenant: string; rules: Rules }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [r, setR] = useState(rules);
  const s = useSubmit<Rules, { ok: boolean }>(`/api/v1/t/${tenant}/loyalty/rules`, 'PUT');
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await s.submit(r)) {
          toast(t('growth.saved'), 'ok');
          router.refresh();
        }
      }}
    >
      <h2>{t('growth.loyalty.title')}</h2>
      <p className="small muted">{t('growth.loyalty.scope')}</p>
      <ErrorAlert error={s.error} />
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={r.enabled} onChange={(e) => setR({ ...r, enabled: e.target.checked })} />
        {t('growth.loyalty.enabled')}
      </label>
      <div className="grid cols-2" style={{ gap: 10 }}>
        <Field label={t('growth.loyalty.points_per_sar')} required>
          {(p) => <input {...p} className="input" type="number" min={0} max={100} step={0.1} value={r.pointsPerSar} onChange={(e) => setR({ ...r, pointsPerSar: Number(e.target.value) })} />}
        </Field>
        <Field label={t('growth.loyalty.expiry_days')} hint={t('growth.loyalty.no_expiry')}>
          {(p) => (
            <input {...p} className="input" type="number" min={30} max={1095} value={r.expiryDays ?? ''} onChange={(e) => setR({ ...r, expiryDays: e.target.value ? Number(e.target.value) : null })} />
          )}
        </Field>
      </div>
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={r.reverseOnRefund} onChange={(e) => setR({ ...r, reverseOnRefund: e.target.checked })} />
        {t('growth.loyalty.reverse')}
      </label>
      <fieldset>
        <legend>{t('growth.loyalty.tiers')}</legend>
        {r.tiers.map((tier, i) => (
          <div key={i} className="row" style={{ marginBottom: 6 }}>
            <input className="input" aria-label={t('growth.loyalty.tier_name')} style={{ flex: 2 }} value={tier.name} onChange={(e) => setR({ ...r, tiers: r.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className="input" aria-label={t('growth.loyalty.tier_min')} style={{ flex: 1 }} type="number" min={0} value={tier.minPoints} onChange={(e) => setR({ ...r, tiers: r.tiers.map((x, j) => (j === i ? { ...x, minPoints: Number(e.target.value) } : x)) })} />
            <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => setR({ ...r, tiers: r.tiers.filter((_, j) => j !== i) })}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        {r.tiers.length < 6 && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setR({ ...r, tiers: [...r.tiers, { name: '', minPoints: 0 }] })}>
            <Icon name="plus" size={14} /> {t('growth.loyalty.add_tier')}
          </button>
        )}
      </fieldset>
      <div className="form-actions">
        <button className="btn btn-gold" disabled={s.busy}>{s.busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </form>
  );
}

function rewardLabel(t: (k: string) => string, r: Reward, locale: 'ar' | 'en') {
  if (r.rewardKind === 'discount_fixed') return formatMoney(r.rewardValue, 'SAR', locale);
  if (r.rewardKind === 'discount_percent') return `${r.rewardValue / 100}%`;
  return r.serviceName ?? t('growth.loyalty.kind.free_service');
}

function Rewards({ tenant, rewards, services }: { tenant: string; rewards: Reward[]; services: { id: string; name: string }[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Reward> | null>(null);
  const s = useSubmit<unknown, { id: string }>(() => (edit?.id ? `/api/v1/t/${tenant}/loyalty/rewards/${edit.id}` : `/api/v1/t/${tenant}/loyalty/rewards`), edit?.id ? 'PATCH' : 'POST');
  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('growth.loyalty.rewards')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ rewardKind: 'discount_fixed', pointsCost: 100, rewardValue: 5000, serviceId: null, name: '' })}>
          <Icon name="plus" size={14} /> {t('growth.loyalty.add_reward')}
        </button>
      </div>
      {rewards.length === 0 ? (
        <EmptyState icon="loyalty" title={t('growth.loyalty.no_rewards')} />
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {rewards.map((r) => (
            <li key={r.id} className="row between">
              <span>
                <strong>{r.name}</strong> <span className="muted small">· {rewardLabel(t, r, locale)}</span>
              </span>
              <span className="row">
                <span className="badge gold">{r.pointsCost} pts</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEdit(r)}>{t('common.edit')}</button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={async () => {
                    if (!confirm(t('growth.archive_confirm'))) return;
                    await apiFetch(`/api/v1/t/${tenant}/loyalty/rewards/${r.id}`, { method: 'DELETE' });
                    router.refresh();
                  }}
                >
                  {t('common.archive')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Drawer title={t('growth.loyalty.rewards')} onClose={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await s.submit({ name: edit.name, pointsCost: edit.pointsCost, rewardKind: edit.rewardKind, rewardValue: edit.rewardValue ?? 0, serviceId: edit.rewardKind === 'free_service' ? edit.serviceId : null });
              if (r) {
                setEdit(null);
                router.refresh();
              }
            }}
          >
            <ErrorAlert error={s.error} />
            <Field label={t('common.name')} required error={s.fieldErrors.name}>
              {(p) => <input {...p} className="input" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}
            </Field>
            <Field label={t('growth.loyalty.points_cost')} required>
              {(p) => <input {...p} className="input" type="number" min={1} value={edit.pointsCost ?? 0} onChange={(e) => setEdit({ ...edit, pointsCost: Number(e.target.value) })} />}
            </Field>
            <Field label={t('growth.loyalty.kind')} required>
              {(p) => (
                <select {...p} className="input" value={edit.rewardKind} onChange={(e) => setEdit({ ...edit, rewardKind: e.target.value as Reward['rewardKind'] })}>
                  {(['discount_fixed', 'discount_percent', 'free_service'] as const).map((k) => (
                    <option key={k} value={k}>{t(`growth.loyalty.kind.${k}`)}</option>
                  ))}
                </select>
              )}
            </Field>
            {edit.rewardKind === 'free_service' ? (
              <Field label={t('growth.loyalty.service')} required>
                {(p) => (
                  <select {...p} className="input" value={edit.serviceId ?? ''} onChange={(e) => setEdit({ ...edit, serviceId: e.target.value || null })}>
                    <option value="">{t('common.select')}</option>
                    {services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                )}
              </Field>
            ) : (
              <Field label={t('growth.loyalty.value')} hint={edit.rewardKind === 'discount_percent' ? t('growth.loyalty.value_hint_percent') : t('growth.loyalty.value_hint_fixed')} required>
                {(p) => <input {...p} className="input" type="number" min={0} value={edit.rewardValue ?? 0} onChange={(e) => setEdit({ ...edit, rewardValue: Number(e.target.value) })} />}
              </Field>
            )}
            <div className="form-actions">
              <button className="btn btn-gold" disabled={s.busy}>{t('common.save')}</button>
            </div>
          </form>
        </Drawer>
      )}
    </section>
  );
}

interface Ledger {
  balance: number;
  tier: string | null;
  entries: { id: string; kind: string; points: number; reason: string | null; createdAt: string }[];
}

function Members({ tenant, accounts, rewards }: { tenant: string; accounts: Account[]; rewards: Reward[] }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<Account | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const adjust = useSubmit<unknown, { ok: boolean }>(() => `/api/v1/t/${tenant}/loyalty/customers/${open?.tenantCustomerId}/adjust`);
  const redeem = useSubmit<unknown, { balance: number }>(() => `/api/v1/t/${tenant}/loyalty/customers/${open?.tenantCustomerId}/redeem`);
  const load = async (a: Account) => {
    setOpen(a);
    setLedger(null);
    setLedger(await apiFetch<Ledger>(`/api/v1/t/${tenant}/loyalty/customers/${a.tenantCustomerId}`));
  };
  return (
    <section className="card">
      {accounts.length === 0 ? (
        <EmptyState icon="users" title={t('growth.loyalty.no_members')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('growth.customer')}</th><th>{t('growth.loyalty.balance')}</th><th>{t('common.date')}</th></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.tenantCustomerId} className="clickable" tabIndex={0} onClick={() => load(a)} onKeyDown={(e) => e.key === 'Enter' && load(a)}>
                  <td>{a.displayName}</td>
                  <td className="mono">{a.balance}</td>
                  <td className="small muted">{a.lastActivity ? formatDateTime(a.lastActivity, { locale, dateOnly: true }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Drawer title={open.displayName} onClose={() => setOpen(null)}>
          {!ledger ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : (
            <div className="stack">
              <div className="row">
                <span className="badge gold">{t('growth.loyalty.balance')}: {ledger.balance}</span>
                {ledger.tier && <span className="badge">{t('growth.loyalty.tier')}: {ledger.tier}</span>}
              </div>
              <form
                className="card"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await adjust.submit({ points: Number(points), reason })) {
                    setPoints('');
                    setReason('');
                    await load(open);
                  }
                }}
              >
                <h3>{t('growth.loyalty.adjust')}</h3>
                <ErrorAlert error={adjust.error} />
                <div className="row">
                  <input className="input" style={{ maxWidth: 120 }} type="number" aria-label={t('growth.loyalty.adjust_points')} placeholder="±" value={points} onChange={(e) => setPoints(e.target.value)} required />
                  <input className="input" style={{ flex: 1 }} aria-label={t('growth.reason')} placeholder={t('growth.reason')} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
                  <button className="btn btn-sm" disabled={adjust.busy}>{t('common.save')}</button>
                </div>
              </form>
              {rewards.length > 0 && (
                <div className="card">
                  <h3>{t('growth.loyalty.redeem')}</h3>
                  <ErrorAlert error={redeem.error} />
                  <div className="chips">
                    {rewards.map((r) => (
                      <button key={r.id} type="button" className="chip" disabled={redeem.busy || ledger.balance < r.pointsCost} onClick={async () => { if (await redeem.submit({ rewardId: r.id })) await load(open); }}>
                        {r.name} · {r.pointsCost}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <h3>{t('growth.loyalty.history')}</h3>
              <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                {ledger.entries.map((e) => (
                  <li key={e.id} className="row between small">
                    <span>{t(`growth.loyalty.kind_${e.kind}`)} {e.reason && <span className="muted">· {e.reason}</span>}</span>
                    <span className="mono" style={{ color: e.points > 0 ? 'var(--green)' : 'var(--red)' }}>{e.points > 0 ? `+${e.points}` : e.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Drawer>
      )}
    </section>
  );
}

function Coupons({ tenant, coupons }: { tenant: string; coupons: Coupon[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({ code: '', kind: 'percent' as 'percent' | 'fixed', value: '10', minTotal: '', max: '', perCustomer: '1', startsAt: '', endsAt: '' });
  const s = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/coupons`);
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('growth.coupons.title')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}><Icon name="plus" size={14} /> {t('growth.coupons.add')}</button>
      </div>
      <p className="small muted">{t('growth.coupons.prefer_loyalty')}</p>
      {coupons.length === 0 ? (
        <EmptyState icon="ticket" title={t('growth.coupons.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('growth.coupons.code')}</th><th>{t('growth.loyalty.value')}</th><th>{t('growth.coupons.used')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td>{c.kind === 'percent' ? `${c.value / 100}%` : formatMoney(c.value, 'SAR', locale)}</td>
                  <td className="mono">{c.redeemedCount}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
                  <td><span className={`badge ${c.status === 'active' ? 'green' : ''}`}>{c.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={async () => {
                        await apiFetch(`/api/v1/t/${tenant}/coupons/${c.id}`, { method: 'PATCH', body: { status: c.status === 'active' ? 'paused' : 'active' } });
                        router.refresh();
                      }}
                    >
                      {c.status === 'active' ? t('growth.coupons.pause') : t('growth.coupons.resume')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Drawer title={t('growth.coupons.add')} onClose={() => setOpen(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const value = form.kind === 'percent' ? Math.round(Number(form.value) * 100) : parseMoneyToMinor(form.value) ?? 0;
              const r = await s.submit({
                code: form.code,
                kind: form.kind,
                value,
                minTotalMinor: form.minTotal ? parseMoneyToMinor(form.minTotal) ?? 0 : 0,
                maxRedemptions: form.max ? Number(form.max) : null,
                perCustomerLimit: Number(form.perCustomer || 1),
                startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
                endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
              });
              if (r) {
                setOpen(false);
                router.refresh();
              }
            }}
          >
            <ErrorAlert error={s.error} />
            <Field label={t('growth.coupons.code')} required error={s.fieldErrors.code}>
              {(p) => <input {...p} className="input input-ltr mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />}
            </Field>
            <div className="row">
              <button type="button" className="chip" aria-pressed={form.kind === 'percent'} onClick={() => setForm({ ...form, kind: 'percent' })}>{t('growth.coupons.kind_percent')}</button>
              <button type="button" className="chip" aria-pressed={form.kind === 'fixed'} onClick={() => setForm({ ...form, kind: 'fixed' })}>{t('growth.coupons.kind_fixed')}</button>
            </div>
            <Field label={form.kind === 'percent' ? '%' : t('growth.amount')} hint={form.kind === 'fixed' ? t('growth.sar_hint') : undefined} required>
              {(p) => <input {...p} className="input" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}
            </Field>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <Field label={t('growth.coupons.min_total')}>{(p) => <input {...p} className="input" inputMode="decimal" value={form.minTotal} onChange={(e) => setForm({ ...form, minTotal: e.target.value })} />}</Field>
              <Field label={t('growth.coupons.max')}>{(p) => <input {...p} className="input" type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} />}</Field>
              <Field label={t('growth.coupons.per_customer')} required>{(p) => <input {...p} className="input" type="number" min={1} value={form.perCustomer} onChange={(e) => setForm({ ...form, perCustomer: e.target.value })} />}</Field>
            </div>
            <fieldset>
              <legend>{t('growth.coupons.window')}</legend>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <input className="input" type="datetime-local" aria-label={t('common.from')} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                <input className="input" type="datetime-local" aria-label={t('common.to')} value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </div>
            </fieldset>
            <div className="form-actions"><button className="btn btn-gold" disabled={s.busy}>{t('common.create')}</button></div>
          </form>
        </Drawer>
      )}
    </section>
  );
}
