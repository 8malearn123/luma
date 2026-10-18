import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/platform/ActionForm';
import { formatDateTime } from '@/lib/format';
import { AppError } from '@/server/errors';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { getIncident } from '@/server/policy/service';

export const dynamic = 'force-dynamic';
const NEXT: Record<string, string[]> = { submitted: ['under_review', 'confirmed', 'rejected'], under_review: ['confirmed', 'rejected'], confirmed: ['corrected'], rejected: ['corrected'] };

export default async function IncidentDetail({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'incidents.submit', 'incidents.review') || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  let d: Awaited<ReturnType<typeof getIncident>>;
  try {
    d = await tx(ctx, (db) => getIncident(db, id));
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
  const i = d.incident;
  const tz = ctx.tenant.timezone;
  const base = `/api/v1/t/${ctx.tenant.slug}/incidents/${id}`;
  const next = NEXT[i.status as string] ?? [];
  return (
    <>
      <div className="crumbs"><Link href={`/app/${ctx.tenant.slug}/incidents`}>{t('policy.title')}</Link></div>
      <div className="page-head">
        <h1>{t(`policy.type.${i.type}`)} · <span className="mono">{i.bookingNumber as string}</span></h1>
        <span className="badge">{t(`policy.status.${i.status}`)}</span>
      </div>
      <section className="card">
        <p><strong>{t('policy.customer')}:</strong> {i.customerName as string}</p>
        <p className="small muted">{formatDateTime(i.occurredAt as Date, { tz, locale })}</p>
        <p>{i.description as string}</p>
        <h3>{t('policy.evidence_note')}</h3>
        {d.evidence.length === 0 ? <p className="muted small">—</p> : (
          <ul>{d.evidence.map((e, n) => <li key={n} className="small">{e.kind as string}: {e.ref as string} <span className="muted">(retain until {String(e.retainUntil).slice(0, 10)})</span></li>)}</ul>
        )}
      </section>
      {can(ctx, 'incidents.review') && next.length > 0 && (
        <section className="card">
          <h2>{t('policy.review_note')}</h2>
          <ActionForm path={`${base}/review`} submitLabel={t('common.save')} fields={[
            { name: 'to', label: t('common.status'), type: 'select', options: next.map((x) => ({ value: x, label: t(`policy.to.${x}`) })), defaultValue: next[0] },
            { name: 'note', label: t('policy.review_note'), type: 'textarea', required: true },
          ]} />
        </section>
      )}
      {!i.platformReviewRequested && ['submitted', 'under_review', 'confirmed'].includes(i.status as string) && (
        <section className="card"><ActionForm path={`${base}/platform-review`} submitLabel={t('policy.request_platform')} fields={[]} /></section>
      )}
      <section className="card">
        <h2>{t('policy.tab.queue')}</h2>
        {d.reviews.length === 0 ? <p className="muted small">—</p> : (
          <ol className="stack">{d.reviews.map((r, n) => (
            <li key={n} className="small">{formatDateTime(r.createdAt as Date, { tz, locale })} · {r.reviewerScope as string} · {r.reviewer as string}: {t(`policy.status.${r.fromStatus}`)} → {t(`policy.status.${r.toStatus}`)} — {r.note as string}</li>
          ))}</ol>
        )}
      </section>
    </>
  );
}
