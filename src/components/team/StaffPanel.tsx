'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { tapi, uploadImage, useLoad } from '../catalog/client';
import type { TeamRefs } from './TeamManager';

interface StaffRow {
  id: string; displayName: string; displayNameEn: string | null; specialty: string | null; status: 'active' | 'inactive' | 'archived';
  publicVisible: boolean; photoAssetId: string | null; userId: string | null; version: number; branchIds: string[]; serviceIds: string[];
}
interface Full extends StaffRow { bio: string | null; allocationWeight: number }
interface Affected { bookingId: string; number: string; startsAt: string; serviceName: string; status: string }

export function StaffPanel({ slug, refs }: { slug: string; refs: TeamRefs }) {
  const t = useT();
  const [archived, setArchived] = useState(false);
  const list = useLoad<{ items: StaffRow[] }>(tapi(slug, `/staff?archived=${archived ? 1 : 0}`));
  const [open, setOpen] = useState<string | 'new' | null>(null);
  return (
    <section aria-label={t('team.tab.staff')}>
      <div className="toolbar">
        <button type="button" className="btn btn-gold" onClick={() => setOpen('new')}><Icon name="plus" size={16} /> {t('team.new_staff')}</button>
        <label className="check small"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t('ops.show_archived')}</label>
      </div>
      <p className="small muted">{t('team.profile_vs_login')}</p>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 120 }} /> : !list.data?.items.length ? <EmptyState icon="staff" title={t('team.no_staff')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('team.specialty')}</th><th>{t('nav.services')}</th><th>{t('team.login')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>
              {list.data.items.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setOpen(s.id)}>
                  <td><button type="button" className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); setOpen(s.id); }}>{s.displayName}</button></td>
                  <td className="muted">{s.specialty ?? '—'}</td>
                  <td>{s.serviceIds.length}</td>
                  <td>{s.userId ? <span className="badge green">{t('team.has_login')}</span> : <span className="badge">{t('team.no_login')}</span>}</td>
                  <td><span className={`badge ${s.status === 'active' ? 'green' : s.status === 'inactive' ? 'amber' : ''}`}>{t(`common.${s.status}`)}</span> {!s.publicVisible && <span className="badge">{t('common.hidden')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <StaffEditor slug={slug} id={open === 'new' ? null : open} refs={refs} onClose={() => setOpen(null)} onSaved={(id) => { void list.reload(); setOpen(id); }} />}
    </section>
  );
}

