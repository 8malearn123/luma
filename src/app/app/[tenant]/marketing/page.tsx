import Link from 'next/link';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { aiStatus } from '@/server/ai/provider';
import { checkBudget } from '@/server/ai/run';
import { listPlans } from '@/server/marketing/plans';
import { listTrends } from '@/server/marketing/trends';
import { explainSegment } from '@/server/marketing/campaigns';
import { env } from '@/server/env';
import { entitlements, featureEnabled } from '@/server/tenancy/plan';
import { formatDateTime, formatMoney } from '@/lib/format';
import { EmptyState } from '@/components/ui/forms';
import { ActionButton, AddSourceForm, AddToPlan, AssistantPanel, CampaignBuilder, PreferencesForm, RunAnalysis, ScheduleCampaign } from '@/components/marketing/MarketingClient';
import type { RecommendationContent } from '@/server/marketing/recommendations';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'plans', 'recommendations', 'trends', 'campaigns', 'assistant', 'settings'] as const;
type Tab = (typeof TABS)[number];

export default async function MarketingPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'overview';
  const canView = can(ctx, 'marketing.view');
  const canEdit = can(ctx, 'storefront.edit');
  if (!canView && !(tab === 'assistant' && canEdit)) return <div className="alert error" role="alert">{t('common.permission_denied')}</div>;
  const canManage = can(ctx, 'marketing.manage');
  const canApprove = can(ctx, 'campaign.approve');
  const base = `/app/${tenant}/marketing`;

  const data = await tx(ctx, async (db) => {
    const ent = await entitlements(db, ctx.tenant.id);
    const ai = await aiStatus(db);
    const budget = await checkBudget(db, ctx.tenant.id);
    const plans = canView ? await listPlans(db) : [];
    const jobs = canView ? await db<{ id: string; status: string; payload: { horizon: string }; createdAt: Date; error: string | null }[]>`
      select id, status, payload, created_at, error from job_runs where tenant_id = ${ctx.tenant.id} and kind = 'marketing.analysis' order by created_at desc limit 5` : [];
    const recs = canView && (tab === 'overview' || tab === 'recommendations')
      ? await db<{ id: string; status: string; content: RecommendationContent; validation: { flagged?: boolean }; sourceType: string }[]>`
          select id, status, content, validation, source_type from recommendations where status in ('proposed','deferred') and (expires_at is null or expires_at > now()) order by created_at desc limit 30`
      : [];
    const trends = canView && tab === 'trends' ? await listTrends(db) : null;
    const campaigns = canView && tab === 'campaigns' ? await db<{ id: string; name: string; channel: string; status: string; scheduledAt: Date | null; approvedAt: Date | null; simulated: number; suppressed: number }[]>`
      select c.id, c.name, c.channel, c.status, c.scheduled_at, c.approved_at,
        (select count(*) from campaign_recipients r where r.campaign_id = c.id and r.status = 'simulated')::int as simulated,
        (select count(*) from campaign_recipients r where r.campaign_id = c.id and r.status = 'suppressed')::int as suppressed
      from campaigns c order by c.created_at desc limit 50` : [];
    const segments = canView && tab === 'campaigns' ? (await db<{ id: string; name: string; definition: { conditions: Parameters<typeof explainSegment>[0]['conditions'] } }[]>`select id, name, definition from campaign_segments order by created_at desc limit 50`).map((s) => ({ id: s.id, name: s.name, explanation: explainSegment(s.definition, locale) })) : [];
    const [prefs] = tab === 'settings' ? await db`select * from marketing_preferences limit 1` : [];
    return { ent, ai, budget, plans, jobs, recs, trends, campaigns, segments, prefs };
  });

  const featureOn = featureEnabled(data.ent, 'marketing.enabled');
  const statusClass = data.ai.status === 'live_verified' ? 'green' : data.ai.status === 'configured_untested' ? 'amber' : '';
  const weeklyPlans = data.plans.filter((p) => p.horizon === 'weekly' && !['completed', 'rejected'].includes(String(p.status))).map((p) => ({ id: String(p.id), title: String(p.title) }));
  const L = (x: { ar: string; en: string } | null | undefined) => (x ? x[locale] || x.ar : '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('mkt.title')}</h1>
          <div className="small muted">{t('mkt.subtitle')}</div>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <span className={`badge ${statusClass}`} role="status">{t(`ai.status.${data.ai.status}`)}</span>
          {!data.budget.ok && <span className="small muted">{t(data.budget.code === 'plan_not_included' ? 'ai.budget_none' : 'ai.budget_exhausted')}</span>}
        </div>
      </div>
      {!featureOn && <div className="alert warn">{t('errors.plan_feature')}</div>}

      <div className="tabs" role="tablist">
        {TABS.filter((x) => x !== 'settings' || canManage).filter((x) => canView || x === 'assistant').map((x) => (
          <Link key={x} role="tab" aria-selected={x === tab} className="tab" href={`${base}?tab=${x}`}>{t(`mkt.tab.${x}`)}</Link>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid cols-2">
          <section className="card">
            <h2>{t('mkt.latest_plan')}</h2>
            {data.plans[0] ? (
              <div className="stack">
                <Link href={`${base}/plans/${data.plans[0].id}`}>{String(data.plans[0].title)}</Link>
                <div className="row">
                  <span className="badge">{t(`mkt.status.${data.plans[0].status}`)}</span>
                  {data.plans[0].isExample ? <span className="badge amber">{t('mkt.example_badge')}</span> : <span className="badge gold">{t('mkt.ai_badge')}</span>}
                </div>
              </div>
            ) : <EmptyState icon="mega" title={t('mkt.no_plans')} />}
            {canManage && featureOn && <div style={{ marginTop: 12 }}><RunAnalysis base={tenant} /></div>}
          </section>
          <section className="card">
            <h2>{t('mkt.open_recs')}</h2>
            {data.recs.length ? (
              <ul className="stack" style={{ paddingInlineStart: 18, margin: 0 }}>
                {data.recs.slice(0, 3).map((r) => <li key={r.id}>{L(r.content.title)} <span className="badge soft">{t(`mkt.cat.${r.content.category}`)}</span></li>)}
              </ul>
            ) : <EmptyState title={t('mkt.rec.none')} />}
            {data.recs.length > 3 && <Link className="small" href={`${base}?tab=recommendations`}>{t('common.more')} ({data.recs.length})</Link>}
          </section>
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <h2>{t('mkt.jobs')}</h2>
            {data.jobs.length ? (
              <table className="table"><tbody>{data.jobs.map((j) => (
                <tr key={j.id}><td>{t(`mkt.horizon.${j.payload.horizon}`)}</td><td><span className={`badge ${j.status === 'failed' ? 'red' : j.status === 'succeeded' ? 'green' : ''}`}>{t(`mkt.job.${j.status}`)}</span></td><td className="small muted">{formatDateTime(j.createdAt, { tz: ctx.tenant.timezone, locale })}</td></tr>
              ))}</tbody></table>
            ) : <EmptyState title={t('common.empty')} />}
          </section>
        </div>
      )}

      {tab === 'plans' && (
        <section className="card">
          {canManage && featureOn && <div style={{ marginBottom: 12 }}><RunAnalysis base={tenant} /></div>}
          {data.plans.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('common.name')}</th><th>{t('common.status')}</th><th>{t('mkt.plan.versions')}</th><th></th></tr></thead>
                <tbody>{data.plans.map((p) => (
                  <tr key={String(p.id)}>
                    <td><Link href={`${base}/plans/${p.id}`}>{String(p.title)}</Link><div className="small muted">{t(`mkt.horizon.${p.horizon}`)} · {String(p.periodStart)} → {String(p.periodEnd)}</div></td>
                    <td><span className="badge">{t(`mkt.status.${p.status}`)}</span></td>
                    <td className="mono">v{String(p.currentVersion)}{Number(p.latestVersion) > Number(p.currentVersion) && <span className="badge amber" style={{ marginInlineStart: 6 }}>{t('mkt.plan.pending')}</span>}</td>
                    <td>{p.isExample ? <span className="badge amber">{t('mkt.example_badge')}</span> : <span className="badge gold">{t('mkt.ai_badge')}</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon="mega" title={t('mkt.no_plans')} />}
        </section>
      )}

      {tab === 'recommendations' && (
        <div className="stack">
          {data.recs.length === 0 && <EmptyState title={t('mkt.rec.none')} />}
          {data.recs.map((r) => {
            const c = r.content;
            return (
              <article key={r.id} className="card" aria-labelledby={`rec-${r.id}`}>
                <div className="row between">
                  <h3 id={`rec-${r.id}`} style={{ margin: 0 }}>{L(c.title)}</h3>
                  <div className="row">
                    <span className="badge soft">{t(`mkt.cat.${c.category}`)}</span>
                    <span className="badge">{t(`mkt.horizon.${c.horizon}`)}</span>
                    <span className={`badge ${r.sourceType === 'ai' ? 'gold' : ''}`}>{r.sourceType === 'ai' ? t('mkt.ai_badge') : t('mkt.rules_badge')}</span>
                  </div>
                </div>
                {r.validation?.flagged && <div className="alert warn" style={{ marginTop: 8 }}>{t('mkt.rec.flagged')}</div>}
                <dl className="grid cols-2" style={{ marginTop: 10 }}>
                  <div><dt className="small muted">{t('mkt.rec.opportunity')}</dt><dd style={{ margin: 0 }}>{L(c.opportunity)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.action')}</dt><dd style={{ margin: 0 }}>{L(c.suggested_action)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.capacity')}</dt><dd style={{ margin: 0 }}>{t(`mkt.check.${c.capacity_check.status}`)} — {L(c.capacity_check.note)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.margin')}</dt><dd style={{ margin: 0 }}>{t(`mkt.check.${c.margin_check.status}`)} — {L(c.margin_check.note)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.cost')}</dt><dd style={{ margin: 0 }}>{c.estimated_cost.amountMinor == null ? t('mkt.rec.cost_unknown') : formatMoney(c.estimated_cost.amountMinor, 'SAR', locale)} — {L(c.estimated_cost.assumptions)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.experiment')}</dt><dd style={{ margin: 0 }}>{L(c.experiment_design)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.success')}</dt><dd style={{ margin: 0 }}>{L(c.success_metric)}</dd></div>
                  <div><dt className="small muted">{t('mkt.rec.confidence')}</dt><dd style={{ margin: 0 }}>{t(`mkt.rec.confidence.${c.confidence}`)}</dd></div>
                </dl>
                {Object.keys(c.measured_metrics).length > 0 && (
                  <details style={{ marginTop: 8 }}><summary className="small">{t('mkt.rec.evidence')}</summary>
                    <ul className="small mono">{Object.entries(c.measured_metrics).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
                  </details>
                )}
                {c.limitations.length > 0 && <ul className="small muted">{c.limitations.map((l, i) => <li key={i}>{L(l)}</li>)}</ul>}
                {c.proposed_target && <p className="small muted">{L(c.proposed_target)} — {t('mkt.plan.target_note')}</p>}
                <div className="small muted">{t('mkt.rec.data_as_of')} {formatDateTime(c.data_as_of, { tz: ctx.tenant.timezone, locale })} · {t('mkt.rec.review_at')} {formatDateTime(c.review_at, { tz: ctx.tenant.timezone, locale, dateOnly: true })}</div>
                {canManage && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <ActionButton path={`/api/v1/t/${tenant}/marketing/recommendations/${r.id}`} body={{ decision: 'accepted' }} label={t('mkt.rec.accept')} variant="btn-gold" />
                    <ActionButton path={`/api/v1/t/${tenant}/marketing/recommendations/${r.id}`} body={{ decision: 'deferred' }} label={t('mkt.rec.defer')} variant="btn-quiet" />
                    <ActionButton path={`/api/v1/t/${tenant}/marketing/recommendations/${r.id}`} body={{ decision: 'dismissed' }} label={t('mkt.rec.dismiss')} variant="btn-quiet" />
                    {c.draft_content && <ActionButton path={`/api/v1/t/${tenant}/marketing/recommendations/${r.id}/campaign`} label={t('mkt.rec.to_campaign')} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'trends' && data.trends && (
        <div className="stack">
          {!data.trends.sourcesConnected && <div className="alert info" role="note">{t('trend.disconnected')}</div>}
          {!env().TRENDS_FETCH_ENABLED && <div className="alert warn" role="note">{t('trend.fetch_disabled')}</div>}
          {canManage && <section className="card"><AddSourceForm base={tenant} /></section>}
          {data.trends.sources.length > 0 && (
            <section className="card">
              <table className="table"><tbody>{data.trends.sources.map((s) => (
                <tr key={s.id}><td>{s.name}<div className="small muted mono">{s.url}</div></td><td><span className={`badge ${s.status === 'connected' ? 'green' : s.status === 'error' ? 'red' : ''}`}>{s.status}</span>{s.lastError && <div className="small muted">{t(s.lastError.startsWith('errors.') ? s.lastError : 'trend.fetch_disabled')}</div>}</td>
                  <td>{canManage && <ActionButton path={`/api/v1/t/${tenant}/trends/sources/${s.id}/fetch`} label={t('trend.fetch')} />}</td></tr>
              ))}</tbody></table>
            </section>
          )}
          {data.trends.clusters.length === 0 && <EmptyState title={t('trend.none')} />}
          {data.trends.clusters.map((c) => (
            <article key={c.key} className="card">
              <div className="row between"><h3 style={{ margin: 0 }}>{c.observations[0]?.title}</h3><span className="badge">{t(`trend.evidence.${c.evidenceStrength}`)}</span></div>
              <ul className="small" style={{ paddingInlineStart: 18 }}>
                {c.observations.slice(0, 5).map((o) => (
                  <li key={o.id}><a href={o.url} rel="noopener noreferrer nofollow" target="_blank">{o.title}</a> · <span className={`badge ${o.verification === 'live' ? 'green' : 'soft'}`}>{t(`trend.verification.${o.verification}`)}</span>{o.publishedAt && <span className="muted"> · {formatDateTime(o.publishedAt, { tz: ctx.tenant.timezone, locale, dateOnly: true })}</span>}</li>
                ))}
              </ul>
              {c.assessment ? (
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row"><span className={`badge ${c.assessment.fit === 'good' ? 'green' : c.assessment.fit === 'poor' ? 'red' : 'amber'}`}>{t(`trend.fit.${c.assessment.fit}`)}</span><span className="small muted">{t('trend.valid_until')} {String(c.assessment.validUntil ?? '').slice(0, 10)}</span></div>
                  <p className="small" style={{ margin: 0 }}>{String(c.assessment.rationale)}</p>
                  {c.assessment.applicationIdea && <p className="small" style={{ margin: 0 }}>{String(c.assessment.applicationIdea)}</p>}
                  {canManage && c.assessment.fit !== 'poor' && c.assessment.status === 'open' && <AddToPlan base={tenant} assessmentId={String(c.assessment.id)} plans={weeklyPlans} />}
                </div>
              ) : canManage && <ActionButton path={`/api/v1/t/${tenant}/trends/assess`} body={{ clusterKey: c.key }} label={t('trend.assess')} />}
            </article>
          ))}
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="stack">
          <div className="alert info" role="note">{t('camp.simulated_notice')}</div>
          {canManage && <CampaignBuilder base={tenant} segments={data.segments} />}
          <section className="card">
            {data.campaigns.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('camp.name')}</th><th>{t('camp.channel')}</th><th>{t('common.status')}</th><th>{t('camp.recipients')}</th><th>{t('common.actions')}</th></tr></thead>
                  <tbody>{data.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}{c.scheduledAt && <div className="small muted">{formatDateTime(c.scheduledAt, { tz: ctx.tenant.timezone, locale })}</div>}</td>
                      <td>{c.channel}</td>
                      <td><span className="badge">{t(`camp.status.${c.status}`)}</span></td>
                      <td className="small">{c.simulated} / <span className="muted">{c.suppressed}</span></td>
                      <td className="row">
                        {c.status === 'draft' && canApprove && <ActionButton path={`/api/v1/t/${tenant}/campaigns/${c.id}/action`} body={{ action: 'approve' }} label={t('camp.approve')} variant="btn-gold" />}
                        {c.status === 'approved' && canApprove && <ScheduleCampaign base={tenant} id={c.id} />}
                        {(c.status === 'approved' || c.status === 'scheduled') && canApprove && <ActionButton path={`/api/v1/t/${tenant}/campaigns/${c.id}/action`} body={{ action: 'send_simulated' }} label={t('camp.send_sim')} />}
                        {['draft', 'approved', 'scheduled', 'paused'].includes(c.status) && canManage && <ActionButton path={`/api/v1/t/${tenant}/campaigns/${c.id}/action`} body={{ action: 'cancel' }} label={t('camp.cancel')} variant="btn-quiet" />}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState icon="mega" title={t('camp.none')} />}
          </section>
        </div>
      )}

      {tab === 'assistant' && (canEdit ? <AssistantPanel base={tenant} builderHref={`/app/${tenant}/builder`} /> : <div className="alert error">{t('common.permission_denied')}</div>)}

      {tab === 'settings' && canManage && data.prefs && <PreferencesForm base={tenant} prefs={data.prefs as never} />}
    </>
  );
}
