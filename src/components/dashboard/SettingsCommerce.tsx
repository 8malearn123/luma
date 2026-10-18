'use client';

import { useEffect, useState } from 'react';
import { formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, MoneyInput, useApi } from './hooks';

interface Settings {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  cashOnDelivery: boolean;
  deliveryInstructions: string | null;
  returnsEnabled: boolean;
  returnWindowDays: number;
  returnPolicyText: string | null;
  returnShippingPaidBy: 'customer' | 'business';
  refundDeliveryFee: boolean;
}
interface Zone {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  cities: string[];
  districts: string[];
  feeMinor: number;
  freeOverMinor: number | null;
  minOrderMinor: number;
  etaMinHours: number;
  etaMaxHours: number;
  isActive: boolean;
}

/** Settings → Delivery & returns: fulfillment methods, return policy and delivery zones. */
export function CommerceSettings({ tenant }: { tenant: string }) {
  const t = useT();
  const d = useApi<{ settings: Settings; zones: Zone[]; branches: { id: string; name: string }[] }>(`/api/v1/t/${tenant}/settings/commerce`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {d.data && (
        <div className="stack">
          <Zones tenant={tenant} zones={d.data.zones} branches={d.data.branches} onSaved={d.reload} />
          <SettingsForm tenant={tenant} data={d.data.settings} hasZones={d.data.zones.some((z) => z.isActive)} onSaved={d.reload} />
          <p className="small muted">{t('dlv.settings_honest')}</p>
        </div>
      )}
    </DataState>
  );
}

