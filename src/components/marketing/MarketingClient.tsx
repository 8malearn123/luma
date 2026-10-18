'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';

/** Generic POST button with busy state, idempotency and error display. */
export function ActionButton({ path, body = {}, label, variant = 'btn-ghost', confirm, onDone }: { path: string; body?: unknown; label: string; variant?: string; confirm?: string; onDone?: (r: unknown) => void }) {
  const router = useRouter();
  const s = useSubmit<unknown, unknown>(path, 'POST');
  return (
    <span className="stack" style={{ gap: 4, display: 'inline-flex' }}>
      <button
        type="button"
        className={`btn btn-sm ${variant}`}
        disabled={s.busy}
        aria-busy={s.busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const r = await s.submit(body);
          if (r) {
            onDone?.(r);
            router.refresh();
          }
        }}
      >
        {label}
      </button>
      <ErrorAlert error={s.error} />
    </span>
  );
}

export function RunAnalysis({ base }: { base: string }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const s = useSubmit<{ horizon: string }, { status: string; result?: { insufficientData: boolean } }>(`/api/v1/t/${base}/marketing/analyze`);
  const run = async (horizon: 'weekly' | 'monthly') => {
    const r = await s.submit({ horizon, runNow: true, force: true } as never);
    if (r) {
      toast(t(`mkt.job.${r.status}`), r.status === 'succeeded' ? 'ok' : 'err');
      router.refresh();
    }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button type="button" className="btn btn-gold btn-sm" disabled={s.busy} onClick={() => run('weekly')}>{s.busy ? t('mkt.running') : t('mkt.run_weekly')}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={s.busy} onClick={() => run('monthly')}>{t('mkt.run_monthly')}</button>
      </div>
      <ErrorAlert error={s.error} />
    </div>
  );
}

export function AddSourceForm({ base }: { base: string }) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'rss' | 'user_link'>('rss');
  const s = useSubmit<unknown, { id: string }>(`/api/v1/t/${base}/trends/sources`);
  return (
    <form
      className="row"
      style={{ alignItems: 'flex-end' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await s.submit({ kind, name, url })) {
          setName('');
          setUrl('');
          router.refresh();
        }
      }}
    >
      <Field label={t('trend.source_name')} required>{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label={t('trend.source_url')} required error={s.fieldErrors.url}>{(p) => <input {...p} className="input input-ltr" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}</Field>
      <Field label={t('camp.channel')}>{(p) => (
        <select {...p} className="input" value={kind} onChange={(e) => setKind(e.target.value as 'rss')}>
          <option value="rss">{t('trend.kind.rss')}</option>
          <option value="user_link">{t('trend.kind.user_link')}</option>
        </select>
      )}</Field>
      <div className="field"><button className="btn btn-gold" disabled={s.busy}>{t('trend.add_source')}</button></div>
      <div style={{ flexBasis: '100%' }}><ErrorAlert error={s.error} /></div>
    </form>
  );
}

export function AddToPlan({ base, assessmentId, plans }: { base: string; assessmentId: string; plans: { id: string; title: string }[] }) {
  const t = useT();
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  if (!plans.length) return null;
  return (
    <span className="row">
      <label className="sr-only" htmlFor={`pl-${assessmentId}`}>{t('trend.choose_plan')}</label>
      <select id={`pl-${assessmentId}`} className="input" style={{ maxWidth: 220 }} value={planId} onChange={(e) => setPlanId(e.target.value)}>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      <ActionButton path={`/api/v1/t/${base}/trends/assessments/${assessmentId}/plan`} body={{ planId }} label={t('trend.add_to_plan')} />
    </span>
  );
}

type Cond = { type: 'last_visit_days_gt' | 'last_visit_days_lt' | 'visits_gte'; n: number } | { type: 'has_consent'; channel: 'whatsapp' | 'sms' | 'email' | 'push' };

