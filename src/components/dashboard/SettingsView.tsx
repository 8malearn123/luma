'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';
import { DataState, MoneyInput, PageHead, statusBadge, Tabs, useApi, useUrlTab } from './hooks';
import { CommerceSettings } from './SettingsCommerce';
import { PaymentsSettings } from './SettingsPayments';

interface Settings {
  business: { name: string; legalName: string | null; taxNumber: string | null; timezone: string; defaultLocale: 'ar' | 'en'; city: string | null; slug: string };
  branches: { id: string; name: string; city: string | null; address: string | null; phone: string | null; isPrimary: boolean; status: string }[];
  policy: Record<string, unknown> & { version: number };
  finance: { pricesIncludeTax: boolean; taxRateBps: number; taxLabel: string; taxRegistered: boolean; legalAddress: string | null; invoiceFooter: string | null } & Record<(typeof VAT_FIELDS)[number], string | null>;
}

const VAT_FIELDS = ['sellerVatNumber', 'crNumber', 'addressBuildingNo', 'addressStreet', 'addressDistrict', 'addressCity', 'addressPostalCode', 'addressAdditionalNo'] as const;

const TZS = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Africa/Cairo', 'Europe/London', 'UTC'];

export function SettingsView({ tenant, caps, delegable, tz }: { tenant: string; caps: string[]; delegable: Record<string, string[]>; tz: string }) {
  const t = useT();
  const can = (c: string) => caps.includes(c);
  const [tab, setTab] = useUrlTab(can('tenant.settings.manage') ? 'business' : can('team.manage') ? 'team' : 'subscription');
  const s = useApi<Settings>(can('tenant.settings.manage') || can('team.manage') || can('payments.configure') ? `/api/v1/t/${tenant}/settings` : null);
  const tabs = [
    can('tenant.settings.manage') && { key: 'business', label: t('st.business') },
    can('tenant.settings.manage') && { key: 'branches', label: t('st.branches') },
    can('tenant.settings.manage') && { key: 'policy', label: t('st.policy') },
    can('tenant.settings.manage') && { key: 'finance', label: t('st.finance') },
    can('tenant.settings.manage') && { key: 'commerce', label: t('st.commerce') },
    can('team.manage') && { key: 'team', label: t('st.team') },
    (can('payments.configure') || can('finance.view')) && { key: 'payments', label: t('st.payments') },
    (can('subscription.view') || can('subscription.manage')) && { key: 'subscription', label: t('st.subscription') },
  ].filter(Boolean) as { key: string; label: string }[];
  const active = tabs.some((x) => x.key === tab) ? tab : tabs[0]?.key;
  return (
    <>
      <PageHead title={t('nav.settings')} />
      <Tabs tabs={tabs} value={active ?? ''} onChange={setTab} />
      {['business', 'branches', 'policy', 'finance'].includes(active ?? '') ? (
        <DataState loading={s.loading && !s.data} error={s.error} onRetry={s.reload} rows={6}>
          {s.data && active === 'business' && <Business tenant={tenant} data={s.data.business} onSaved={s.reload} />}
          {s.data && active === 'branches' && <Branches tenant={tenant} data={s.data.branches} onSaved={s.reload} />}
          {s.data && active === 'policy' && <Policy tenant={tenant} data={s.data.policy} onSaved={s.reload} />}
          {s.data && active === 'finance' && <FinanceSettings tenant={tenant} data={s.data.finance} onSaved={s.reload} />}
        </DataState>
      ) : null}
      {active === 'team' && <Team tenant={tenant} delegable={delegable} tz={tz} isOwnerish={can('ownership.transfer')} />}
      {active === 'commerce' && <CommerceSettings tenant={tenant} />}
      {active === 'payments' && <PaymentsSettings tenant={tenant} canConfigure={can('payments.configure')} tz={tz} />}
      {active === 'subscription' && <Subscription tenant={tenant} tz={tz} />}
    </>
  );
}

function useForm<T>(initial: T) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setV(initial);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial)]);
  useUnsavedGuard(dirty);
  return { v, set: (p: Partial<T>) => { setV((x) => ({ ...x, ...p })); setDirty(true); }, dirty, clean: () => setDirty(false) };
}

