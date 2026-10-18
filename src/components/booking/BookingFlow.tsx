'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime, formatDuration, formatMoney, localDate, tzLabel } from '@/lib/format';
import { addDays } from '@/lib/tz';
import { useLocale, useT } from '../I18n';
import './booking.css';

export interface CatalogService {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  priceMinor: number;
  priceIsFrom: boolean;
  durationMin: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryNameEn: string | null;
  branchId: string | null;
  variants: { id: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[];
  addons: { id: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[];
}
export interface CatalogStaff {
  id: string;
  displayName: string;
  displayNameEn: string | null;
  specialty: string | null;
  serviceIds: string[];
  branchIds: string[];
}
export interface Catalog {
  tenant: { slug: string; name: string; timezone: string; currency: string };
  services: CatalogService[];
  staff: CatalogStaff[];
  branches: { id: string; name: string; city: string | null; isPrimary: boolean }[];
  policy: { policyText: string | null; policyTextEn: string | null; holdMinutes: number } | null;
}

interface Sel {
  serviceId: string;
  variantId: string | null;
  addonIds: string[];
  staffId: string | null;
}
interface SlotItem {
  key: number;
  serviceId: string;
  staffId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  priceMinor: number;
  durationMin: number;
}
interface Slot {
  startsAt: string;
  endsAt: string;
  totalGapMin: number;
  totalDurationMin: number;
  totalPriceMinor: number;
  items: SlotItem[];
}
interface Avail {
  timezone: string;
  days: { date: string; slots: Slot[] }[];
  reason: 'no_qualified_staff' | 'no_slots' | null;
}
interface Quote {
  totalMinor: number;
  options: { kind: 'full' | 'deposit' | 'on_site' | 'manual_approval'; dueNowMinor: number }[];
  blocked: boolean;
  fallback: string | null;
  explanationKey: string;
  policy: { policyText: string | null; policyTextEn: string | null; holdMinutes: number; cancellationWindowHours: number } | null;
}
interface Hold {
  bookingId: string;
  number: string;
  status: string;
  holdExpiresAt: string;
  totalMinor: number;
  dueNowMinor: number;
  termsKind: string;
}

const STORE_KEY = (slug: string) => `luma_booking:${slug}`;
const DAYS = 7;

export function BookingFlow({ catalog, signedIn, preselect }: { catalog: Catalog; signedIn: boolean; preselect: { serviceId?: string; staffId?: string; resume?: boolean } }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const tz = catalog.tenant.timezone;
  const base = `/api/v1/s/${catalog.tenant.slug}`;
  const nm = (o: { name: string; nameEn?: string | null }) => (locale === 'en' && o.nameEn ? o.nameEn : o.name);
  const money = (m: number) => formatMoney(m, catalog.tenant.currency, locale);

  const [step, setStep] = useState(1);
  const [branchId, setBranchId] = useState(catalog.branches[0]?.id ?? '');
  const [sel, setSel] = useState<Sel[]>(() => {
    const s = preselect.serviceId && catalog.services.find((x) => x.id === preselect.serviceId);
    return s ? [{ serviceId: s.id, variantId: null, addonIds: [], staffId: preselect.staffId ?? null }] : [];
  });
  const today = localDate(new Date(), tz);
  const [from, setFrom] = useState(today);
  const [day, setDay] = useState(today);
  const [avail, setAvail] = useState<Avail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [termsKind, setTermsKind] = useState<Quote['options'][number]['kind'] | null>(null);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState('');
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});
  const key = (k: string) => (keys.current[k] ??= newIdempotencyKey());

  const staffFilter = preselect.staffId ? catalog.staff.find((s) => s.id === preselect.staffId) : null;
  const services = useMemo(
    () => catalog.services.filter((s) => (!s.branchId || s.branchId === branchId) && (!staffFilter || staffFilter.serviceIds.includes(s.id))),
    [catalog.services, branchId, staffFilter],
  );
  const svc = (id: string) => catalog.services.find((s) => s.id === id)!;
  const qualified = (serviceId: string) => catalog.staff.filter((s) => s.serviceIds.includes(serviceId) && s.branchIds.includes(branchId));