export function CampaignBuilder({ base, segments }: { base: string; segments: { id: string; name: string; explanation: string[] }[] }) {
  const t = useT();
  const router = useRouter();
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? '');
  const [segName, setSegName] = useState('');
  const [conds, setConds] = useState<Cond[]>([{ type: 'last_visit_days_lt', n: 90 }, { type: 'has_consent', channel: 'whatsapp' }]);
  const [count, setCount] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', text: '', couponCode: '', holdout: 20, window: 7, freq: 7 });
  const dirty = !!(form.name || form.text);
  useUnsavedGuard(dirty);
  const toApi = () => conds.map((c) => (c.type === 'has_consent' ? c : c.type === 'visits_gte' ? { type: c.type, count: c.n } : { type: c.type, days: c.n }));
  const preview = useSubmit<unknown, { count: number }>(`/api/v1/t/${base}/campaigns/segments/preview`);
  const seg = useSubmit<unknown, { id: string }>(`/api/v1/t/${base}/campaigns/segments`);
  const camp = useSubmit<unknown, { id: string }>(`/api/v1/t/${base}/campaigns`);
  return (
    <div className="grid cols-2">
      <section className="card" aria-labelledby="segh">
        <h3 id="segh">{t('camp.new_segment')}</h3>
        {conds.map((c, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <select className="input" style={{ maxWidth: 240 }} aria-label={t('camp.segment')} value={c.type} onChange={(e) => {
              const type = e.target.value as Cond['type'];
              const next = [...conds];
              next[i] = type === 'has_consent' ? { type, channel: 'whatsapp' } : { type, n: 30 };
              setConds(next);
            }}>
              {(['last_visit_days_gt', 'last_visit_days_lt', 'visits_gte', 'has_consent'] as const).map((k) => <option key={k} value={k}>{t(`camp.cond.${k}`)}</option>)}
            </select>
            {c.type === 'has_consent' ? (
              <select className="input" style={{ maxWidth: 140 }} aria-label={t('camp.channel')} value={c.channel} onChange={(e) => { const next = [...conds]; next[i] = { type: 'has_consent', channel: e.target.value as 'sms' }; setConds(next); }}>
                {['whatsapp', 'sms', 'email', 'push'].map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            ) : (
              <input className="input input-ltr" style={{ maxWidth: 110 }} type="number" min={1} aria-label="n" value={c.n} onChange={(e) => { const next = [...conds]; next[i] = { ...c, n: Number(e.target.value) }; setConds(next); }} />
            )}
            <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => setConds(conds.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConds([...conds, { type: 'visits_gte', n: 2 }])}><Icon name="plus" size={16} /> {t('common.add')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={preview.busy || !conds.length} onClick={async () => { const r = await preview.submit({ conditions: toApi() }); if (r) setCount(r.count); }}>{t('camp.preview')}</button>
          {count !== null && <span className="badge">{t('camp.preview_count', { n: count })}</span>}
        </div>
        <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={segName} onChange={(e) => setSegName(e.target.value)} />}</Field>
        <button type="button" className="btn btn-gold btn-sm" disabled={seg.busy || !segName || !conds.length} onClick={async () => {
          const r = await seg.submit({ name: segName, conditions: toApi() });
          if (r) { setSegmentId(r.id); setSegName(''); router.refresh(); }
        }}>{t('common.create')}</button>
        <ErrorAlert error={preview.error ?? seg.error} />
      </section>

      <form className="card" aria-labelledby="camph" onSubmit={async (e) => {
        e.preventDefault();
        const r = await camp.submit({ name: form.name, segmentId, channel: form.channel, content: { text: form.text }, couponCode: form.couponCode || null, holdoutBps: form.holdout * 100, attributionWindowDays: form.window, frequencyCapDays: form.freq });
        if (r) { setForm({ ...form, name: '', text: '' }); router.refresh(); }
      }}>
        <h3 id="camph">{t('camp.new')}</h3>
        <ErrorAlert error={camp.error} />
        <Field label={t('camp.name')} required>{(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label={t('camp.segment')} required>{(p) => (
          <select {...p} className="input" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {segments.map((sg) => <option key={sg.id} value={sg.id}>{sg.name} — {sg.explanation.join('، ')}</option>)}
          </select>
        )}</Field>
        <Field label={t('camp.channel')} required>{(p) => (
          <select {...p} className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            {['whatsapp', 'sms', 'email', 'instagram_post', 'in_app'].map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        )}</Field>
        <Field label={t('camp.text')} required>{(p) => <textarea {...p} className="input" maxLength={1000} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />}</Field>
        <div className="grid cols-3">
          <Field label={t('camp.coupon')}>{(p) => <input {...p} className="input input-ltr" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} />}</Field>
          <Field label={t('camp.holdout')}>{(p) => <input {...p} className="input input-ltr" type="number" min={0} max={50} value={form.holdout} onChange={(e) => setForm({ ...form, holdout: Number(e.target.value) })} />}</Field>
          <Field label={t('camp.window')}>{(p) => <input {...p} className="input input-ltr" type="number" min={1} max={60} value={form.window} onChange={(e) => setForm({ ...form, window: Number(e.target.value) })} />}</Field>
        </div>
        <div className="form-actions"><button className="btn btn-gold" disabled={camp.busy || !segmentId}>{t('common.create')}</button></div>
      </form>
    </div>
  );
}

export function ScheduleCampaign({ base, id }: { base: string; id: string }) {
  const t = useT();
  const [at, setAt] = useState('');
  return (
    <span className="row">
      <label className="sr-only" htmlFor={`at-${id}`}>{t('camp.schedule')}</label>
      <input id={`at-${id}`} type="datetime-local" className="input input-ltr" style={{ maxWidth: 220 }} value={at} onChange={(e) => setAt(e.target.value)} />
      {at && <ActionButton path={`/api/v1/t/${base}/campaigns/${id}/action`} body={{ action: 'schedule', at: new Date(at).toISOString() }} label={t('camp.schedule')} />}
    </span>
  );
}

interface Proposal {
  id: string;
  status: string;
  mode: 'ai' | 'rules';
  aiFailure: string | null;
  diff: { path: string; before: unknown; after: unknown }[];
  rejected: { request: string; reason: string }[];
  warnings: string[];
  explanation: string;
}

export function AssistantPanel({ base, builderHref }: { base: string; builderHref: string }) {
  const t = useT();
  const toast = useToast();
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const propose = useSubmit<unknown, Proposal>(`/api/v1/t/${base}/customize`);
  const decide = useSubmit<unknown, { status: string; draftVersion?: number }>(() => `/api/v1/t/${base}/customize/${proposal?.id}`);
  const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <section className="card" aria-labelledby="asst-h">
      <h2 id="asst-h">{t('customize.title')}</h2>
      <p className="small muted">{t('customize.hint')}</p>
      <form onSubmit={async (e) => { e.preventDefault(); const r = await propose.submit({ prompt }); if (r) setProposal(r); }}>
        <Field label={t('customize.prompt')} required>{(p) => <textarea {...p} className="input" maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} />}</Field>
        <div className="form-actions"><button className="btn btn-gold" disabled={propose.busy || prompt.trim().length < 3}>{propose.busy ? t('common.loading') : t('customize.propose')}</button></div>
      </form>
      <ErrorAlert error={propose.error} />
      {proposal && (
        <div className="stack" style={{ marginTop: 12 }} aria-live="polite">
          <div className="row">
            <span className={`badge ${proposal.mode === 'ai' ? 'gold' : ''}`}>{proposal.mode === 'ai' ? t('customize.mode_ai') : t('customize.mode_rules')}</span>
            {proposal.aiFailure && <span className="badge amber">{t(`errors.ai_${proposal.aiFailure}`)}</span>}
          </div>
          <p className="small">{proposal.explanation.startsWith('customize.') ? t(proposal.explanation) : proposal.explanation}</p>
          {proposal.diff.length ? (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">{t('customize.diff')}</caption>
                <thead><tr><th>{t('customize.diff')}</th><th>{t('common.from')}</th><th>{t('common.to')}</th></tr></thead>
                <tbody>{proposal.diff.map((d) => (
                  <tr key={d.path}><td className="mono small">{d.path}</td>
                    <td>{/^#[0-9A-F]{6}$/i.test(String(d.before)) && <span className="swatch" style={{ background: String(d.before) }} />} <span className="small mono">{show(d.before)}</span></td>
                    <td>{/^#[0-9A-F]{6}$/i.test(String(d.after)) && <span className="swatch" style={{ background: String(d.after) }} />} <span className="small mono">{show(d.after)}</span></td></tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="alert info">{t('customize.no_changes')}</div>}
          {proposal.warnings.map((w) => <div key={w} className="alert warn">{t(w)}</div>)}
          {proposal.rejected.length > 0 && (
            <div className="alert warn"><div><strong>{t('customize.rejected')}</strong><ul>{proposal.rejected.map((r, i) => <li key={i}>{r.request} — {t(r.reason)}</li>)}</ul></div></div>
          )}
          {proposal.status === 'proposed' && (
            <div className="form-actions">
              <button type="button" className="btn btn-quiet" disabled={decide.busy} onClick={async () => { if (await decide.submit({ decision: 'reject' })) setProposal(null); }}>{t('customize.reject')}</button>
              <button type="button" className="btn btn-gold" disabled={decide.busy} onClick={async () => {
                const r = await decide.submit({ decision: 'accept' });
                if (r) { toast(t('customize.applied', { v: r.draftVersion ?? '' }), 'ok'); setProposal(null); setPrompt(''); }
              }}>{t('customize.accept')}</button>
            </div>
          )}
          <ErrorAlert error={decide.error} />
          <a href={builderHref} className="small">{t('nav.builder')} →</a>
        </div>
      )}
    </section>
  );
}

export function PreferencesForm({ base, prefs }: { base: string; prefs: { goals: string[]; monthlyBudgetMinor: number | null; maxDiscountBps: number; channels: string[]; tone: string | null; avoidTopics: string[]; weeklyEnabled: boolean; monthlyEnabled: boolean; weeklyRunWeekday: number; photoResources: string | null } }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [f, setF] = useState({ goals: prefs.goals.join(', '), budget: prefs.monthlyBudgetMinor == null ? '' : String(prefs.monthlyBudgetMinor / 100), discount: prefs.maxDiscountBps / 100, tone: prefs.tone ?? '', avoid: prefs.avoidTopics.join(', '), weekly: prefs.weeklyEnabled, monthly: prefs.monthlyEnabled, weekday: prefs.weeklyRunWeekday, photos: prefs.photoResources ?? '' });
  const s = useSubmit<unknown, { ok: boolean }>(`/api/v1/t/${base}/marketing/preferences`, 'PUT');
  const days = locale === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const list = (s: string) => s.split(/[,،]/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      const r = await s.submit({ goals: list(f.goals), monthlyBudgetMinor: f.budget === '' ? null : Math.round(Number(f.budget) * 100), maxDiscountBps: Math.round(f.discount * 100), channels: prefs.channels, tone: f.tone || null, avoidTopics: list(f.avoid), weeklyEnabled: f.weekly, monthlyEnabled: f.monthly, weeklyRunWeekday: f.weekday, photoResources: f.photos || null });
      if (r) toast(t('common.saved'), 'ok');
    }}>
      <ErrorAlert error={s.error} />
      <div className="grid cols-2">
        <Field label={t('mkt.prefs.goals')}>{(p) => <input {...p} className="input" value={f.goals} onChange={(e) => setF({ ...f, goals: e.target.value })} />}</Field>
        <Field label={t('mkt.prefs.budget')}>{(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />}</Field>
        <Field label={t('mkt.prefs.max_discount')}>{(p) => <input {...p} className="input input-ltr" type="number" min={0} max={90} value={f.discount} onChange={(e) => setF({ ...f, discount: Number(e.target.value) })} />}</Field>
        <Field label={t('mkt.prefs.tone')}>{(p) => <input {...p} className="input" value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })} />}</Field>
        <Field label={t('mkt.prefs.avoid')}>{(p) => <input {...p} className="input" value={f.avoid} onChange={(e) => setF({ ...f, avoid: e.target.value })} />}</Field>
        <Field label={t('mkt.prefs.photos')}>{(p) => <input {...p} className="input" value={f.photos} onChange={(e) => setF({ ...f, photos: e.target.value })} />}</Field>
      </div>
      <div className="row">
        <label className="check"><input type="checkbox" checked={f.weekly} onChange={(e) => setF({ ...f, weekly: e.target.checked })} /> {t('mkt.prefs.weekly')}</label>
        <label className="check"><input type="checkbox" checked={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.checked })} /> {t('mkt.prefs.monthly')}</label>
        <label className="row small">{t('mkt.prefs.weekday')}
          <select className="input" style={{ maxWidth: 140 }} value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{days.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
        </label>
      </div>
      <div className="form-actions"><button className="btn btn-gold" disabled={s.busy}>{t('common.save')}</button></div>
    </form>
  );
}

export function PlanComment({ base, planId }: { base: string; planId: string }) {
  const t = useT();
  const router = useRouter();
  const [body, setBody] = useState('');
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${base}/marketing/plans/${planId}/comments`);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (await s.submit({ body })) { setBody(''); router.refresh(); } }}>
      <Field label={t('mkt.plan.add_comment')} required>{(p) => <textarea {...p} className="input" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
      <ErrorAlert error={s.error} />
      <div className="form-actions"><button className="btn btn-ghost btn-sm" disabled={s.busy || !body.trim()}>{t('mkt.plan.add_comment')}</button></div>
    </form>
  );
}

type Loc = { ar: string; en: string };
interface EditablePlan {
  goal: Loc;
  budget: { amountMinor: number | null };
  initiatives: { id: string; title: Loc; recommendationId: string | null; activities: { id: string; title: Loc; date: string; channel: string | null; ownerRole: 'owner' | 'manager' | 'receptionist'; status: 'planned' | 'done' | 'skipped' }[] }[];
}

export function PlanEditor({ base, planId, content, period }: { base: string; planId: string; content: EditablePlan; period: { from: string; to: string } }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [plan, setPlan] = useState<EditablePlan>(structuredClone(content));
  const [note, setNote] = useState('');
  const dirty = JSON.stringify(plan) !== JSON.stringify(content);
  useUnsavedGuard(dirty);
  const s = useSubmit<unknown, { version: number; pendingAdoption: boolean }>(`/api/v1/t/${base}/marketing/plans/${planId}`, 'PATCH');
  const setAct = (i: number, j: number, patch: Partial<EditablePlan['initiatives'][number]['activities'][number]>) => {
    const next = structuredClone(plan);
    Object.assign(next.initiatives[i].activities[j], patch);
    setPlan(next);
  };
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault();
      const r = await s.submit({ note, goal: plan.goal, initiatives: plan.initiatives, budgetMinor: plan.budget.amountMinor });
      if (r) { setNote(''); router.refresh(); }
    }}>
      <ErrorAlert error={s.error} />
      <Field label={t('mkt.plan.goal')} required>{(p) => <input {...p} className="input" value={plan.goal[locale]} onChange={(e) => setPlan({ ...plan, goal: { ...plan.goal, [locale]: e.target.value } })} />}</Field>
      {plan.initiatives.map((ini, i) => (
        <fieldset key={ini.id}>
          <legend>{ini.title[locale]}</legend>
          {ini.activities.map((a, j) => (
            <div key={a.id} className="grid cols-3">
              <Field label={t('common.description')}>{(p) => <input {...p} className="input" value={a.title[locale]} onChange={(e) => setAct(i, j, { title: { ...a.title, [locale]: e.target.value } })} />}</Field>
              <Field label={t('common.date')}>{(p) => <input {...p} className="input input-ltr" type="date" min={period.from} max={period.to} value={a.date} onChange={(e) => setAct(i, j, { date: e.target.value })} />}</Field>
              <Field label={t('common.status')}>{(p) => (
                <select {...p} className="input" value={a.status} onChange={(e) => setAct(i, j, { status: e.target.value as 'done' })}>
                  <option value="planned">planned</option><option value="done">done</option><option value="skipped">skipped</option>
                </select>
              )}</Field>
            </div>
          ))}
        </fieldset>
      ))}
      <Field label={t('mkt.plan.edit_note')} required>{(p) => <input {...p} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <div className="form-actions"><button className="btn btn-gold" disabled={s.busy || !dirty || !note.trim()}>{t('mkt.plan.save_version')}</button></div>
    </form>
  );
}
