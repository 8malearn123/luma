'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { parseMoneyToMinor } from '@/lib/format';
import { useT } from '../I18n';
import { ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';

export interface PlanData {
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  priceMonthlyMinor: number | null;
  priceYearlyMinor: number | null;
  priceIsTest: boolean;
  trialDays: number;
  graceDays: number;
  poweredByRequired: boolean;
  status: string;
  sort: number;
  features: { featureKey: string; enabled: boolean; limitValue: number | null }[];
}

const toSar = (m: number | null) => (m == null ? '' : String(m / 100));

/** Plan + feature matrix editor. Empty price = not configured (never invented). */
export function PlanEditor({ plan, featureKeys }: { plan: PlanData; featureKeys: readonly string[] }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const s = useSubmit<unknown, { id: string }>(plan.id ? `/api/v1/platform/plans/${plan.id}` : '/api/v1/platform/plans', plan.id ? 'PUT' : 'POST');
  const [v, setV] = useState({ ...plan, monthly: toSar(plan.priceMonthlyMinor), yearly: toSar(plan.priceYearlyMinor) });
  const [feats, setFeats] = useState(() =>
    Object.fromEntries(
      featureKeys.map((k) => {
        const f = plan.features.find((x) => x.featureKey === k);
        return [k, { enabled: !!f?.enabled, limit: f?.limitValue == null ? '' : String(f.limitValue), present: !!f }];
      }),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useUnsavedGuard(dirty);
  const set = (patch: Partial<typeof v>) => {
    setV({ ...v, ...patch });
    setDirty(true);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const monthly = v.monthly.trim() === '' ? null : parseMoneyToMinor(v.monthly);
    const yearly = v.yearly.trim() === '' ? null : parseMoneyToMinor(v.yearly);
    if ((v.monthly.trim() && monthly === null) || (v.yearly.trim() && yearly === null)) return setErr(t('errors.validation'));
    const r = await s.submit({
      code: v.code,
      nameAr: v.nameAr,
      nameEn: v.nameEn,
      priceMonthlyMinor: monthly,
      priceYearlyMinor: yearly,
      priceIsTest: v.priceIsTest,
      trialDays: Number(v.trialDays),
      graceDays: Number(v.graceDays),
      poweredByRequired: v.poweredByRequired,
      status: v.status,
      sort: Number(v.sort),
      features: Object.entries(feats)
        .filter(([, f]) => f.enabled || f.present)
        .map(([key, f]) => ({ key, enabled: f.enabled, limit: key.endsWith('.max') || key.endsWith('_runs') ? (f.limit === '' ? null : Number(f.limit)) : null })),
    });
    if (r) {
      setDirty(false);
      toast(t('common.saved'), 'ok');
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="card" noValidate>
      <h2>{plan.id ? `${plan.nameAr} · ${plan.nameEn}` : t('platform.new_plan_title')}</h2>
      {err && <div className="alert error">{err}</div>}
      <ErrorAlert error={s.error} />
      <div className="grid cols-3">
        <Field label={t('platform.plan_code')} required>{(p) => <input {...p} className="input input-ltr" value={v.code} onChange={(e) => set({ code: e.target.value })} />}</Field>
        <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={v.nameAr} onChange={(e) => set({ nameAr: e.target.value })} />}</Field>
        <Field label={t('common.name_en')} required>{(p) => <input {...p} className="input input-ltr" value={v.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
        <Field label={t('platform.price_monthly')} hint={t('platform.price_unset_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={v.monthly} onChange={(e) => set({ monthly: e.target.value })} />}</Field>
        <Field label={t('platform.price_yearly')} hint={t('platform.price_unset_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={v.yearly} onChange={(e) => set({ yearly: e.target.value })} />}</Field>
        <Field label={t('common.status')} required>
          {(p) => (
            <select {...p} className="input" value={v.status} onChange={(e) => set({ status: e.target.value })}>
              {['draft', 'active', 'archived'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('platform.trial_days')} required>{(p) => <input {...p} type="number" className="input input-ltr" value={v.trialDays} onChange={(e) => set({ trialDays: Number(e.target.value) })} />}</Field>
        <Field label={t('platform.grace_days')} required>{(p) => <input {...p} type="number" className="input input-ltr" value={v.graceDays} onChange={(e) => set({ graceDays: Number(e.target.value) })} />}</Field>
        <Field label="sort" required>{(p) => <input {...p} type="number" className="input input-ltr" value={v.sort} onChange={(e) => set({ sort: Number(e.target.value) })} />}</Field>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="check"><input type="checkbox" checked={v.priceIsTest} onChange={(e) => set({ priceIsTest: e.target.checked })} />{t('platform.price_is_test')}</label>
        <label className="check"><input type="checkbox" checked={v.poweredByRequired} onChange={(e) => set({ poweredByRequired: e.target.checked })} />{t('platform.powered_by')}</label>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('platform.col.feature')}</th><th>{t('platform.enabled')}</th><th>{t('platform.col.limit')}</th></tr></thead>
          <tbody>
            {featureKeys.map((k) => (
              <tr key={k}>
                <td>{t(`feature.${k}`)} <span className="muted small mono">{k}</span></td>
                <td><input type="checkbox" aria-label={`${k} enabled`} checked={feats[k].enabled} onChange={(e) => { setFeats({ ...feats, [k]: { ...feats[k], enabled: e.target.checked } }); setDirty(true); }} /></td>
                <td>
                  {k.endsWith('.max') || k.endsWith('_runs') ? (
                    <input className="input input-ltr" style={{ maxWidth: 120 }} type="number" min={0} aria-label={`${k} limit`} placeholder={t('platform.unlimited')} value={feats[k].limit} onChange={(e) => { setFeats({ ...feats, [k]: { ...feats[k], limit: e.target.value } }); setDirty(true); }} />
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button className="btn btn-gold" type="submit" disabled={s.busy}>{s.busy ? t('common.saving') : t('platform.save_plan')}</button>
      </div>
    </form>
  );
}
