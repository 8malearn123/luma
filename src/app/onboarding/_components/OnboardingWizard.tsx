'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useT } from '@/components/I18n';
import { Icon } from '@/components/Icon';
import { ErrorAlert, Field } from '@/components/ui/forms';
import { useToast } from '@/components/ui/Toast';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { PALETTES } from '@/lib/builder/defaults';
import { FONTS, type FontKey } from '@/lib/builder/schema';
import { formatDuration, formatMoney, parseMoneyToMinor } from '@/lib/format';
import { tapi, uploadImage, WEEKDAYS } from '@/components/catalog/client';

interface Session {
  currentStep: number;
  answers: Record<string, Record<string, unknown>>;
  completedSteps: number[];
  skippedSteps: number[];
  paletteSuggestions: { colors: string[]; palette: Record<string, string> } | null;
  draftGeneratedAt: string | null;
  version: number;
}

export interface WizardInitial {
  slug: string;
  tenant: { name: string; businessType: string; city: string; branchName: string };
  expertStaffId: string | null;
  session: Session;
  readiness: { items: { key: string; ok: boolean }[]; ready: boolean };
  profile: null | {
    logoAssetId: string | null; coverAssetId: string | null; logoUrl: string | null; coverUrl: string | null; wordmarkText: string | null; tagline: string | null; intro: string | null;
    contactPhone: string | null; whatsapp: string | null; contactEmail: string | null; address: string | null; socials: Record<string, string>;
    brandCharacter: string[]; brandDescription: string | null; excludedColors: string[]; targetAudience: string | null; storePriorities: string[];
  };
  hours: { weekday: number; start: string; end: string }[];
  services: { id: string; name: string; priceMinor: number; durationMin: number }[];
  policy: { allowOnSite: boolean; depositMode: 'none' | 'percent' | 'fixed'; depositValue: number; cancellationWindowHours: number };
}

const CHARS = ['luxurious', 'warm', 'minimal', 'bold', 'natural', 'playful', 'classic', 'modern'];
const SOCIALS = ['instagram', 'tiktok', 'snapchat', 'x', 'youtube', 'facebook'];
const PRIOS = ['booking', 'portfolio', 'products'];
const TYPES = ['salon', 'expert', 'spa', 'clinic', 'studio'];
const STEP_KEYS = ['onb.s1', 'onb.s2', 'onb.s3', 'onb.s4', 'onb.s5', 'onb.s6', 'onb.s7'];

