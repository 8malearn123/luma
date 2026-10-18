'use client';

import { useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';
import { DataState, MoneyInput, PageHead, Tabs, useApi, useUrlTab } from './hooks';

interface Item { id: string; branchId: string; branchName: string; usage: string; productId: string | null; name: string; unit: string; onHand: number; reserved: number; available: number; lowStockThreshold: number | null; unitCostMinor?: number | null; low: boolean }
interface Opt { id: string; name: string }

export function InventoryManager({ tenant, tz, branches, products, services, canSeeCost, initialLow }: { tenant: string; tz: string; branches: Opt[]; products: Opt[]; services: Opt[]; canSeeCost: boolean; initialLow: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [tab, setTab] = useUrlTab('items');
  const [low, setLow] = useState(initialLow);
  const list = useApi<{ items: Item[] }>(`/api/v1/t/${tenant}/inventory${low ? '?low=1' : ''}`);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ branchId: branches[0]?.id ?? '', usage: 'material', productId: '', name: '', unit: 'piece', lowStockThreshold: '', unitCostMinor: null as number | null });
  const create = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/inventory`);
  const [moving, setMoving] = useState<Item | null>(null);
  const [mv, setMv] = useState({ kind: 'receipt', quantity: '', reason: '', unitCostMinor: null as number | null });
  const move = useSubmit<unknown, { onHand: number }>(() => `/api/v1/t/${tenant}/inventory/${moving?.id}/movements`);
  const history = useApi<{ items: { id: string; kind: string; onHandDelta: number; reservedDelta: number; reason: string | null; createdAt: string; actorName: string | null }[] }>(moving ? `/api/v1/t/${tenant}/inventory/${moving.id}/movements` : null);

  return (
    <>
      <PageHead title={t('nav.inventory')} actions={tab === 'items' && <button type="button" className="btn btn-gold" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> {t('inv.new_item')}</button>} />
      <Tabs tabs={[{ key: 'items', label: t('inv.items') }, { key: 'recipes', label: t('inv.recipes') }]} value={tab} onChange={setTab} />
      {tab === 'items' ? (
        <>
          <div className="toolbar"><label className="check"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> {t('inv.low_only')}</label></div>
          <DataState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
            {!list.data?.items.length ? (
              <div className="card"><EmptyState icon="box" title={t('common.empty')} /></div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.name')}</th><th>{t('inv.usage')}</th><th>{t('st.branches')}</th><th>{t('inv.on_hand')}</th><th>{t('inv.reserved')}</th><th>{t('pr.available')}</th>{canSeeCost && <th>{t('inv.unit_cost')}</th>}<th /></tr></thead>
                  <tbody>
                    {list.data.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name} {i.low && <span className="badge red">{t('dash.low_stock')}</span>}</td>
                        <td>{t(`inv.usage.${i.usage}`)}</td>
                        <td className="small">{i.branchName}</td>
                        <td className="mono">{i.onHand} {i.unit}</td>
                        <td className="mono">{i.reserved}</td>
                        <td className="mono">{i.available}</td>
                        {canSeeCost && <td>{i.unitCostMinor == null ? <span className="muted">{t('common.unknown')}</span> : formatMoney(i.unitCostMinor, 'SAR', locale)}</td>}
                        <td><button type="button" className="btn btn-sm" onClick={() => { setMoving(i); setMv({ kind: 'receipt', quantity: '', reason: '', unitCostMinor: null }); }}>{t('inv.movements')}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataState>
        </>
      ) : (
        <RecipesPanel tenant={tenant} services={services} branches={branches} items={list.data?.items ?? []} />
      )}

      {creating && (
        <Drawer title={t('inv.new_item')} onClose={() => setCreating(false)}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const r = await create.submit({ branchId: form.branchId, usage: form.usage, productId: form.productId || null, name: form.name, unit: form.unit, lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : null, unitCostMinor: canSeeCost ? form.unitCostMinor : null });
            if (r) { setCreating(false); toast(t('common.saved'), 'ok'); void list.reload(); }
          }}>
            <ErrorAlert error={create.error} />
            <Field label={t('inv.usage')} required>{(p) => <select {...p} className="input" value={form.usage} onChange={(e) => setForm({ ...form, usage: e.target.value })}>{['material', 'retail', 'both'].map((u) => <option key={u} value={u}>{t(`inv.usage.${u}`)}</option>)}</select>}</Field>
            {form.usage !== 'material' && (
              <Field label={t('nav.products')} required>{(p) => <select {...p} className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value, name: form.name || products.find((x) => x.id === e.target.value)?.name || '' })}><option value="">—</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
            )}
            <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            {branches.length > 1 && <Field label={t('st.branches')} required>{(p) => <select {...p} className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</Field>}
            <div className="grid cols-2">
              <Field label={t('inv.unit')} required>{(p) => <select {...p} className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{['piece', 'ml', 'l', 'g', 'kg'].map((u) => <option key={u} value={u}>{u}</option>)}</select>}</Field>
              <Field label={t('inv.threshold')}>{(p) => <input {...p} type="number" min={0} className="input" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />}</Field>
              {canSeeCost && <Field label={t('inv.unit_cost')}>{(p) => <MoneyInput {...p} value={form.unitCostMinor} onChange={(v) => setForm({ ...form, unitCostMinor: v })} />}</Field>}
            </div>
            <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={create.busy || !form.name.trim()}>{t('common.save')}</button></div>
          </form>
        </Drawer>
      )}

      {moving && (
        <Drawer title={`${moving.name} · ${t('inv.movements')}`} onClose={() => setMoving(null)}>
          <form className="card" onSubmit={async (e) => {
            e.preventDefault();
            const r = await move.submit({ kind: mv.kind, quantity: Number(mv.quantity), reason: mv.reason, unitCostMinor: canSeeCost && mv.kind === 'receipt' ? mv.unitCostMinor : null });
            if (r) { toast(t('common.saved'), 'ok'); setMv({ ...mv, quantity: '', reason: '' }); void history.reload(); void list.reload(); }
          }}>
            <ErrorAlert error={move.error} />
            <div className="grid cols-2">
              <Field label={t('common.actions')} required>{(p) => <select {...p} className="input" value={mv.kind} onChange={(e) => setMv({ ...mv, kind: e.target.value })}><option value="receipt">{t('inv.receipt')}</option><option value="adjustment">{t('inv.adjust')}</option><option value="return">{t('inv.kind.return')}</option></select>}</Field>
              <Field label={`${t('common.total')} (${moving.unit})`} required hint={mv.kind === 'adjustment' ? '±' : undefined}>{(p) => <input {...p} type="number" step="any" className="input mono" value={mv.quantity} onChange={(e) => setMv({ ...mv, quantity: e.target.value })} />}</Field>
            </div>
            <Field label={t('common.reason')} required>{(p) => <input {...p} className="input" value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} minLength={3} maxLength={300} />}</Field>
            {canSeeCost && mv.kind === 'receipt' && <Field label={t('inv.unit_cost')}>{(p) => <MoneyInput {...p} value={mv.unitCostMinor} onChange={(v) => setMv({ ...mv, unitCostMinor: v })} />}</Field>}
            <button type="submit" className="btn btn-gold btn-sm" disabled={move.busy || !mv.quantity || mv.reason.trim().length < 3}>{t('common.save')}</button>
          </form>
          <DataState loading={history.loading && !history.data} error={history.error}>
            <ul className="small" style={{ paddingInlineStart: 18 }}>
              {history.data?.items.map((m) => (
                <li key={m.id}>{formatDateTime(m.createdAt, { tz, locale })} · {t(`inv.kind.${m.kind}`)} · {m.onHandDelta !== 0 ? `${m.onHandDelta > 0 ? '+' : ''}${m.onHandDelta}` : ''}{m.reservedDelta ? ` (${t('inv.reserved')} ${m.reservedDelta > 0 ? '+' : ''}${m.reservedDelta})` : ''} · {m.reason ?? ''} {m.actorName ? `· ${m.actorName}` : ''}</li>
              ))}
            </ul>
          </DataState>
        </Drawer>
      )}
    </>
  );
}

function RecipesPanel({ tenant, services, branches, items }: { tenant: string; services: Opt[]; branches: Opt[]; items: Item[] }) {
  const t = useT();
  const toast = useToast();
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const recipe = useApi<{ lines: { inventoryItemId: string; name: string; quantity: number; unit: string; approvedAt: string | null }[] }>(serviceId ? `/api/v1/t/${tenant}/inventory/recipes/${serviceId}` : null);
  const cap = useApi<{ status: string; approxBookings: number | null; limitingItem: string | null; method: string; missing: string[] }>(serviceId && branches[0] ? `/api/v1/t/${tenant}/inventory/capacity?serviceId=${serviceId}&branchId=${branches[0].id}` : null);
  const [lines, setLines] = useState<{ inventoryItemId: string; quantity: string; unit: string }[] | null>(null);
  const save = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/inventory/recipes/${serviceId}`, 'PUT');
  const materials = items.filter((i) => i.usage !== 'retail');
  const current = lines ?? (recipe.data?.lines ?? []).map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: String(l.quantity), unit: l.unit }));
  const submit = async (approve: boolean) => {
    if (await save.submit({ approve, lines: current.filter((l) => l.inventoryItemId && Number(l.quantity) > 0).map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity), unit: l.unit })) })) {
      toast(t('common.saved'), 'ok');
      setLines(null);
      void recipe.reload();
      void cap.reload();
    }
  };
  if (!services.length) return <div className="card"><EmptyState icon="scissors" title={t('common.empty')} /></div>;
  return (
    <div className="card stack">
      <Field label={t('inv.recipe_for')} required>{(p) => <select {...p} className="input" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setLines(null); }}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</Field>
      <DataState loading={recipe.loading && !recipe.data} error={recipe.error}>
        {current.map((l, i) => (
          <div key={i} className="grid cols-3" style={{ gap: 6 }}>
            <select className="input" aria-label={t('inv.items')} value={l.inventoryItemId} onChange={(e) => { const n = [...current]; n[i] = { ...l, inventoryItemId: e.target.value }; setLines(n); }}>
              <option value="">—</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </select>
            <input className="input mono" type="number" step="any" min={0} aria-label={t('common.total')} value={l.quantity} onChange={(e) => { const n = [...current]; n[i] = { ...l, quantity: e.target.value }; setLines(n); }} />
            <select className="input" aria-label={t('inv.unit')} value={l.unit} onChange={(e) => { const n = [...current]; n[i] = { ...l, unit: e.target.value }; setLines(n); }}>{['piece', 'ml', 'l', 'g', 'kg'].map((u) => <option key={u}>{u}</option>)}</select>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setLines([...current, { inventoryItemId: '', quantity: '', unit: 'ml' }])}><Icon name="plus" size={14} /> {t('common.add')}</button>
          <button type="button" className="btn btn-sm" disabled={save.busy} onClick={() => submit(false)}>{t('common.save')}</button>
          <button type="button" className="btn btn-gold btn-sm" disabled={save.busy} onClick={() => submit(true)}>{t('inv.approve_recipe')}</button>
        </div>
        <ErrorAlert error={save.error} />
      </DataState>
      {cap.data && (
        cap.data.status === 'estimated' ? (
          <div className="alert ok"><div>{t('inv.capacity', { n: cap.data.approxBookings ?? 0 })}</div><div className="small">{t('inv.capacity_limited', { item: cap.data.limitingItem ?? '' })} · {cap.data.method}</div></div>
        ) : (
          <div className="alert warn"><div>{t('inv.cannot_estimate', { missing: cap.data.missing.join(', ') })}</div><div className="small">{cap.data.method}</div></div>
        )
      )}
    </div>
  );
}