  // ── restore after sign-in ──
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !preselect.resume) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(STORE_KEY(catalog.tenant.slug));
      if (!raw) return;
      const s = JSON.parse(raw) as { branchId: string; sel: Sel[]; day: string; from: string; slot: Slot; note: string };
      setBranchId(s.branchId);
      setSel(s.sel);
      setFrom(s.from);
      setDay(s.day);
      setNote(s.note ?? '');
      setNotice(t('booking.selection_restored'));
      // re-validate: fetch the same day and look for the same slot
      void (async () => {
        const r = await fetchAvail(s.branchId, s.sel, s.from);
        const again = r?.days.find((d) => d.date === s.day)?.slots.find((x) => x.startsAt === s.slot.startsAt && x.items.every((it, i) => it.staffId === s.slot.items[i]?.staffId));
        if (!again) {
          setNotice(t('booking.slot_gone'));
          setStep(3);
          return;
        }
        if (again.totalPriceMinor !== s.slot.totalPriceMinor) setNotice(t('booking.price_changed', { old: money(s.slot.totalPriceMinor), new: money(again.totalPriceMinor) }));
        setSlot(again);
        setStep(4);
      })();
    } catch {
      /* ignore broken storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAvail = useCallback(
    async (b: string, items: Sel[], start: string): Promise<Avail | null> => {
      setLoading(true);
      setError(null);
      try {
        const r = await apiFetch<Avail>(`${base}/availability`, {
          method: 'POST',
          body: { branchId: b, from: start, days: DAYS, items: items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId, addonIds: i.addonIds, staffId: i.staffId })) },
        });
        setAvail(r);
        return r;
      } catch (e) {
        setError(e as ApiError);
        setAvail(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [base],
  );

  useEffect(() => {
    if (step === 3 && sel.length) void fetchAvail(branchId, sel, from);
  }, [step, from, branchId, sel, fetchAvail]);

  // ── review quote (server price + allowed terms) ──
  useEffect(() => {
    if (step !== 4 || !slot || !signedIn || hold) return;
    setQuote(null);
    setTermsKind(null);
    apiFetch<Quote>(`${base}/booking-quote`, { method: 'POST', body: { branchId, items: chosenItems(slot) } })
      .then((q) => {
        setQuote(q);
        setTermsKind(q.options[0]?.kind ?? null);
        if (q.totalMinor !== slot.totalPriceMinor) setNotice(t('booking.price_changed', { old: money(slot.totalPriceMinor), new: money(q.totalMinor) }));
      })
      .catch((e: ApiError) => {
        setError(e);
        if (e.code === 'slot_unavailable') {
          setNotice(t('booking.slot_gone'));
          setSlot(null);
          setStep(3);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, slot, signedIn, hold, base, branchId]);

  const chosenItems = (s: Slot) =>
    s.items.map((it) => {
      const sl = sel[it.key];
      return { serviceId: it.serviceId, variantId: sl?.variantId ?? null, addonIds: sl?.addonIds ?? [], staffId: it.staffId, startsAt: it.startsAt };
    });

  function toggleService(id: string) {
    setSel((cur) => {
      if (cur.some((c) => c.serviceId === id)) return cur.filter((c) => c.serviceId !== id);
      if (cur.length >= 5) {
        setNotice(t('booking.max_services'));
        return cur;
      }
      return [...cur, { serviceId: id, variantId: null, addonIds: [], staffId: preselect.staffId && qualified(id).some((q) => q.id === preselect.staffId) ? preselect.staffId : null }];
    });
    setSlot(null);
  }
  const update = (i: number, p: Partial<Sel>) => {
    setSel((cur) => cur.map((c, j) => (j === i ? { ...c, ...p } : c)));
    setSlot(null);
  };

  function goReview() {
    if (!slot) return;
    if (!signedIn) {
      try {
        sessionStorage.setItem(STORE_KEY(catalog.tenant.slug), JSON.stringify({ branchId, sel, day, from, slot, note }));
      } catch {
        /* storage unavailable: user will re-select */
      }
      router.push(`/auth/login?next=${encodeURIComponent(`/s/${catalog.tenant.slug}/booking?resume=1`)}`);
      return;
    }
    setStep(4);
  }

  async function placeHold() {
    if (!slot || !termsKind || busy) return;
    setBusy(true);
    setError(null);
    try {
      const h = await apiFetch<Hold>(`${base}/holds`, {
        method: 'POST',
        body: { branchId, items: chosenItems(slot), termsKind, customerNote: note || undefined },
        idempotencyKey: key(`hold:${slot.startsAt}:${termsKind}`),
      });
      setHold(h);
      try {
        sessionStorage.removeItem(STORE_KEY(catalog.tenant.slug));
      } catch {
        /* ignore */
      }
    } catch (e) {
      const err = e as ApiError;
      setError(err);
      if (err.code === 'slot_unavailable') {
        setNotice(t('booking.slot_gone'));
        setSlot(null);
        setStep(3);
      }
    } finally {
      setBusy(false);
    }
  }

  async function payOrConfirm() {
    if (!hold || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (hold.dueNowMinor > 0) {
        const p = await apiFetch<{ checkoutUrl: string | null; paymentId: string }>(`${base}/holds/${hold.bookingId}/pay`, { method: 'POST', body: {}, idempotencyKey: key(`pay:${hold.bookingId}`) });
        if (p.checkoutUrl) window.location.href = p.checkoutUrl;
      } else if (hold.termsKind === 'manual_approval') {
        router.push(`/s/${catalog.tenant.slug}/booking/done/${hold.bookingId}`);
      } else {
        await apiFetch(`${base}/holds/${hold.bookingId}/confirm`, { method: 'POST', body: {}, idempotencyKey: key(`confirm:${hold.bookingId}`) });
        router.push(`/s/${catalog.tenant.slug}/booking/done/${hold.bookingId}`);
      }
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  async function releaseHold() {
    if (!hold) return;
    setBusy(true);
    try {
      await apiFetch(`${base}/holds/${hold.bookingId}`, { method: 'DELETE', body: {} });
    } catch {
      /* already expired */
    }
    setHold(null);
    setBusy(false);
    setStep(3);
  }

  const dayData = avail?.days.find((d) => d.date === day);
  const steps = ['booking.step_services', 'booking.step_staff', 'booking.step_time', 'booking.step_review'];

  return (
    <div className="sf-container sf-section">
      <h1 className="sf-h1">{t('booking.title')}</h1>
      <ol className="sf-steps" aria-label={t('booking.title')}>
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined} data-done={step > i + 1 || undefined}>
            {step > i + 1 && !hold ? (
              <button type="button" className="sf-link" onClick={() => setStep(i + 1)}>
                {t(s)}
              </button>
            ) : (
              t(s)
            )}
          </li>
        ))}
      </ol>
      {notice && (
        <div className="sf-alert" role="status">
          {notice}
        </div>
      )}
      {error && error.code !== 'slot_unavailable' && (
        <div className="sf-alert" role="alert" data-tone="error">
          {t(error.message)}
        </div>
      )}

      {step === 1 && (
        <section aria-labelledby="bk-s1">
          <h2 id="bk-s1" className="sf-h2">
            {t('booking.choose_services')}
          </h2>
          {catalog.branches.length > 1 && (
            <div className="sf-field">
              <label htmlFor="bk-branch">{t('booking.branch')}</label>
              <select id="bk-branch" className="sf-input" value={branchId} onChange={(e) => { setBranchId(e.target.value); setSel([]); }}>
                {catalog.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.city ? ` — ${b.city}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {services.length === 0 && <p className="sf-muted">{t('booking.no_services')}</p>}
          <ul className="sf-list" role="list">
            {services.map((s) => {
              const i = sel.findIndex((x) => x.serviceId === s.id);
              const on = i >= 0;
              return (
                <li key={s.id} className="sf-card" data-selected={on || undefined}>
                  <div className="sf-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{nm(s)}</div>
                      {s.categoryName && <div className="sf-muted">{locale === 'en' && s.categoryNameEn ? s.categoryNameEn : s.categoryName}</div>}
                      <div className="sf-muted">
                        {s.priceIsFrom || s.variants.length ? `${t('booking.from_price')} ` : ''}
                        {money(s.priceMinor)} · {formatDuration(s.durationMin, locale)}
                      </div>
                    </div>
                    <button type="button" className={on ? 'sf-btn-secondary' : 'sf-btn'} aria-pressed={on} onClick={() => toggleService(s.id)}>
                      {on ? t('booking.remove') : t('booking.add')}
                    </button>
                  </div>
                  {on && s.variants.length > 0 && (
                    <div className="sf-field">
                      <label htmlFor={`v-${s.id}`}>{t('booking.variant')}</label>
                      <select id={`v-${s.id}`} className="sf-input" value={sel[i].variantId ?? ''} onChange={(e) => update(i, { variantId: e.target.value || null })}>
                        <option value="">{nm(s)} — {money(s.priceMinor)}</option>
                        {s.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {nm(v)} — {money(v.priceMinor)} · {formatDuration(v.durationMin, locale)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {on && s.addons.length > 0 && (
                    <fieldset className="sf-field">
                      <legend>{t('booking.addons')}</legend>
                      {s.addons.map((a) => (
                        <label key={a.id} className="sf-check">
                          <input
                            type="checkbox"
                            checked={sel[i].addonIds.includes(a.id)}
                            onChange={(e) => update(i, { addonIds: e.target.checked ? [...sel[i].addonIds, a.id] : sel[i].addonIds.filter((x) => x !== a.id) })}
                          />{' '}
                          {nm(a)} (+{money(a.priceMinor)}
                          {a.durationMin ? `, +${formatDuration(a.durationMin, locale)}` : ''})
                        </label>
                      ))}
                    </fieldset>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="sf-actions">
            <button type="button" className="sf-btn" disabled={!sel.length} onClick={() => setStep(2)}>
              {t('booking.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="bk-s2">
          <h2 id="bk-s2" className="sf-h2">
            {t('booking.step_staff')}
          </h2>
          <p className="sf-muted">{t('booking.any_staff_hint')}</p>
          {sel.map((it, i) => {
            const q = qualified(it.serviceId);
            return (
              <div key={it.serviceId} className="sf-field">
                <label htmlFor={`st-${i}`}>{t('booking.staff_for', { service: nm(svc(it.serviceId)) })}</label>
                {q.length === 0 ? (
                  <p className="sf-muted">{t('booking.no_qualified_staff')}</p>
                ) : (
                  <select id={`st-${i}`} className="sf-input" value={it.staffId ?? ''} onChange={(e) => update(i, { staffId: e.target.value || null })}>
                    <option value="">{t('booking.any_staff')}</option>
                    {q.map((s) => (
                      <option key={s.id} value={s.id}>
                        {locale === 'en' && s.displayNameEn ? s.displayNameEn : s.displayName}
                        {s.specialty ? ` — ${s.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
          <div className="sf-actions">
            <button type="button" className="sf-btn-secondary" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button type="button" className="sf-btn" onClick={() => setStep(3)}>
              {t('booking.continue')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="bk-s3" aria-busy={loading}>
          <h2 id="bk-s3" className="sf-h2">
            {t('booking.step_time')}
          </h2>
          <p className="sf-muted">{t('booking.times_in_tz', { tz: tzLabel(tz, locale) })}</p>
          <div className="sf-row" role="group" aria-label={t('common.date')}>
            <button type="button" className="sf-btn-secondary" disabled={from <= today} onClick={() => { const f = addDays(from, -DAYS); setFrom(f < today ? today : f); setDay(f < today ? today : f); }}>
              {t('booking.prev_days')}
            </button>
            <div className="sf-days">
              {Array.from({ length: DAYS }, (_, i) => addDays(from, i)).map((d) => {
                const n = avail?.days.find((x) => x.date === d)?.slots.length ?? 0;
                return (
                  <button key={d} type="button" className="sf-slot" aria-pressed={d === day} onClick={() => { setDay(d); setSlot(null); }} disabled={!!avail && n === 0}>
                    {formatDateTime(`${d}T12:00:00Z`, { tz: 'UTC', locale, dateOnly: true, dateStyle: 'medium' })}
                  </button>
                );
              })}
            </div>
            <button type="button" className="sf-btn-secondary" onClick={() => { const f = addDays(from, DAYS); setFrom(f); setDay(f); }}>
              {t('booking.next_days')}
            </button>
          </div>
          {loading && <p className="sf-muted">{t('booking.loading_slots')}</p>}
          {!loading && avail?.reason === 'no_qualified_staff' && <div className="sf-alert">{t('booking.no_qualified_staff')}</div>}
          {!loading && avail?.reason === 'no_slots' && (
            <div className="sf-alert">
              <p>{t('booking.no_slots_range')}</p>
              <p className="sf-muted">{t('booking.no_slots_hint')}</p>
            </div>
          )}
          {!loading && avail && !avail.reason && dayData && dayData.slots.length === 0 && (
            <div className="sf-alert">
              <p>{t('booking.no_slots_day')}</p>
              <p className="sf-muted">{t('booking.no_slots_hint')}</p>
            </div>
          )}
          {!loading && dayData && dayData.slots.length > 0 && (
            <div className="sf-grid" role="listbox" aria-label={t('common.time')}>
              {dayData.slots.map((s) => (
                <button key={s.startsAt} type="button" role="option" aria-selected={slot?.startsAt === s.startsAt} className="sf-slot" aria-pressed={slot?.startsAt === s.startsAt} onClick={() => setSlot(s)}>
                  {formatDateTime(s.startsAt, { tz, locale, timeOnly: true })}
                </button>
              ))}
            </div>
          )}
          {slot && <Itinerary slot={slot} tz={tz} nameOf={(id) => nm(svc(id))} money={money} />}
          <div className="sf-actions">
            <button type="button" className="sf-btn-secondary" onClick={() => setStep(2)}>
              {t('common.back')}
            </button>
            <button type="button" className="sf-btn" disabled={!slot} onClick={goReview}>
              {signedIn ? t('booking.continue') : t('booking.signin_to_continue')}
            </button>
          </div>
        </section>
      )}

      {step === 4 && slot && (
        <section aria-labelledby="bk-s4">
          <h2 id="bk-s4" className="sf-h2">
            {t('booking.step_review')}
          </h2>
          <Itinerary slot={slot} tz={tz} nameOf={(id) => nm(svc(id))} money={money} />
          {!hold && (
            <>
              {!quote && !error && <p className="sf-muted">{t('common.loading')}</p>}
              {quote && (
                <>
                  <div className="sf-card">
                    <div className="sf-row">
                      <strong>{t('booking.total')}</strong>
                      <span>{money(quote.totalMinor)}</span>
                    </div>
                    <p className="sf-muted">{t(quote.explanationKey)}</p>
                  </div>
                  {quote.options.length === 0 ? (
                    <div className="sf-alert" role="alert">
                      {t('booking.no_payment_path')}
                    </div>
                  ) : (
                    <fieldset className="sf-field">
                      <legend>{t('booking.payment_options')}</legend>
                      {quote.options.map((o) => (
                        <label key={o.kind} className="sf-check">
                          <input type="radio" name="terms" checked={termsKind === o.kind} onChange={() => setTermsKind(o.kind)} /> {t(`booking.term.${o.kind}`)}
                          {o.dueNowMinor > 0 && ` — ${t('booking.due_now')}: ${money(o.dueNowMinor)}`}
                          {o.kind === 'deposit' && ` (${t('booking.due_later')}: ${money(quote.totalMinor - o.dueNowMinor)})`}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {(quote.policy?.policyText || quote.policy?.policyTextEn) && (
                    <details className="sf-card" open>
                      <summary>{t('booking.policy')}</summary>
                      <p style={{ whiteSpace: 'pre-line' }}>{locale === 'en' && quote.policy.policyTextEn ? quote.policy.policyTextEn : quote.policy.policyText}</p>
                    </details>
                  )}
                  <div className="sf-field">
                    <label htmlFor="bk-note">{t('booking.note')}</label>
                    <textarea id="bk-note" className="sf-input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <label className="sf-check">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {t('booking.policy_ack')}
                  </label>
                  <div className="sf-actions">
                    <button type="button" className="sf-btn-secondary" onClick={() => setStep(3)}>
                      {t('common.back')}
                    </button>
                    <button type="button" className="sf-btn" disabled={!ack || !termsKind || busy || !quote.options.length} onClick={placeHold}>
                      {busy ? t('common.loading') : t('booking.hold_now')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {hold && <HoldPanel hold={hold} busy={busy} money={money} onPay={payOrConfirm} onRelease={releaseHold} onExpired={() => { setHold(null); setSlot(null); setNotice(t('booking.hold_expired')); setStep(3); }} />}
        </section>
      )}
    </div>
  );
}

function Itinerary({ slot, tz, nameOf, money }: { slot: Slot; tz: string; nameOf: (id: string) => string; money: (m: number) => string }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="sf-card" aria-live="polite">
      <h3 className="sf-h3">{t('booking.itinerary')}</h3>
      <ol className="sf-list">
        {slot.items.map((it, i) => {
          const prevEnd = i > 0 ? +new Date(slot.items[i - 1].endsAt) : null;
          const gap = prevEnd ? Math.round((+new Date(it.startsAt) - prevEnd) / 60000) : 0;
          return (
            <li key={it.key}>
              {gap > 0 && <div className="sf-muted">{t('booking.gap', { min: gap })}</div>}
              <div>
                <strong>{formatDateTime(it.startsAt, { tz, locale, timeOnly: true })}</strong> — {nameOf(it.serviceId)} · {it.staffName ? t('booking.with', { name: it.staffName }) : t('booking.specialist_assigned')} · {money(it.priceMinor)}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="sf-row">
        <span>
          {formatDateTime(slot.startsAt, { tz, locale, dateStyle: 'full' })} · {t('booking.total_duration')}: {formatDuration(slot.totalDurationMin, locale)}
        </span>
        <strong>{money(slot.totalPriceMinor)}</strong>
      </div>
    </div>
  );
}

function HoldPanel({ hold, busy, money, onPay, onRelease, onExpired }: { hold: Hold; busy: boolean; money: (m: number) => string; onPay: () => void; onRelease: () => void; onExpired: () => void }) {
  const t = useT();
  const [left, setLeft] = useState(() => Math.max(0, +new Date(hold.holdExpiresAt) - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const l = Math.max(0, +new Date(hold.holdExpiresAt) - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [hold.holdExpiresAt, onExpired]);
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  const label = hold.dueNowMinor > 0 ? `${t('booking.pay_now')} (${money(hold.dueNowMinor)})` : hold.termsKind === 'manual_approval' ? t('booking.continue') : t('booking.confirm_now');
  return (
    <div className="sf-card" role="region" aria-label={t('booking.number')}>
      <p>
        {t('booking.number')}: <strong className="ltr-num">{hold.number}</strong>
      </p>
      <p aria-live="polite">{t('booking.held_until', { time: `${mm}:${ss}` })}</p>
      <div className="sf-actions">
        <button type="button" className="sf-btn-secondary" disabled={busy} onClick={onRelease}>
          {t('booking.release')}
        </button>
        <button type="button" className="sf-btn" disabled={busy || left === 0} onClick={onPay}>
          {busy ? t('common.loading') : label}
        </button>
      </div>
    </div>
  );
}
