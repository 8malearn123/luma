import { growthGate, GateMessage } from '@/components/growth/server';
import { GiftCardsManager } from '@/components/growth/GiftCardsManager';
import { tx } from '@/server/tenancy/context';
import { listGiftCards } from '@/server/services/giftcards';
import type { BrandTokens } from '@/components/growth/GiftCardPreview';

export const dynamic = 'force-dynamic';

export default async function GiftsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const g = await growthGate(tenant, ['loyalty.manage'], 'giftcards.enabled');
  const head = (
    <div className="page-head">
      <div>
        <h1>{g.t('growth.gifts.title')}</h1>
        <p className="muted small" style={{ margin: 0 }}>{g.t('growth.gifts.redeem_hint')}</p>
      </div>
    </div>
  );
  if (g.state !== 'ok') return (<>{head}<GateMessage state={g.state} t={g.t} /></>);
  const data = await tx(g.ctx, async (db) => {
    const cards = await listGiftCards(db);
    // the business's own storefront colors (published version first, else draft)
    const [brand] = await db<{ colors: BrandTokens | null }[]>`
      select coalesce(
        (select v.document->'brand'->'colors' from page_versions v join tenants t on t.published_version_id = v.id limit 1),
        (select d.document->'brand'->'colors' from storefront_drafts d limit 1)) as colors`;
    return { cards, brand: brand?.colors ?? null };
  });
  return (
    <>
      {head}
      <GiftCardsManager tenant={tenant} businessName={g.ctx.tenant.name} brand={data.brand} cards={JSON.parse(JSON.stringify(data.cards))} />
    </>
  );
}