function SettingsForm({ tenant, data, hasZones, onSaved }: { tenant: string; data: Settings; hasZones: boolean; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [v, setV] = useState(data);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setV(data);
    setDirty(false);
  }, [data]);
  useUnsavedGuard(dirty);
  const set = (p: Partial<Settings>) => { setV({ ...v, ...p }); setDirty(true); };
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/settings/commerce`, 'PUT');
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await s.submit({ ...v, deliveryInstructions: v.deliveryInstructions || null, returnPolicyText: v.returnPolicyText || null })) { setDirty(false); toast(t('common.saved'), 'ok'); onSaved(); } }}>
      <h3>{t('dlv.methods')}</h3>
      <ErrorAlert error={s.error} />
      <label className="check"><input type="checkbox" checked={v.pickupEnabled} onChange={(e) => set({ pickupEnabled: e.target.checked })} /> {t('dlv.enable_pickup')}</label>
      <label className="check"><input type="checkbox" checked={v.deliveryEnabled} disabled={!hasZones && !v.deliveryEnabled} onChange={(e) => set({ deliveryEnabled: e.target.checked })} /> {t('dlv.enable_delivery')}</label>
      {!hasZones && <div className="small muted">{t('dlv.zone_first')}</div>}
      {v.deliveryEnabled && (
        <>
          <label className="check"><input type="checkbox" checked={v.cashOnDelivery} onChange={(e) => set({ cashOnDelivery: e.target.checked })} /> {t('dlv.enable_cod')}</label>
          <Field label={t('dlv.instructions')} hint={t('dlv.instructions_hint')}>{(p) => <textarea {...p} className="input" maxLength={1000} value={v.deliveryInstructions ?? ''} onChange={(e) => set({ deliveryInstructions: e.target.value })} />}</Field>
        </>
      )}
      <hr className="divider" />
      <h3>{t('ret.policy')}</h3>
      <label className="check"><input type="checkbox" checked={v.returnsEnabled} onChange={(e) => set({ returnsEnabled: e.target.checked })} /> {t('ret.enable')}</label>
      {v.returnsEnabled && (
        <div className="grid cols-2">
          <Field label={t('ret.window_days')} required>{(p) => <input {...p} type="number" min={0} max={90} className="input input-ltr" value={v.returnWindowDays} onChange={(e) => set({ returnWindowDays: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} />}</Field>
          <Field label={t('ret.shipping_paid_by')}>{(p) => <select {...p} className="input" value={v.returnShippingPaidBy} onChange={(e) => set({ returnShippingPaidBy: e.target.value as Settings['returnShippingPaidBy'] })}><option value="customer">{t('ret.paid_by.customer')}</option><option value="business">{t('ret.paid_by.business')}</option></select>}</Field>
        </div>
      )}
      {v.returnsEnabled && (
        <>
          <label className="check"><input type="checkbox" checked={v.refundDeliveryFee} onChange={(e) => set({ refundDeliveryFee: e.target.checked })} /> {t('ret.refund_fee')}</label>
          <Field label={t('ret.policy_text')} required hint={t('ret.policy_text_hint')} error={s.fieldErrors.returnPolicyText}>{(p) => <textarea {...p} className="input" rows={4} maxLength={4000} value={v.returnPolicyText ?? ''} onChange={(e) => set({ returnPolicyText: e.target.value })} />}</Field>
          <p className="small muted">{t('ret.non_returnable_hint')}</p>
        </>
      )}
      <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={s.busy || !dirty}>{t('common.save')}</button></div>
    </form>
  );
}

const blank = (branchId: string): Omit<Zone, 'id' | 'branchName'> => ({ branchId, name: '', cities: [], districts: [], feeMinor: 0, freeOverMinor: null, minOrderMinor: 0, etaMinHours: 24, etaMaxHours: 48, isActive: true });

function Zones({ tenant, zones, branches, onSaved }: { tenant: string; zones: Zone[]; branches: { id: string; name: string }[]; onSaved: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [edit, setEdit] = useState<{ id?: string; v: Omit<Zone, 'id' | 'branchName'>; cities: string; districts: string } | null>(null);
  const save = useSubmit<unknown, { id: string }>(() => (edit?.id ? `/api/v1/t/${tenant}/delivery/zones/${edit.id}` : `/api/v1/t/${tenant}/delivery/zones`), edit?.id ? 'PUT' : 'POST');
  const del = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/delivery/zones/${edit?.id}`, 'DELETE');
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const split = (s: string) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
  return (
    <section className="card stack">
      <div className="row between">
        <h3>{t('dlv.zones')}</h3>
        <button type="button" className="btn btn-sm" disabled={!branches.length} onClick={() => setEdit({ v: blank(branches[0]?.id ?? ''), cities: '', districts: '' })}>{t('dlv.zone_add')}</button>
      </div>
      {!zones.length ? <EmptyState icon="pin" title={t('dlv.zones_empty')}><p className="small muted">{t('dlv.zones_hint')}</p></EmptyState> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('dlv.zone')}</th><th>{t('dlv.cities')}</th><th>{t('dlv.fee')}</th><th>{t('dlv.free_over')}</th><th>{t('dlv.eta')}</th><th /></tr></thead>
          <tbody>{zones.map((z) => (
            <tr key={z.id} style={{ opacity: z.isActive ? 1 : 0.55 }}>
              <td>{z.name}<div className="small muted">{z.branchName}</div></td>
              <td className="small">{z.cities.join('، ')}{z.districts.length ? <div className="muted">{z.districts.join('، ')}</div> : null}</td>
              <td>{m(z.feeMinor)}{z.minOrderMinor > 0 && <div className="small muted">{t('dlv.min_order')}: {m(z.minOrderMinor)}</div>}</td>
              <td>{z.freeOverMinor ? m(z.freeOverMinor) : '—'}</td>
              <td className="small">{t('dlv.eta_range', { a: z.etaMinHours, b: z.etaMaxHours })}</td>
              <td><button type="button" className="btn btn-quiet btn-sm" onClick={() => setEdit({ id: z.id, v: { branchId: z.branchId, name: z.name, cities: z.cities, districts: z.districts, feeMinor: z.feeMinor, freeOverMinor: z.freeOverMinor, minOrderMinor: z.minOrderMinor, etaMinHours: z.etaMinHours, etaMaxHours: z.etaMaxHours, isActive: z.isActive }, cities: z.cities.join('، '), districts: z.districts.join('، ') })}>{t('common.edit')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Drawer title={edit.id ? t('dlv.zone_edit') : t('dlv.zone_add')} onClose={() => setEdit(null)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const r = await save.submit({ ...edit.v, cities: split(edit.cities), districts: split(edit.districts) });
            if (r) { toast(t('common.saved'), 'ok'); setEdit(null); onSaved(); }
          }}>
            <ErrorAlert error={save.error ?? del.error} />
            <Field label={t('dlv.zone_name')} required error={save.fieldErrors.name}>{(p) => <input {...p} className="input" maxLength={80} value={edit.v.name} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, name: e.target.value } })} />}</Field>
            <Field label={t('st.branches')} required>{(p) => <select {...p} className="input" value={edit.v.branchId} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, branchId: e.target.value } })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>
            <Field label={t('dlv.cities')} required hint={t('dlv.cities_hint')} error={save.fieldErrors.cities}>{(p) => <input {...p} className="input" value={edit.cities} onChange={(e) => setEdit({ ...edit, cities: e.target.value })} />}</Field>
            <Field label={t('dlv.districts')} hint={t('dlv.districts_hint')}>{(p) => <input {...p} className="input" value={edit.districts} onChange={(e) => setEdit({ ...edit, districts: e.target.value })} />}</Field>
            <div className="grid cols-2">
              <Field label={t('dlv.fee')} required>{(p) => <MoneyInput {...p} value={edit.v.feeMinor} onChange={(x) => setEdit({ ...edit, v: { ...edit.v, feeMinor: x ?? 0 } })} />}</Field>
              <Field label={t('dlv.free_over')} hint={t('dlv.free_over_hint')}>{(p) => <MoneyInput {...p} value={edit.v.freeOverMinor} onChange={(x) => setEdit({ ...edit, v: { ...edit.v, freeOverMinor: x || null } })} />}</Field>
              <Field label={t('dlv.min_order')}>{(p) => <MoneyInput {...p} value={edit.v.minOrderMinor} onChange={(x) => setEdit({ ...edit, v: { ...edit.v, minOrderMinor: x ?? 0 } })} />}</Field>
              <div />
              <Field label={t('dlv.eta_min')} required>{(p) => <input {...p} type="number" min={1} max={720} className="input input-ltr" value={edit.v.etaMinHours} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, etaMinHours: Number(e.target.value) || 1 } })} />}</Field>
              <Field label={t('dlv.eta_max')} required error={save.fieldErrors.etaMaxHours}>{(p) => <input {...p} type="number" min={1} max={720} className="input input-ltr" value={edit.v.etaMaxHours} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, etaMaxHours: Number(e.target.value) || 1 } })} />}</Field>
            </div>
            <label className="check"><input type="checkbox" checked={edit.v.isActive} onChange={(e) => setEdit({ ...edit, v: { ...edit.v, isActive: e.target.checked } })} /> {t('common.active')}</label>
            <div className="form-actions">
              {edit.id && edit.v.isActive && <button type="button" className="btn btn-danger btn-sm" disabled={del.busy} onClick={async () => { if (await del.submit()) { toast(t('common.saved'), 'ok'); setEdit(null); onSaved(); } }}>{t('dlv.zone_deactivate')}</button>}
              <button type="submit" className="btn btn-gold btn-sm" disabled={save.busy || !edit.v.name.trim() || !split(edit.cities).length}>{t('common.save')}</button>
            </div>
          </form>
        </Drawer>
      )}
    </section>
  );
}
