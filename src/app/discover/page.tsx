import Link from 'next/link';
import { Brand } from '@/components/shell/Brand';
import { EmptyState } from '@/components/ui/forms';
import { pageT, sessionUser } from '@/server/http/page';
import { discoverQuery, discoverTenants } from '@/server/platform/discover';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Discover' };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await sessionUser();
  const { t } = await pageT(user);
  const sp = await searchParams;
  const q = discoverQuery.parse({ city: sp.city || undefined, type: sp.type || undefined, q: sp.q || undefined, offset: sp.offset });
  const r = await discoverTenants(q);
  return (
    <main id="main" className="content" style={{ margin: '0 auto' }}>
      <Brand />
      <div className="page-head"><h1 className="display">{t('discover.title')}</h1></div>
      <form className="toolbar" method="get" role="search">
        <input className="input" name="q" defaultValue={q.q} placeholder={t('discover.q')} aria-label={t('discover.q')} />
        <select className="input" name="city" defaultValue={q.city ?? ''} aria-label={t('discover.city')} style={{ maxWidth: 180 }}>
          <option value="">{t('discover.city')}: {t('common.all')}</option>
          {r.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" name="type" defaultValue={q.type ?? ''} aria-label={t('discover.type')} style={{ maxWidth: 180 }}>
          <option value="">{t('discover.type')}: {t('common.all')}</option>
          {['salon', 'expert', 'spa', 'clinic', 'studio'].map((x) => <option key={x} value={x}>{t(`onb.type.${x}`)}</option>)}
        </select>
        <button className="btn btn-sm" type="submit">{t('common.search')}</button>
      </form>
      <p className="muted small" aria-live="polite">{t('discover.results', { n: r.total })}</p>
      {r.items.length === 0 ? <EmptyState icon="search" title={t('discover.none')} /> : (
        <div className="grid cols-3">
          {r.items.map((x) => (
            <article key={x.slug} className="card stack">
              <h2 style={{ margin: 0 }}>{x.name}</h2>
              <div className="small muted">{x.city ?? ''} · {t(`onb.type.${x.businessType}`)}</div>
              {x.tagline && <p className="small">{x.tagline}</p>}
              <div className="small muted">{t('discover.services_count', { n: x.serviceCount })}</div>
              <Link className="btn btn-ghost btn-sm" href={`/s/${x.slug}`}>{t('discover.visit')}</Link>
            </article>
          ))}
        </div>
      )}
      <div className="pager">
        {q.offset > 0 ? <Link href={`?${new URLSearchParams({ ...sp, offset: String(Math.max(0, q.offset - 24)) })}`}>{t('common.prev_page')}</Link> : <span />}
        {r.hasMore && <Link href={`?${new URLSearchParams({ ...sp, offset: String(q.offset + 24) })}`}>{t('common.next_page')}</Link>}
      </div>
    </main>
  );
}