function Business({ tenant, data, onSaved }: { tenant: string; data: Settings['business']; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const f = useForm({ name: data.name, legalName: data.legalName ?? '', taxNumber: data.taxNumber ?? '', timezone: data.timezone, defaultLocale: data.defaultLocale, city: data.city ?? '' });
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/settings`, 'PATCH');
  return (
    <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await s.submit({ ...f.v, legalName: f.v.legalName || null, taxNumber: f.v.taxNumber || null, city: f.v.city || null })) { f.clean(); toast(t('common.saved'), 'ok'); onSaved(); } }}>
      <ErrorAlert error={s.error} />
      <div className="grid cols-2">
        <Field label={t('onb.business_name')} required error={s.fieldErrors.name}>{(p) => <input {...p} className="input" value={f.v.name} onChange={(e) => f.set({ name: e.target.value })} />}</Field>
        <Field label={t('onb.city')}>{(p) => <input {...p} className="input" value={f.v.city} onChange={(e) => f.set({ city: e.target.value })} />}</Field>
        <Field label={t('st.legal_name')}>{(p) => <input {...p} className="input" value={f.v.legalName} onChange={(e) => f.set({ legalName: e.target.value })} />}</Field>
        <Field label={t('st.tax_number')} error={s.fieldErrors.taxNumber}>{(p) => <input {...p} className="input input-ltr mono" value={f.v.taxNumber} onChange={(e) => f.set({ taxNumber: e.target.value })} />}</Field>
        <Field label={t('st.timezone')} required>{(p) => <select {...p} className="input" value={f.v.timezone} onChange={(e) => f.set({ timezone: e.target.value })}>{TZS.map((z) => <option key={z}>{z}</option>)}</select>}</Field>
        <Field label={t('st.locale')} required>{(p) => <select {...p} className="input" value={f.v.defaultLocale} onChange={(e) => f.set({ defaultLocale: e.target.value as 'ar' })}><option value="ar">العربية</option><option value="en">English</option></select>}</Field>
      </div>
      <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={s.busy || !f.dirty}>{s.busy ? t('common.saving') : t('common.save')}</button></div>
    </form>
  );
}

function Branches({ tenant, data, onSaved }: { tenant: string; data: Settings['branches']; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [edit, setEdit] = useState<{ id?: string; name: string; city: string; address: string; phone: string } | null>(null);
  const create = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/settings/branches`);
  const update = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/settings/branches/${edit?.id}`, 'PATCH');
  const archive = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/settings/branches/${edit?.id}`, 'DELETE');
  const body = edit && { name: edit.name, city: edit.city || null, address: edit.address || null, phone: edit.phone || null };
  return (
    <div className="grid cols-2">
      <section className="card">
        <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
          {data.map((b) => (
            <li key={b.id} className="row between">
              <span>{b.name} {b.isPrimary && <span className="badge gold">{t('st.primary')}</span>} {b.status !== 'active' && <span className="badge">{t('common.archived')}</span>}<div className="small muted">{[b.city, b.address].filter(Boolean).join(' · ')}</div></span>
              {b.status === 'active' && <button type="button" className="btn btn-sm" onClick={() => setEdit({ id: b.id, name: b.name, city: b.city ?? '', address: b.address ?? '', phone: b.phone ?? '' })}>{t('common.edit')}</button>}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ name: '', city: '', address: '', phone: '' })}><Icon name="plus" size={14} /> {t('st.add_branch')}</button>
      </section>
      {edit && (
        <form className="card" onSubmit={async (e) => { e.preventDefault(); const r = edit.id ? await update.submit(body) : await create.submit(body); if (r) { setEdit(null); toast(t('common.saved'), 'ok'); onSaved(); } }}>
          <ErrorAlert error={create.error ?? update.error ?? archive.error} />
          <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
          <Field label={t('onb.city')}>{(p) => <input {...p} className="input" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} />}</Field>
          <Field label={t('onb.address')}>{(p) => <input {...p} className="input" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />}</Field>
          <Field label={t('onb.phone')}>{(p) => <input {...p} className="input input-ltr" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />}</Field>
          <div className="form-actions">
            {edit.id && <button type="button" className="btn btn-danger btn-sm" disabled={archive.busy} onClick={async () => { if (await archive.submit()) { setEdit(null); onSaved(); } }}>{t('common.archive')}</button>}
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-gold btn-sm" disabled={!edit.name.trim()}>{t('common.save')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Policy({ tenant, data, onSaved }: { tenant: string; data: Settings['policy']; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const pct = (bps: unknown) => Number(bps ?? 0) / 100;
  const f = useForm({
    slotIncrementMin: Number(data.slotIncrementMin), minNoticeMin: Number(data.minNoticeMin), maxAdvanceDays: Number(data.maxAdvanceDays), holdMinutes: Number(data.holdMinutes),
    cancellationWindowHours: Number(data.cancellationWindowHours), lateCancelFeePct: pct(data.lateCancelFeeBps), noShowGraceMin: Number(data.noShowGraceMin), noShowFeePct: pct(data.noShowFeeBps),
    depositMode: String(data.depositMode), depositPct: data.depositMode === 'percent' ? pct(data.depositValue) : 0, depositFixedMinor: data.depositMode === 'fixed' ? Number(data.depositValue) : null as number | null,
    allowOnSite: !!data.allowOnSite, allowFullOnline: !!data.allowFullOnline, anyStaffRule: String(data.anyStaffRule), maxGapMin: Number(data.maxGapMin), policyText: String(data.policyText ?? ''), policyTextEn: String(data.policyTextEn ?? ''),
  });
  const s = useSubmit<unknown, { version: number }>(`/api/v1/t/${tenant}/settings/policy`, 'PUT');
  const v = f.v;
  const num = (k: keyof typeof v, label: string, min = 0, max = 100000, step = 1) => (
    <Field label={label} required>{(p) => <input {...p} type="number" min={min} max={max} step={step} className="input" value={v[k] as number} onChange={(e) => f.set({ [k]: Number(e.target.value) } as Partial<typeof v>)} />}</Field>
  );
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      const r = await s.submit({
        slotIncrementMin: v.slotIncrementMin, minNoticeMin: v.minNoticeMin, maxAdvanceDays: v.maxAdvanceDays, holdMinutes: v.holdMinutes, cancellationWindowHours: v.cancellationWindowHours,
        lateCancelFeeBps: Math.round(v.lateCancelFeePct * 100), noShowGraceMin: v.noShowGraceMin, noShowFeeBps: Math.round(v.noShowFeePct * 100), depositMode: v.depositMode,
        depositValue: v.depositMode === 'percent' ? Math.round(v.depositPct * 100) : v.depositMode === 'fixed' ? (v.depositFixedMinor ?? 0) : 0,
        allowOnSite: v.allowOnSite, allowFullOnline: v.allowFullOnline, anyStaffRule: v.anyStaffRule, maxGapMin: v.maxGapMin, policyText: v.policyText || null, policyTextEn: v.policyTextEn || null, expectedVersion: data.version,
      });
      if (r) { f.clean(); toast(t('common.saved'), 'ok'); onSaved(); }
    }}>
      <div className="alert info">{t('st.policy_note')}</div>
      <ErrorAlert error={s.error} />
      <div className="grid cols-3">
        <Field label={t('st.slot_increment')} required>{(p) => <select {...p} className="input" value={v.slotIncrementMin} onChange={(e) => f.set({ slotIncrementMin: Number(e.target.value) })}>{[5, 10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select>}</Field>
        {num('minNoticeMin', t('st.min_notice'), 0, 20160)}
        {num('maxAdvanceDays', t('st.max_advance'), 1, 365)}
        {num('holdMinutes', t('st.hold_minutes'), 2, 60)}
        {num('cancellationWindowHours', t('st.cancel_window'), 0, 336)}
        {num('lateCancelFeePct', t('st.late_fee'), 0, 100, 0.5)}
        {num('noShowGraceMin', t('st.no_show_grace'), 0, 240)}
        {num('noShowFeePct', t('st.no_show_fee'), 0, 100, 0.5)}
        {num('maxGapMin', t('st.max_gap'), 0, 240)}
      </div>
      <fieldset>
        <legend>{t('st.deposit_mode')}</legend>
        <div className="row">
          {['none', 'percent', 'fixed'].map((m) => <label key={m} className="check"><input type="radio" name="dep" checked={v.depositMode === m} onChange={() => f.set({ depositMode: m })} /> {t(`st.deposit.${m}`)}</label>)}
        </div>
        {v.depositMode === 'percent' && num('depositPct', `${t('st.deposit_value')} (%)`, 0, 100, 0.5)}
        {v.depositMode === 'fixed' && <Field label={t('st.deposit_value')} required>{(p) => <MoneyInput {...p} value={v.depositFixedMinor} onChange={(x) => f.set({ depositFixedMinor: x })} />}</Field>}
      </fieldset>
      <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
        <label className="check"><input type="checkbox" checked={v.allowOnSite} onChange={(e) => f.set({ allowOnSite: e.target.checked })} /> {t('st.allow_on_site')}</label>
        <label className="check"><input type="checkbox" checked={v.allowFullOnline} onChange={(e) => f.set({ allowFullOnline: e.target.checked })} /> {t('st.allow_full_online')}</label>
      </div>
      <Field label={t('st.any_staff_rule')} required>{(p) => <select {...p} className="input" value={v.anyStaffRule} onChange={(e) => f.set({ anyStaffRule: e.target.value })}>{['earliest_then_least_booked', 'earliest_then_weight'].map((r) => <option key={r} value={r}>{t(`st.rule.${r}`)}</option>)}</select>}</Field>
      <Field label={t('st.policy_text')}>{(p) => <textarea {...p} className="input" value={v.policyText} onChange={(e) => f.set({ policyText: e.target.value })} maxLength={4000} />}</Field>
      <Field label={`${t('st.policy_text')} (EN)`}>{(p) => <textarea {...p} className="input" dir="ltr" lang="en" value={v.policyTextEn} onChange={(e) => f.set({ policyTextEn: e.target.value })} maxLength={4000} />}</Field>
      <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={s.busy || !f.dirty}>{t('common.save')}</button></div>
    </form>
  );
}

