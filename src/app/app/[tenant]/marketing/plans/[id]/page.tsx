import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { getPlan } from '@/server/marketing/plans';
import { AppError } from '@/server/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { ActionButton, PlanComment, PlanEditor } from '@/components/marketing/MarketingClient';

export const dynamic = 'force-dynamic';

const NEXT: Record<string, { to: string; key: string; approve?: boolean }[]> = {
  draft: [{ to: 'proposed', key: 'mkt.plan.reopen' }],
  proposed: [{ to: 'approved', key: 'mkt.plan.approve', approve: true }, { to: 'under_review', key: 'mkt.plan.review' }, { to: 'deferred', key: 'mkt.plan.defer' }, { to: 'rejected', key: 'mkt.plan.reject' }],
  under_review: [{ to: 'approved', key: 'mkt.plan.approve', approve: true }, { to: 'deferred', key: 'mkt.plan.defer' }, { to: 'rejected', key: 'mkt.plan.reject' }],
  approved: [{ to: 'in_progress', key: 'mkt.plan.start' }, { to: 'deferred', key: 'mkt.plan.defer' }],
  in_progress: [{ to: 'completed', key: 'mkt.plan.complete' }, { to: 'deferred', key: 'mkt.plan.defer' }],
  deferred: [{ to: 'proposed', key: 'mkt.plan.reopen' }],
};

export default async function PlanPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'marketing.view')) return <div className="alert error" role="alert">{t('common.permission_denied')}</div>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let p: Awaited<ReturnType<typeof getPlan>>;
  try {
    p = await tx(ctx, (db) => getPlan(db, id));
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
  const c = p.current.content;
  const L = (x: { ar: string; en: string } | null | undefined) => (x ? x[locale] || x.ar : '');
  const canManage = can(ctx, 'marketing.manage');
  const canApprove = can(ctx, 'campaign.approve');
  const api = `/api/v1/t/${tenant}/marketing/plans/${id}`;
  return (
    <>
      <div className="crumbs"><Link href={`/app/${tenant}/marketing?tab=plans`}>{t('mkt.tab.plans')}</Link></div>
      <div className="page-head">
        <div>
          <h1>{p.plan.title}</h1>
          <div className="row small muted">
            <span>{t(`mkt.horizon.${p.plan.horizon}`)} · {p.plan.periodStart} → {p.plan.periodEnd}</span>
            <span className="badge">{t(`mkt.status.${p.plan.status}`)}</span>
            {c.isExample ? <span className="badge amber">{t('mkt.example_badge')}</span> : <span className="badge gold">{t('mkt.ai_badge')}</span>}
            {c.insufficientData && <span className="badge red">{t('mkt.insufficient')}</span>}
          </div>
        </div>
        <div className="row">
          {(NEXT[p.plan.status] ?? []).filter((n) => (n.approve ? canApprove : canManage)).map((n) => (
            <ActionButton key={n.to} path={`${api}/transition`} body={{ to: n.to }} label={t(n.key)} variant={n.approve ? 'btn-gold' : 'btn-ghost'} />
          ))}
          {canManage && !['completed', 'rejected'].includes(p.plan.status) && <ActionButton path={`${api}/regenerate`} label={t('mkt.plan.regenerate')} variant="btn-quiet" />}
          <a className="btn btn-quiet btn-sm" href={`${api}/export?format=json`}>{t('mkt.plan.export_json')}</a>
          <a className="btn btn-quiet btn-sm" href={`${api}/export?format=csv`}>{t('mkt.plan.export_csv')}</a>
        </div>
      </div>

      {c.limitations.length > 0 && (
        <div className="alert warn" role="note"><div><strong>{t('mkt.limitations')}</strong><ul>{c.limitations.map((l, i) => <li key={i}>{L(l)}</li>)}</ul></div></div>
      )}
      {p.pendingVersions.length > 0 && (
        <div className="alert info" role="status">
          <div className="stack" style={{ gap: 6 }}>
            {p.pendingVersions.map((v) => (
              <div key={v.number} className="row">{t('mkt.plan.pending')}: {t('mkt.plan.version', { n: v.number })} — {v.changeNote}
                {canApprove && <ActionButton path={`${api}/adopt`} body={{ version: v.number }} label={t('mkt.plan.adopt')} variant="btn-gold" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <section className="card">
          <h2>{t('mkt.plan.goal')}</h2>
          <p>{L(c.goal)}</p>
          {c.parentGoal && <p className="small muted">{t('mkt.plan.parent_goal')}: {L(c.parentGoal)}</p>}
          <h3>{t('mkt.plan.baseline')}</h3>
          <ul className="small mono">{Object.entries(c.baseline.metrics).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
          <p className="small muted">{L(c.baseline.note)}</p>
          <h3>{t('mkt.plan.budget')}</h3>
          <p>{c.budget.amountMinor == null ? t('mkt.plan.unknown_budget') : formatMoney(c.budget.amountMinor, 'SAR', locale)}</p>
          <p className="small muted">{t('mkt.plan.target_note')}</p>
        </section>
        <section className="card">
          <h2>{t('mkt.plan.versions')}</h2>
          <ul className="small">
            {p.versions.map((v) => (
              <li key={v.number}>{t('mkt.plan.version', { n: v.number })} {v.number === p.plan.currentVersion && <span className="badge green">{t('mkt.plan.current')}</span>} — {v.changeNote} · {formatDateTime(v.createdAt, { tz: ctx.tenant.timezone, locale })}{' '}
                <a href={`${api}/export?format=json&version=${v.number}`}>JSON</a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h2>{t('mkt.plan.initiatives')}</h2>
        {c.initiatives.map((ini) => (
          <div key={ini.id} style={{ marginBottom: 10 }}>
            <strong>{L(ini.title)}</strong>
            <ul className="small">{ini.activities.map((a) => <li key={a.id}>{a.date} · {L(a.title)} {a.channel && <span className="badge soft">{a.channel}</span>} <span className="badge">{a.status}</span></li>)}</ul>
          </div>
        ))}
      </section>

      {canManage && !['completed', 'rejected'].includes(p.plan.status) && (
        <div style={{ marginTop: 14 }}><PlanEditor base={tenant} planId={id} content={c} period={{ from: p.plan.periodStart, to: p.plan.periodEnd }} /></div>
      )}

      <section className="card" style={{ marginTop: 14 }}>
        <h2>{t('mkt.plan.comments')}</h2>
        <ul className="small">{p.comments.map((cm) => <li key={String(cm.id)}><strong>{String(cm.author)}</strong>: {String(cm.body)} <span className="muted">{formatDateTime(cm.createdAt as Date, { tz: ctx.tenant.timezone, locale })}</span></li>)}</ul>
        <PlanComment base={tenant} planId={id} />
      </section>
    </>
  );
}
