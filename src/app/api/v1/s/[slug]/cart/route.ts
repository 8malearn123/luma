import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { cartLineInput, removeCartLine, setCartLine } from '@/server/commerce/orders';
import { publicTenant, runPublic } from '@/server/booking/customer';
import { cartView, primaryBranch, resolveCart, setCartCookie } from '@/server/booking/cart';

export const GET = api.public<{ slug: string }>(async (c) => {
  const t = await publicTenant(c.params.slug);
  const branch = c.req.nextUrl.searchParams.get('branchId');
  return runPublic(t, c.user?.userId ?? null, async (tx) => {
    const { cartId } = await resolveCart(tx, t.id, c, false);
    return cartView(tx, cartId, await primaryBranch(tx, branch));
  });
});

/** Set a line's quantity (add or update). */
export const POST = api.public<{ slug: string }>(
  async (c) => {
    const t = await publicTenant(c.params.slug);
    const line = await c.json(cartLineInput.extend({ branchId: z.string().uuid().nullable().optional() }));
    const { view, newKey } = await runPublic(t, c.user?.userId ?? null, async (tx) => {
      const r = await resolveCart(tx, t.id, c, true);
      await setCartLine(tx, t.id, r.cartId!, line);
      return { view: await cartView(tx, r.cartId, await primaryBranch(tx, line.branchId)), newKey: r.newKey };
    });
    const res = NextResponse.json(view);
    if (newKey) setCartCookie(res, newKey);
    return res;
  },
  { rateLimit: [120, 60] },
);

export const DELETE = api.public<{ slug: string }>(async (c) => {
  const t = await publicTenant(c.params.slug);
  const b = await c.json(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional() }));
  return runPublic(t, c.user?.userId ?? null, async (tx) => {
    const { cartId } = await resolveCart(tx, t.id, c, false);
    if (cartId) await removeCartLine(tx, cartId, b.productId, b.variantId ?? null);
    return cartView(tx, cartId, await primaryBranch(tx, null));
  });
});