function FinanceSettings({ tenant, data, onSaved }: { tenant: string; data: Settings['finance']; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const vat = Object.fromEntries(VAT_FIELDS.map((k) => [k, data[k] ?? ''])) as Record<(typeof VAT_FIELDS)[number], string>;
  const f = useForm({ pricesIncludeTax: data.pricesIncludeTax, taxRatePct: data.taxRateBps / 100, taxLabel: data.taxLabel, taxRegistered: data.taxRegistered, legalAddress: data.legalAddress ?? '', invoiceFooter: data.invoiceFooter ?? '', ...vat });
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/settings/finance`, 'PUT');
  const vatOut = Object.fromEntries(VAT_FIELDS.map((k) => [k, f.v[k].trim() || null]));
  return (
    <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await s.submit({ pricesIncludeTax: f.v.pricesIncludeTax, taxRateBps: Math.round(f.v.taxRatePct * 100), taxLabel: f.v.taxLabel, taxRegistered: f.v.taxRegistered, legalAddress: f.v.legalAddress || null, invoiceFooter: f.v.invoiceFooter || null, ...vatOut })) { f.clean(); toast(t('common.saved'), 'ok'); onSaved(); } }}>
      <div className="alert info small">{t('st.tax_doc')} {t('inv.settings_honest')}</div>
      <ErrorAlert error={s.error} />
      <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
        <label className="check"><input type="checkbox" checked={f.v.taxRegistered} onChange={(e) => f.set({ taxRegistered: e.target.checked })} /> {t('st.tax_registered')}</label>
        <label className="check"><input type="checkbox" checked={f.v.pricesIncludeTax} onChange={(e) => f.set({ pricesIncludeTax: e.target.checked })} /> {t('st.prices_include_tax')}</label>
      </div>
      <div className="grid cols-2">
        <Field label={t('st.tax_rate')} required>{(p) => <input {...p} type="number" min={0} max={100} step={0.01} className="input" value={f.v.taxRatePct} onChange={(e) => f.set({ taxRatePct: Number(e.target.value) })} />}</Field>
        <Field label={t('st.tax_label')} required>{(p) => <input {...p} className="input" value={f.v.taxLabel} onChange={(e) => f.set({ taxLabel: e.target.value })} />}</Field>
      </div>
      <h3 style={{ marginTop: 8 }}>{t('inv.seller_identity')}</h3>
      <p className="small muted">{t('inv.seller_identity_hint')}</p>
      <div className="grid cols-2">
        {VAT_FIELDS.map((k) => (
          <Field key={k} label={t(`inv.f.${k}`)} required={k === 'sellerVatNumber' && f.v.taxRegistered} hint={t(`inv.h.${k}`) === `inv.h.${k}` ? undefined : t(`inv.h.${k}`)} error={s.fieldErrors[k]}>
            {(p) => <input {...p} className={`input${/Number|No|Code/.test(k) ? ' input-ltr mono' : ''}`} inputMode={/Number|No|Code/.test(k) ? 'numeric' : undefined} value={f.v[k]} onChange={(e) => f.set({ [k]: e.target.value } as Partial<typeof f.v>)} />}
          </Field>
        ))}
      </div>
      <Field label={t('st.legal_address')} hint={t('inv.legal_address_hint')}>{(p) => <textarea {...p} className="input" value={f.v.legalAddress} onChange={(e) => f.set({ legalAddress: e.target.value })} />}</Field>
      <Field label={t('st.invoice_footer')}>{(p) => <input {...p} className="input" value={f.v.invoiceFooter} onChange={(e) => f.set({ invoiceFooter: e.target.value })} />}</Field>
      <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={s.busy || !f.dirty}>{t('common.save')}</button></div>
    </form>
  );
}

interface Member { id: string; role: string; status: string; grantedCaps: string[]; displayName: string; email: string | null; phone: string | null; staffName: string | null }
interface Invite { id: string; email: string | null; phone: string | null; role: string; expiresAt: string }

function Team({ tenant, delegable, tz, isOwnerish }: { tenant: string; delegable: Record<string, string[]>; tz: string; isOwnerish: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<{ members: Member[]; invitations: Invite[] }>(`/api/v1/t/${tenant}/members`);
  const [inv, setInv] = useState({ contact: '', role: 'receptionist' });
  const [link, setLink] = useState<{ link: string; delivery: string } | null>(null);
  const invite = useSubmit<unknown, { link: string; delivery: string }>(`/api/v1/t/${tenant}/members`);
  const [editing, setEditing] = useState<Member | null>(null);
  const patch = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/members/${editing?.id}`, 'PATCH');
  const revoke = useSubmit<unknown, unknown>('', 'DELETE');
  const roles = isOwnerish ? ['manager', 'receptionist', 'specialist', 'finance'] : ['receptionist', 'specialist', 'finance'];
  return (
    <div className="grid cols-2">
      <section className="card">
        <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {d.data?.members.map((m) => (
              <li key={m.id} className="row between">
                <span>{m.displayName} <span className="badge">{t(`role.${m.role}`)}</span> {m.status !== 'active' && <span className={`badge ${statusBadge(m.status)}`}>{m.status}</span>}
                  <div className="small muted">{m.email ?? m.phone}{m.staffName ? ` · ${m.staffName}` : ''}{m.grantedCaps.length ? ` · +${m.grantedCaps.length}` : ''}</div></span>
                {m.role === 'owner' ? <span className="small muted">{t('st.owner_locked')}</span> : <button type="button" className="btn btn-sm" onClick={() => setEditing(m)}>{t('common.edit')}</button>}
              </li>
            ))}
          </ul>
          {!!d.data?.invitations.length && (
            <>
              <h3>{t('st.pending_invites')}</h3>
              <ul className="small">{d.data.invitations.map((i) => (
                <li key={i.id}>{i.email ?? i.phone} · {t(`role.${i.role}`)} · {formatDateTime(i.expiresAt, { tz, locale, dateOnly: true })}{' '}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await fetch(`/api/v1/t/${tenant}/members/invitations/${i.id}`, { method: 'DELETE', headers: { 'x-luma-request': '1' } }); void d.reload(); }}>{t('st.revoke')}</button></li>
              ))}</ul>
            </>
          )}
        </DataState>
      </section>
      <div className="stack">
        <form className="card" onSubmit={async (e) => {
          e.preventDefault();
          const c = inv.contact.trim();
          const r = await invite.submit({ role: inv.role, ...(c.includes('@') ? { email: c } : { phone: c.replace(/^05/, '+9665') }) });
          if (r) { setLink(r); setInv({ ...inv, contact: '' }); void d.reload(); }
        }}>
          <h2>{t('st.invite')}</h2>
          <ErrorAlert error={invite.error ?? revoke.error} />
          <Field label={t('auth.identifier')} required>{(p) => <input {...p} className="input input-ltr" value={inv.contact} onChange={(e) => setInv({ ...inv, contact: e.target.value })} />}</Field>
          <Field label={t('common.status')} required>{(p) => <select {...p} className="input" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>}</Field>
          <button type="submit" className="btn btn-gold btn-sm" disabled={invite.busy || inv.contact.trim().length < 5}>{t('st.invite')}</button>
          {link && (
            <div className="alert info" style={{ marginTop: 10 }}>
              <div>{t('st.invite_link')}</div>
              <code className="mono small" style={{ wordBreak: 'break-all' }}>{typeof window !== 'undefined' ? window.location.origin : ''}{link.link}</code>
              {link.delivery !== 'provider' && <div className="small">{t('st.invite_not_sent')}</div>}
            </div>
          )}
        </form>
        {editing && (
          <form className="card" onSubmit={async (e) => {
            e.preventDefault();
            if (await patch.submit({ role: editing.role, grantedCaps: editing.grantedCaps })) { toast(t('common.saved'), 'ok'); setEditing(null); void d.reload(); }
          }}>
            <h3>{editing.displayName}</h3>
            <ErrorAlert error={patch.error} />
            <Field label={t('common.status')} required>{(p) => <select {...p} className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value, grantedCaps: editing.grantedCaps.filter((c) => (delegable[c] ?? []).includes(e.target.value)) })}>{roles.concat(roles.includes(editing.role) ? [] : [editing.role]).map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>}</Field>
            <fieldset>
              <legend>{t('st.delegated')}</legend>
              {Object.entries(delegable).filter(([, rs]) => rs.includes(editing.role)).length === 0 && <div className="small muted">{t('common.none')}</div>}
              {Object.entries(delegable).filter(([, rs]) => rs.includes(editing.role)).map(([cap]) => (
                <label key={cap} className="check" style={{ display: 'flex' }}>
                  <input type="checkbox" checked={editing.grantedCaps.includes(cap)} onChange={(e) => setEditing({ ...editing, grantedCaps: e.target.checked ? [...editing.grantedCaps, cap] : editing.grantedCaps.filter((c) => c !== cap) })} />
                  <span className="mono small">{cap}</span>
                </label>
              ))}
            </fieldset>
            <div className="form-actions">
              <button type="button" className="btn btn-danger btn-sm" onClick={async () => { if (await patch.submit({ status: editing.status === 'active' ? 'suspended' : 'active' })) { setEditing(null); void d.reload(); } }}>{editing.status === 'active' ? t('st.suspend') : t('st.reactivate')}</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { if (window.confirm(t('st.remove')) && (await patch.submit({ status: 'removed' }))) { setEditing(null); void d.reload(); } }}>{t('st.remove')}</button>
              <button type="submit" className="btn btn-gold btn-sm" disabled={patch.busy}>{t('common.save')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Subscription({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<{ subscription: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; overageState: string; code: string; nameAr: string; nameEn: string; priceMonthlyMinor: number | null; priceIsTest: boolean } | null; live: boolean; features: Record<string, { enabled: boolean; limit: number | null }>; usage: { staff: number; services: number; branches: number } }>(`/api/v1/t/${tenant}/settings/subscription`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
      {!d.data?.subscription ? <div className="card"><EmptyState icon="box" title={t('errors.subscription_inactive')}>{t('st.contact_luma')}</EmptyState></div> : (
        <div className="card stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{t('st.plan')}: {locale === 'ar' ? d.data.subscription.nameAr : d.data.subscription.nameEn}</h2>
            <span className={`badge ${d.data.live ? 'green' : 'red'}`}>{t(`sub.${d.data.subscription.status}`)}</span>
          </div>
          <div className="small">
            {d.data.subscription.priceMonthlyMinor == null ? t('st.price_unset') : formatMoney(d.data.subscription.priceMonthlyMinor, 'SAR', locale)}
            {d.data.subscription.priceIsTest && <span className="badge amber" style={{ marginInlineStart: 6 }}>{t('st.test_price')}</span>}
          </div>
          {d.data.subscription.trialEndsAt && <div className="small">{t('st.trial_ends')}: {formatDateTime(d.data.subscription.trialEndsAt, { tz, locale, dateOnly: true })}</div>}
          {d.data.subscription.overageState === 'over_limit' && <div className="alert warn">{t('st.overage')}</div>}
          <table className="table">
            <thead><tr><th /><th>{t('st.usage')}</th><th>{t('st.limit')}</th></tr></thead>
            <tbody>
              {([['staff.max', d.data.usage.staff, 'nav.team'], ['services.max', d.data.usage.services, 'nav.services'], ['branches.max', d.data.usage.branches, 'st.branches']] as const).map(([k, used, label]) => (
                <tr key={k}><td>{t(label)}</td><td>{used}</td><td>{d.data!.features[k]?.limit ?? t('st.unlimited')}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="small muted">{t('st.contact_luma')}</div>
        </div>
      )}
    </DataState>
  );
}
