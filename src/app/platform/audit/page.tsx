import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { auditQuery, platformAudit } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.audit.view')) notFound();
  const { t, locale } = await pageT(p.user);
  const sp = await searchParams;
  const q = auditQuery.safeParse({ action: sp.action || undefined, actorKind: sp.actorKind || undefined, before: sp.before || undefined, limit: 50 });
  const r = await platformAudit(p, q.success ? q.data : { limit: 50 });
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.audit')}</h1></div>
      <form className="toolbar" method="get">
        <input className="input input-ltr" name="action" placeholder="action prefix e.g. support." defaultValue={sp.action} aria-label={t('platform.col.action')} />
        <select className="input" name="actorKind" defaultValue={sp.actorKind ?? ''} aria-label={t('platform.col.actor')} style={{ maxWidth: 160 }}>
          <option value="">{t('common.all')}</option>
          {['user', 'platform', 'support', 'system', 'customer'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="btn btn-sm">{t('common.filter')}</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('platform.col.when')}</th><th>{t('platform.col.actor')}</th><th>{t('platform.col.action')}</th><th>{t('platform.col.business')}</th><th>{t('platform.col.target')}</th><th>{t('common.reason')}</th></tr></thead>
          <tbody>
            {r.items.map((a) => (
              <tr key={String(a.id)}>
                <td className="small">{formatDateTime(a.at as Date, { locale })}</td>
                <td className="small">{a.actorKind as string} · {(a.actorName as string) ?? '—'}</td>
                <td className="mono small">{a.action as string}</td>
                <td className="small">{(a.tenantName as string) ?? '—'}</td>
                <td className="mono small">{(a.targetType as string) ?? ''} {String(a.targetId ?? '').slice(0, 8)}</td>
                <td className="small">{(a.reason as string) ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.nextBefore && <div className="pager"><span /><Link href={`?${new URLSearchParams({ ...sp, before: String(r.nextBefore) })}`}>{t('platform.load_more')}</Link></div>}
    </>
  );
}