function StaffEditor({ slug, id, refs, onClose, onSaved }: { slug: string; id: string | null; refs: TeamRefs; onClose: () => void; onSaved: (id: string) => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const init = { displayName: '', displayNameEn: '', specialty: '', bio: '', photoAssetId: null as string | null, publicVisible: true, branchIds: refs.branches.slice(0, 1).map((b) => b.id), serviceIds: [] as string[], allocationWeight: 100 };
  const [form, setForm] = useState(init);
  const [orig, setOrig] = useState(JSON.stringify(init));
  const [loaded, setLoaded] = useState<Full | null>(null);
  const [affected, setAffected] = useState<Affected[] | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== orig;
  useUnsavedGuard(dirty);
  const save = useSubmit<unknown, { id: string; version?: number }>(id ? tapi(slug, `/staff/${id}`) : tapi(slug, '/staff'), id ? 'PUT' : 'POST');

  const load = async () => {
    if (!id) return;
    try {
      const r = await apiFetch<{ staff: Full }>(tapi(slug, `/staff/${id}`));
      const s = r.staff;
      const f = { displayName: s.displayName, displayNameEn: s.displayNameEn ?? '', specialty: s.specialty ?? '', bio: s.bio ?? '', photoAssetId: s.photoAssetId, publicVisible: s.publicVisible, branchIds: s.branchIds, serviceIds: s.serviceIds, allocationWeight: s.allocationWeight };
      setForm(f);
      setOrig(JSON.stringify(f));
      setLoaded(s);
      setPhotoUrl(s.photoAssetId ? `/media/${s.photoAssetId}/w320` : null);
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggle = (k: 'branchIds' | 'serviceIds', v: string) => setForm({ ...form, [k]: form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v] });

  const setStatus = async (status: 'active' | 'inactive' | 'archived') => {
    if (!id) return;
    if (status !== 'active' && !window.confirm(t('team.deactivate_confirm'))) return;
    try {
      const r = await apiFetch<{ affectedBookings: Affected[] }>(tapi(slug, `/staff/${id}/status`), { method: 'POST', body: { status } });
      setAffected(r.affectedBookings);
      await load();
      onSaved(id);
    } catch (e) {
      setErr(e as ApiError);
    }
  };

  return (
    <Drawer
      title={id ? form.displayName : t('team.new_staff')}
      onClose={() => (!dirty || window.confirm(t('common.unsaved_changes'))) && onClose()}
      footer={
        <div className="row" style={{ marginInlineStart: 'auto' }}>
          <button type="button" className="btn btn-quiet" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={save.busy || !dirty}
            onClick={async () => {
              const body = { ...form, displayNameEn: form.displayNameEn || null, specialty: form.specialty || null, bio: form.bio || null, ...(id ? { expectedVersion: loaded?.version } : {}) };
              const r = await save.submit(body);
              if (r) {
                toast(t('common.saved'), 'ok');
                if (id) await load();
                onSaved(r.id ?? id!);
              }
            }}
          >
            {save.busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      }
    >
      <ErrorAlert error={save.error ?? err} />
      {loaded && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className={`badge ${loaded.status === 'active' ? 'green' : 'amber'}`}>{t(`common.${loaded.status}`)}</span>
          {loaded.status === 'active' ? (
            <button type="button" className="btn btn-sm" onClick={() => setStatus('inactive')}>{t('ops.deactivate')}</button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => setStatus('active')}>{t('ops.activate')}</button>
          )}
          {loaded.status !== 'archived' && <button type="button" className="btn btn-sm btn-danger" onClick={() => setStatus('archived')}>{t('common.archive')}</button>}
        </div>
      )}
      {affected && affected.length > 0 && (
        <div className="alert warn" role="alert">
          <div>
            <strong>{t('team.affected_title', { n: affected.length })}</strong>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {affected.slice(0, 10).map((b) => (
                <li key={b.bookingId}>
                  <a href={`/app/${slug}/bookings/${b.bookingId}`}>{b.number}</a> · {b.serviceName} · {formatDateTime(b.startsAt, { locale })}
                </li>
              ))}
            </ul>
            <div className="small">{t('team.affected_note')}</div>
          </div>
        </div>
      )}
      <div className="grid cols-2" style={{ gap: 10 }}>
        <Field label={t('common.name')} required error={save.fieldErrors.displayName}>{(p) => <input {...p} className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
        <Field label={t('common.name_en')}>{(p) => <input {...p} className="input" dir="ltr" value={form.displayNameEn} onChange={(e) => setForm({ ...form, displayNameEn: e.target.value })} />}</Field>
      </div>
      <Field label={t('team.specialty')}>{(p) => <input {...p} className="input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />}</Field>
      <Field label={t('team.bio')}>{(p) => <textarea {...p} className="input" maxLength={2000} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />}</Field>
      <div className="field">
        <label htmlFor="staff-photo">{t('team.photo')} <span className="muted small">({t('common.optional')})</span></label>
        <input
          id="staff-photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const r = await uploadImage(slug, f, 'staff', form.displayName);
              setForm({ ...form, photoAssetId: r.id });
              setPhotoUrl(r.url);
            } catch (er) {
              setErr(er as ApiError);
            }
          }}
        />
        {photoUrl && (
          <div className="row">
            <img src={photoUrl} alt={form.displayName} width={96} height={96} style={{ borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
            <button type="button" className="btn btn-sm" onClick={() => { setForm({ ...form, photoAssetId: null }); setPhotoUrl(null); }}>{t('common.delete')}</button>
          </div>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={form.publicVisible} onChange={(e) => setForm({ ...form, publicVisible: e.target.checked })} /> {t('team.public_visible')}</label>
      <fieldset style={{ marginTop: 12 }}>
        <legend>{t('team.branches')}</legend>
        <div className="chips">{refs.branches.map((b) => <button key={b.id} type="button" className="chip" aria-pressed={form.branchIds.includes(b.id)} onClick={() => toggle('branchIds', b.id)}>{b.name}</button>)}</div>
        {form.branchIds.length === 0 && <p className="small" style={{ color: 'var(--red)' }}>{t('team.branch_required')}</p>}
      </fieldset>
      <fieldset>
        <legend>{t('team.services_assigned')}</legend>
        {refs.services.length === 0 ? <p className="small muted">{t('ops.no_services_yet')}</p> : (
          <div className="chips">{refs.services.map((s) => <button key={s.id} type="button" className="chip" aria-pressed={form.serviceIds.includes(s.id)} onClick={() => toggle('serviceIds', s.id)}>{s.name}</button>)}</div>
        )}
      </fieldset>
      <Field label={t('team.allocation_weight')} hint={t('team.allocation_weight_hint')}>
        {(p) => <input {...p} className="input input-ltr" style={{ maxWidth: 120 }} inputMode="numeric" value={String(form.allocationWeight)} onChange={(e) => setForm({ ...form, allocationWeight: Math.min(1000, Number(e.target.value.replace(/\D/g, '') || 0)) })} />}
      </Field>
      {id && <p className="small muted">{t('team.schedule_tab_hint')}</p>}
    </Drawer>
  );
}