export function OnboardingWizard({ initial }: { initial: WizardInitial }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const slug = initial.slug;
  const [session, setSession] = useState<Session>(initial.session);
  const [step, setStep] = useState(Math.min(Math.max(initial.session.currentStep, 1), 8));
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const versionRef = useRef(initial.session.version);
  const p = initial.profile;
  const a = session.answers;

  // ── per-step form state (initialized from saved answers / real data) ──
  const [s1, setS1] = useState({ ...initial.tenant, ...(a['1'] ?? {}) } as { name: string; businessType: string; city: string; branchName: string });
  const [s2, setS2] = useState({ mode: p?.logoAssetId ? 'logo' : 'wordmark', logoAssetId: p?.logoAssetId ?? '', logoUrl: p?.logoUrl ?? '', wordmark: p?.wordmarkText ?? initial.tenant.name });
  const [s3, setS3] = useState({ character: p?.brandCharacter ?? [], description: p?.brandDescription ?? '' });
  const a4 = (a['4'] ?? {}) as { primary?: string | null; useSuggested?: string | null; excluded?: string[]; fonts?: { heading?: FontKey; body?: FontKey }; acceptedLogoPalette?: unknown };
  const [s4, setS4] = useState({ primary: a4.primary ?? '', useSuggested: a4.useSuggested ?? '', excluded: a4.excluded ?? p?.excludedColors ?? [], newExcluded: '#00a651', fonts: a4.fonts ?? {} });
  const a5 = (a['5'] ?? {}) as { specialties?: string[]; audience?: string };
  const [s5, setS5] = useState({ specialties: (a5.specialties ?? []).join('، '), audience: a5.audience ?? p?.targetAudience ?? '' });
  const [services, setServices] = useState(initial.services);
  const [newSvc, setNewSvc] = useState({ name: '', price: '', duration: '60' });
  const [s6, setS6] = useState<string[]>(p?.storePriorities?.length ? p.storePriorities.filter((x) => PRIOS.includes(x)) : PRIOS);
  const hoursInit = WEEKDAYS.map((_, wd) => {
    const h = initial.hours.find((x) => x.weekday === wd);
    return { on: !!h, start: h?.start ?? '10:00', end: h?.end ?? '22:00' };
  });
  const [s7, setS7] = useState({
    coverAssetId: p?.coverAssetId ?? '', coverUrl: p?.coverUrl ?? '', intro: p?.intro ?? '', tagline: p?.tagline ?? '', phone: p?.contactPhone ?? '', whatsapp: p?.whatsapp ?? '',
    email: p?.contactEmail ?? '', address: p?.address ?? '', socials: p?.socials ?? {}, hours: initial.hours.length ? hoursInit : hoursInit.map((h, i) => ({ ...h, on: i <= 4 })),
    policy: initial.policy,
  });
  const [readiness, setReadiness] = useState(initial.readiness);
  const [draft, setDraft] = useState<{ version: number; builder: string } | null>(null);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const r = await apiFetch<{ session: Session }>(tapi(slug, '/onboarding'), { method: 'PATCH', body: { ...body, expectedVersion: versionRef.current } });
        versionRef.current = r.session.version;
        setSession(r.session);
        setSavedAt(new Date());
        return r.session;
      } catch (e) {
        setError(e as ApiError);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [slug],
  );

  const answersFor = (n: number): unknown => {
    switch (n) {
      case 1:
        return s1;
      case 2:
        return s2.mode === 'logo' && s2.logoAssetId ? { mode: 'logo', logoAssetId: s2.logoAssetId, wordmark: s2.wordmark || undefined } : { mode: 'wordmark', wordmark: s2.wordmark };
      case 3:
        return { character: s3.character, description: s3.description || undefined };
      case 4:
        return { primary: s4.primary || null, useSuggested: s4.useSuggested || null, excluded: s4.excluded, fonts: s4.fonts };
      case 5:
        return { specialties: s5.specialties.split(/[,،]/).map((x) => x.trim()).filter(Boolean), audience: s5.audience || undefined };
      case 6:
        return { priorities: s6 };
      case 7:
        return {
          coverAssetId: s7.coverAssetId || null, intro: s7.intro || undefined, tagline: s7.tagline || undefined, phone: s7.phone || undefined,
          whatsapp: s7.whatsapp || undefined, email: s7.email || '', address: s7.address || undefined,
          hours: s7.hours.flatMap((h, weekday) => (h.on ? [{ weekday, start: h.start, end: h.end }] : [])),
          socials: Object.fromEntries(Object.entries(s7.socials).filter(([, v]) => v?.trim())),
          policy: s7.policy,
        };
    }
    return {};
  };

  // autosave the current step (debounced) so a closed tab never loses work
  const dirty = useRef(false);
  const markDirty = () => (dirty.current = true);
  useEffect(() => {
    if (step < 1 || step > 7) return;
    const h = setInterval(() => {
      if (dirty.current && !busy) {
        dirty.current = false;
        void call({ step, answers: answersFor(step), goTo: step });
      }
    }, 4000);
    return () => clearInterval(h);
  });

  const go = async (to: number, opts: { skip?: boolean; save?: boolean } = {}) => {
    if (step <= 7 && (opts.save ?? true)) {
      const r = await call(opts.skip ? { step, skip: true, goTo: to } : { step, answers: answersFor(step), goTo: to });
      if (!r) return;
      dirty.current = false;
    }
    setStep(to);
    if (to === 8) {
      try {
        setReadiness(await apiFetch(tapi(slug, '/onboarding/readiness')));
      } catch {
        /* shown as stale checklist */
      }
    }
    window.scrollTo({ top: 0 });
  };

  const upload = async (file: File, purpose: 'logo' | 'cover') => {
    setBusy(true);
    setError(null);
    try {
      const r = await uploadImage(slug, file, purpose, purpose === 'logo' ? s2.wordmark || initial.tenant.name : initial.tenant.name);
      if (purpose === 'logo') setS2({ ...s2, mode: 'logo', logoAssetId: r.id, logoUrl: r.url });
      else setS7({ ...s7, coverAssetId: r.id, coverUrl: r.url });
      markDirty();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const decidePalette = async (accept: boolean) => {
    setBusy(true);
    try {
      const r = await apiFetch<{ session: Session }>(tapi(slug, '/onboarding/palette'), { method: 'POST', body: { accept, expectedVersion: versionRef.current } });
      versionRef.current = r.session.version;
      setSession(r.session);
      if (accept) setS4({ ...s4, primary: '', useSuggested: '' });
      toast(t(accept ? 'ops.palette_accepted' : 'ops.palette_dismissed'), 'ok');
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const addService = async () => {
    const price = parseMoneyToMinor(newSvc.price);
    const duration = Number(newSvc.duration);
    if (!newSvc.name.trim() || price === null || !(duration >= 5)) {
      setError(new ApiError('validation', 'ops.service_quick_invalid', 422));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ id: string }>(tapi(slug, '/services'), {
        method: 'POST',
        idempotencyKey: newIdempotencyKey(),
        body: { name: newSvc.name.trim(), priceMinor: price, durationMin: duration, staffIds: initial.expertStaffId ? [initial.expertStaffId] : [] },
      });
      setServices([...services, { id: r.id, name: newSvc.name.trim(), priceMinor: price, durationMin: duration }]);
      setNewSvc({ name: '', price: '', duration: '60' });
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (overwrite = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ draftVersion: number; builder: string }>(tapi(slug, '/onboarding/generate'), { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { overwrite } });
      setDraft({ version: r.draftVersion, builder: r.builder });
      toast(t('ops.draft_generated'), 'ok');
    } catch (e) {
      const err = e as ApiError;
      if (err.message === 'errors.draft_overwrite_confirm' && window.confirm(t('ops.draft_overwrite_confirm'))) {
        setBusy(false);
        return generate(true);
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const status = (n: number) => (session.completedSteps.includes(n) ? 'done' : session.skippedSteps.includes(n) ? 'skipped' : '');
  const optional = step >= 2 && step <= 7;
  const chip = (pressed: boolean, onClick: () => void, label: string) => (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="card">
      <div className="row between">
        <h1 style={{ margin: 0 }}>{t('onb.title')}</h1>
        <span className="small muted" role="status" aria-live="polite">
          {busy ? t('common.saving') : savedAt ? `${t('common.saved')} · ${savedAt.toLocaleTimeString(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })}` : t('onb.saved_resume')}
        </span>
      </div>
      <nav className="steps" aria-label={t('ops.onb_steps')} style={{ marginTop: 12 }}>
        {STEP_KEYS.map((k, i) => (
          <button
            key={k}
            type="button"
            className={`chip ${status(i + 1) === 'done' ? 'done' : ''}`}
            aria-current={step === i + 1 ? 'step' : undefined}
            onClick={() => go(i + 1, { save: step <= 7 && dirty.current })}
            style={step === i + 1 ? { borderColor: 'var(--gold-deep)', color: 'var(--gold-pale)' } : undefined}
          >
            {status(i + 1) === 'done' && <Icon name="check" size={13} />} {i + 1} · {t(k)}
            {status(i + 1) === 'skipped' && <span className="muted"> ({t('common.skip')})</span>}
          </button>
        ))}
        <button type="button" className="chip" aria-current={step === 8 ? 'step' : undefined} onClick={() => go(8, { save: false })}>
          {t('onb.readiness')}
        </button>
      </nav>
      <div className="progress" aria-hidden="true" style={{ margin: '4px 0 18px' }}>
        <span style={{ width: `${(Math.min(step, 8) / 8) * 100}%` }} />
      </div>
      <ErrorAlert error={error} />
      {error?.code === 'version_conflict' && (
        <div className="alert warn">
          {t('ops.onb_conflict')}{' '}
          <button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go(step + 1);
        }}
        onChange={markDirty}
        noValidate
      >
        {step <= 7 && <h2>{t('onb.step', { n: step })} — {t(STEP_KEYS[step - 1])}</h2>}

        {step === 1 && (
          <>
            <Field label={t('onb.business_name')} required>
              {(f) => <input {...f} className="input" value={s1.name} onChange={(e) => setS1({ ...s1, name: e.target.value })} />}
            </Field>
            <Field label={t('onb.business_type')} required>
              {(f) => (
                <select {...f} className="input" value={s1.businessType} onChange={(e) => setS1({ ...s1, businessType: e.target.value })}>
                  {TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`onb.type.${x}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label={t('onb.city')} required>
                {(f) => <input {...f} className="input" value={s1.city} onChange={(e) => setS1({ ...s1, city: e.target.value })} />}
              </Field>
              <Field label={t('onb.branch_name')} required>
                {(f) => <input {...f} className="input" value={s1.branchName} onChange={(e) => setS1({ ...s1, branchName: e.target.value })} />}
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="muted">{t('ops.onb_s2_help')}</p>
            <div className="chips" role="radiogroup" aria-label={t('onb.s2')}>
              {chip(s2.mode === 'logo', () => setS2({ ...s2, mode: 'logo' }), t('onb.logo_upload'))}
              {chip(s2.mode === 'wordmark', () => setS2({ ...s2, mode: 'wordmark' }), t('onb.no_logo'))}
            </div>
            {s2.mode === 'logo' && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="logo-file">{t('onb.logo_upload')}</label>
                <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'logo')} />
                <span className="hint">{t('ops.upload_hint')}</span>
                {s2.logoUrl && <img src={s2.logoUrl} alt={s2.wordmark} style={{ maxWidth: 160, borderRadius: 12, marginTop: 8, background: '#fff' }} width={160} height={160} loading="lazy" />}
              </div>
            )}
            <Field label={t('onb.wordmark')} hint={t('ops.wordmark_hint')} required={s2.mode === 'wordmark'}>
              {(f) => <input {...f} className="input" value={s2.wordmark} maxLength={60} onChange={(e) => setS2({ ...s2, wordmark: e.target.value })} />}
            </Field>
            {s2.mode === 'wordmark' && (
              <div className="card" style={{ textAlign: 'center' }} aria-label={t('ops.wordmark_preview')}>
                <span className="display" style={{ fontSize: 30, letterSpacing: '0.18em' }}>{s2.wordmark || initial.tenant.name}</span>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend>{t('onb.character')}</legend>
              <div className="chips">
                {CHARS.map((c) => chip(s3.character.includes(c), () => {
                  markDirty();
                  setS3({ ...s3, character: s3.character.includes(c) ? s3.character.filter((x) => x !== c) : [...s3.character, c].slice(0, 4) });
                }, t(`onb.char.${c}`)))}
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>{t('ops.character_max')}</p>
            </fieldset>
            <Field label={t('onb.brand_description')}>
              {(f) => <textarea {...f} className="input" maxLength={1000} value={s3.description} onChange={(e) => setS3({ ...s3, description: e.target.value })} />}
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            {session.paletteSuggestions && (
              <div className="card" style={{ marginBottom: 14 }}>
                <h3>{t('onb.palette_from_logo')}</h3>
                <div className="row">
                  {session.paletteSuggestions.colors.map((c) => (
                    <span key={c} className="swatch" style={{ background: c }} title={c} />
                  ))}
                </div>
                <p className="small muted">{(a['4'] as { acceptedLogoPalette?: unknown } | undefined)?.acceptedLogoPalette ? t('ops.palette_in_use') : t('ops.palette_not_applied')}</p>
                <div className="row">
                  <button type="button" className="btn btn-gold btn-sm" disabled={busy} onClick={() => decidePalette(true)}>
                    {t('onb.accept_palette')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => decidePalette(false)}>
                    {t('ops.dismiss')}
                  </button>
                </div>
              </div>
            )}
            <Field label={t('onb.colors_existing')} hint={t('ops.primary_hint')}>
              {(f) => (
                <div className="row">
                  <input {...f} type="color" value={s4.primary || '#9c8047'} onChange={(e) => setS4({ ...s4, primary: e.target.value, useSuggested: '' })} aria-label={t('onb.colors_existing')} />
                  <input className="input input-ltr mono" style={{ maxWidth: 140 }} value={s4.primary} placeholder="#RRGGBB" onChange={(e) => setS4({ ...s4, primary: e.target.value, useSuggested: '' })} />
                  {s4.primary && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setS4({ ...s4, primary: '' })}>
                      {t('common.none')}
                    </button>
                  )}
                </div>
              )}
            </Field>
            <fieldset>
              <legend>{t('onb.colors_suggested')}</legend>
              <div className="grid cols-3" style={{ gap: 8 }}>
                {PALETTES.map((pal) => (
                  <button
                    key={pal.key}
                    type="button"
                    className="chip"
                    aria-pressed={s4.useSuggested === pal.key}
                    onClick={() => {
                      markDirty();
                      setS4({ ...s4, useSuggested: s4.useSuggested === pal.key ? '' : pal.key, primary: '' });
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12 }}
                  >
                    <span className="swatch" style={{ background: pal.colors.background, width: 18, height: 18 }} />
                    <span className="swatch" style={{ background: pal.colors.primary, width: 18, height: 18 }} />
                    <span className="swatch" style={{ background: pal.colors.accent, width: 18, height: 18 }} />
                    {locale === 'ar' ? pal.nameAr : pal.nameEn}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t('onb.colors_excluded')}</legend>
              <div className="row">
                {s4.excluded.map((c) => (
                  <button key={c} type="button" className="chip" onClick={() => setS4({ ...s4, excluded: s4.excluded.filter((x) => x !== c) })} aria-label={`${t('common.delete')} ${c}`}>
                    <span className="swatch" style={{ background: c, width: 16, height: 16 }} /> {c} <Icon name="x" size={12} />
                  </button>
                ))}
                <input type="color" value={s4.newExcluded} onChange={(e) => setS4({ ...s4, newExcluded: e.target.value })} aria-label={t('onb.colors_excluded')} />
                <button type="button" className="btn btn-sm" onClick={() => !s4.excluded.includes(s4.newExcluded) && s4.excluded.length < 8 && setS4({ ...s4, excluded: [...s4.excluded, s4.newExcluded] })}>
                  {t('common.add')}
                </button>
              </div>
            </fieldset>
            <div className="grid cols-2" style={{ gap: 12 }}>
              {(['heading', 'body'] as const).map((k) => (
                <Field key={k} label={`${t('onb.fonts')} · ${t(`ops.font_${k}`)}`}>
                  {(f) => (
                    <select {...f} className="input" value={s4.fonts[k] ?? ''} onChange={(e) => setS4({ ...s4, fonts: { ...s4.fonts, [k]: (e.target.value || undefined) as FontKey } })}>
                      <option value="">{t('ops.font_auto')}</option>
                      {(Object.keys(FONTS) as FontKey[]).map((fk) => (
                        <option key={fk} value={fk}>
                          {FONTS[fk].label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="alert info">{t('onb.services_hint')}</div>
            <h3>{t('onb.services_list')}</h3>
            {services.length === 0 ? (
              <p className="muted small">{t('ops.no_services_yet')}</p>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
                {services.map((s) => (
                  <li key={s.id} className="row between card" style={{ padding: '10px 14px' }}>
                    <span>{s.name}</span>
                    <span className="small muted">
                      {formatDuration(s.durationMin, locale)} · {formatMoney(s.priceMinor, 'SAR', locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <fieldset>
              <legend>{t('ops.add_service_quick')}</legend>
              <div className="grid cols-3" style={{ gap: 10 }}>
                <Field label={t('common.name')} required>
                  {(f) => <input {...f} className="input" value={newSvc.name} onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })} />}
                </Field>
                <Field label={`${t('common.price')} (${t('common.sar')})`} required>
                  {(f) => <input {...f} className="input input-ltr" inputMode="decimal" value={newSvc.price} onChange={(e) => setNewSvc({ ...newSvc, price: e.target.value })} />}
                </Field>
                <Field label={`${t('common.duration')} (${t('common.minutes')})`} required>
                  {(f) => <input {...f} className="input input-ltr" inputMode="numeric" value={newSvc.duration} onChange={(e) => setNewSvc({ ...newSvc, duration: e.target.value.replace(/\D/g, '') })} />}
                </Field>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={addService}>
                <Icon name="plus" size={16} /> {t('ops.add_service')}
              </button>
              <p className="small muted" style={{ marginTop: 8 }}>
                {t('ops.services_full_editor')} <Link href={`/app/${slug}/services`}>{t('nav.services')}</Link>
              </p>
            </fieldset>
            <Field label={t('onb.specialties')} hint={t('ops.comma_separated')}>
              {(f) => <input {...f} className="input" value={s5.specialties} onChange={(e) => setS5({ ...s5, specialties: e.target.value })} />}
            </Field>
            <Field label={t('onb.audience')}>
              {(f) => <textarea {...f} className="input" maxLength={500} value={s5.audience} onChange={(e) => setS5({ ...s5, audience: e.target.value })} />}
            </Field>
          </>
        )}

        {step === 6 && (
          <>
            <p className="muted">{t('ops.priorities_help')}</p>
            <ol className="stack" style={{ padding: 0, listStyle: 'none' }}>
              {s6.map((k, i) => (
                <li key={k} className="row between card" style={{ padding: '10px 14px' }}>
                  <span>
                    <strong>{i + 1}.</strong> {t(`onb.prio.${k}`)}
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn icon-btn" disabled={i === 0} aria-label={`${t('ops.move_up')} ${t(`onb.prio.${k}`)}`} onClick={() => { markDirty(); const n = [...s6]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setS6(n); }}>
                      <Icon name="arrowUp" size={16} />
                    </button>
                    <button type="button" className="btn icon-btn" disabled={i === s6.length - 1} aria-label={`${t('ops.move_down')} ${t(`onb.prio.${k}`)}`} onClick={() => { markDirty(); const n = [...s6]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setS6(n); }}>
                      <Icon name="arrowDown" size={16} />
                    </button>
                    {s6.length > 1 && k !== 'booking' && (
                      <button type="button" className="btn icon-btn" aria-label={`${t('ops.remove')} ${t(`onb.prio.${k}`)}`} onClick={() => { markDirty(); setS6(s6.filter((x) => x !== k)); }}>
                        <Icon name="x" size={16} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {PRIOS.filter((x) => !s6.includes(x)).map((k) => (
              <button key={k} type="button" className="btn btn-sm" onClick={() => { markDirty(); setS6([...s6, k]); }}>
                <Icon name="plus" size={14} /> {t(`onb.prio.${k}`)}
              </button>
            ))}
            <p className="small muted">{t('ops.booking_always')}</p>
          </>
        )}

        {step === 7 && (
          <>
            <div className="field">
              <label htmlFor="cover-file">{t('onb.cover')}</label>
              <input id="cover-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'cover')} />
              <span className="hint">{t('ops.upload_hint')}</span>
              {s7.coverUrl && <img src={s7.coverUrl} alt={t('onb.cover')} width={480} height={200} style={{ maxWidth: '100%', height: 'auto', borderRadius: 12, marginTop: 8 }} loading="lazy" />}
            </div>
            <Field label={t('onb.tagline')}>
              {(f) => <input {...f} className="input" maxLength={160} value={s7.tagline} onChange={(e) => setS7({ ...s7, tagline: e.target.value })} />}
            </Field>
            <Field label={t('onb.intro')}>
              {(f) => <textarea {...f} className="input" maxLength={4000} value={s7.intro} onChange={(e) => setS7({ ...s7, intro: e.target.value })} />}
            </Field>
            <div className="grid cols-3" style={{ gap: 10 }}>
              {(['phone', 'whatsapp', 'email'] as const).map((k) => (
                <Field key={k} label={t(`onb.${k}`)}>
                  {(f) => <input {...f} className="input input-ltr" inputMode={k === 'email' ? 'email' : 'tel'} value={s7[k]} onChange={(e) => setS7({ ...s7, [k]: e.target.value })} />}
                </Field>
              ))}
            </div>
            <Field label={t('onb.address')}>
              {(f) => <input {...f} className="input" value={s7.address} onChange={(e) => setS7({ ...s7, address: e.target.value })} />}
            </Field>
            <fieldset>
              <legend>{t('onb.hours')}</legend>
              {s7.hours.map((h, wd) => (
                <div key={wd} className="row" style={{ marginBottom: 6 }}>
                  <label className="check" style={{ minWidth: 110 }}>
                    <input type="checkbox" checked={h.on} onChange={(e) => setS7({ ...s7, hours: s7.hours.map((x, i) => (i === wd ? { ...x, on: e.target.checked } : x)) })} />
                    {WEEKDAYS[wd][locale === 'ar' ? 0 : 1]}
                  </label>
                  <input type="time" className="input" style={{ maxWidth: 130 }} disabled={!h.on} value={h.start} aria-label={`${WEEKDAYS[wd][1]} ${t('common.from')}`} onChange={(e) => setS7({ ...s7, hours: s7.hours.map((x, i) => (i === wd ? { ...x, start: e.target.value } : x)) })} />
                  <span className="muted">–</span>
                  <input type="time" className="input" style={{ maxWidth: 130 }} disabled={!h.on} value={h.end} aria-label={`${WEEKDAYS[wd][1]} ${t('common.to')}`} onChange={(e) => setS7({ ...s7, hours: s7.hours.map((x, i) => (i === wd ? { ...x, end: e.target.value } : x)) })} />
                </div>
              ))}
              <p className="small muted">{t('ops.hours_tz')}</p>
            </fieldset>
            <fieldset>
              <legend>{t('onb.socials')}</legend>
              <div className="grid cols-2" style={{ gap: 10 }}>
                {SOCIALS.map((k) => (
                  <Field key={k} label={t(`ops.social.${k}`)} hint={t('ops.handle_hint')}>
                    {(f) => <input {...f} className="input input-ltr" value={s7.socials[k] ?? ''} onChange={(e) => setS7({ ...s7, socials: { ...s7.socials, [k]: e.target.value } })} />}
                  </Field>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t('onb.ready.policy')}</legend>
              <label className="check">
                <input type="checkbox" checked={s7.policy.allowOnSite} onChange={(e) => setS7({ ...s7, policy: { ...s7.policy, allowOnSite: e.target.checked } })} />
                {t('ops.policy_on_site')}
              </label>
              <div className="grid cols-3" style={{ gap: 10, marginTop: 10 }}>
                <Field label={t('ops.policy_deposit')}>
                  {(f) => (
                    <select {...f} className="input" value={s7.policy.depositMode} onChange={(e) => setS7({ ...s7, policy: { ...s7.policy, depositMode: e.target.value as 'none' } })}>
                      <option value="none">{t('ops.deposit_none')}</option>
                      <option value="percent">{t('ops.deposit_percent')}</option>
                      <option value="fixed">{t('ops.deposit_fixed')}</option>
                    </select>
                  )}
                </Field>
                {s7.policy.depositMode !== 'none' && (
                  <Field label={s7.policy.depositMode === 'percent' ? '%' : t('common.sar')}>
                    {(f) => (
                      <input
                        {...f}
                        className="input input-ltr"
                        inputMode="decimal"
                        value={s7.policy.depositMode === 'percent' ? String(s7.policy.depositValue / 100) : String(s7.policy.depositValue / 100)}
                        onChange={(e) => {
                          const v = parseMoneyToMinor(e.target.value) ?? 0; // percent stored as basis points (×100), SAR as halalas (×100)
                          setS7({ ...s7, policy: { ...s7.policy, depositValue: v } });
                        }}
                      />
                    )}
                  </Field>
                )}
                <Field label={t('ops.policy_cancel_window')}>
                  {(f) => <input {...f} className="input input-ltr" inputMode="numeric" value={String(s7.policy.cancellationWindowHours)} onChange={(e) => setS7({ ...s7, policy: { ...s7.policy, cancellationWindowHours: Math.min(336, Number(e.target.value.replace(/\D/g, '') || 0)) } })} />}
                </Field>
              </div>
              <p className="small muted">{t('ops.policy_methods_note')}</p>
            </fieldset>
          </>
        )}

        {step === 8 && (
          <>
            <h2>{t('onb.readiness')}</h2>
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {readiness.items.map((i) => (
                <li key={i.key} className="row" style={{ gap: 8 }}>
                  <span className={`badge ${i.ok ? 'green' : 'amber'}`}>
                    <Icon name={i.ok ? 'check' : 'alert'} size={13} /> {i.ok ? t('ops.ready_ok') : t('ops.ready_missing')}
                  </span>
                  <span>{t(`onb.ready.${i.key}`)}</span>
                  {!i.ok && (
                    <Link className="small" href={i.key === 'service' ? `/app/${slug}/services` : i.key === 'staff' || i.key === 'schedule' ? `/app/${slug}/team` : `/onboarding/${slug}`} onClick={() => i.key === 'contact' || i.key === 'policy' ? setStep(7) : undefined}>
                      {t('ops.fix')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="small muted">{t('ops.readiness_note')}</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-gold" disabled={busy} onClick={() => generate(false)}>
                <Icon name="layers" size={16} /> {t('onb.generate')}
              </button>
              {(draft || session.draftGeneratedAt) && (
                <Link className="btn btn-ghost" href={draft?.builder ?? `/app/${slug}/builder`}>
                  {t('onb.done')}
                </Link>
              )}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>{t('ops.generate_note')}</p>
          </>
        )}

        {step <= 7 && (
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-quiet" disabled={busy || step === 1} onClick={() => go(step - 1)}>
              {t('common.back')}
            </button>
            <div className="row">
              {optional && (
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => go(step + 1, { skip: true })}>
                  {t('common.skip')}
                </button>
              )}
              <button type="submit" className="btn btn-gold" disabled={busy}>
                {busy ? t('common.saving') : t('common.next')}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
