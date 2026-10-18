import { api } from '@/server/http/handler';
import { publicTenant, runPublic } from '@/server/booking/customer';
import { activeAccount } from '@/server/payments/service';
import { cartView } from '@/server/booking/cart';
import { commerceSettings, listAddresses } from '@/server/commerce/delivery';

/** Checkout quote: server-priced cart + which payment paths exist. */
export const GET = api.user<{ slug: string }>(async (c) => {
  const t = await publicTenant(c.params.slug);
  return runPublic(t, c.user.userId, async (tx) => {
    const [cart] = await tx<{ id: string }[]>`select id from carts where user_id = ${c.user.userId} and status = 'open' and expires_at > now() order by created_at desc limit 1`;
    const [branch] = await tx<{ id: string; name: string; address: string | null }[]>`select id, name, address from branches where status = 'active' order by is_primary desc, created_at limit 1`;
    const view = await cartView(tx, cart?.id ?? null, branch.id);
    const acct = await activeAccount(tx, t.id);
    const [pol] = await tx<{ allowOnSite: boolean; policyText: string | null }[]>`select allow_on_site, policy_text from booking_policies limit 1`;
    const cs = await commerceSettings(tx);
    const fulfillment = [...(cs.pickupEnabled ? ['pickup'] : []), ...(cs.deliveryEnabled ? ['delivery'] : [])];
    return {
      ...view, branch, payOnline: !!acct, payAtPickup: cs.pickupEnabled && !!pol?.allowOnSite, cashOnDelivery: cs.deliveryEnabled && cs.cashOnDelivery,
      fulfillment, deliveryInstructions: cs.deliveryInstructions, addresses: cs.deliveryEnabled ? await listAddresses(tx, c.user.userId) : [],
      returns: cs.returnsEnabled ? { windowDays: cs.returnWindowDays, policyText: cs.returnPolicyText } : null,
      policyText: pol?.policyText ?? null,
    };
  });
});
