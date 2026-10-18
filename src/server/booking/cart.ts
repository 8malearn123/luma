import type { NextRequest, NextResponse } from 'next/server';
import type { Tx } from '../db';
import { AppError } from '../errors';
import type { BaseCtx } from '../http/handler';
import { adoptCart, getOrCreateCart, priceCart } from '../commerce/orders';
import { randomToken } from '../crypto';
import { secureCookies } from '../env';

/** Anonymous cart key: random, httpOnly, per-browser. Only its hash is stored. */
export const CART_COOKIE = 'luma_cart';

export function readCartKey(req: NextRequest): string | null {
  const v = req.cookies.get(CART_COOKIE)?.value;
  return v && /^[A-Za-z0-9_-]{20,64}$/.test(v) ? v : null;
}

export function ensureCartKey(req: NextRequest): { key: string; isNew: boolean } {
  const k = readCartKey(req);
  return k ? { key: k, isNew: false } : { key: randomToken(24), isNew: true };
}

export function setCartCookie(res: NextResponse, key: string) {
  res.cookies.set(CART_COOKIE, key, { httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
}

export async function primaryBranch(tx: Tx, requested?: string | null) {
  const [b] = requested
    ? await tx<{ id: string }[]>`select id from branches where id = ${requested} and status = 'active'`
    : await tx<{ id: string }[]>`select id from branches where status = 'active' order by is_primary desc, created_at limit 1`;
  if (!b) throw new AppError('validation', 'errors.invalid_reference');
  return b.id;
}

/** Resolve the cart for this browser/user; an anonymous cart is adopted after sign-in. */
export async function resolveCart(tx: Tx, tenantId: string, c: BaseCtx, create: boolean): Promise<{ cartId: string | null; newKey: string | null }> {
  const anon = readCartKey(c.req);
  if (c.user) {
    if (anon) await adoptCart(tx, tenantId, anon, c.user.userId);
    const [existing] = await tx<{ id: string }[]>`select id from carts where user_id = ${c.user.userId} and status = 'open' and expires_at > now() order by created_at desc limit 1`;
    if (existing) return { cartId: existing.id, newKey: null };
    return create ? { cartId: await getOrCreateCart(tx, tenantId, { userId: c.user.userId }), newKey: null } : { cartId: null, newKey: null };
  }
  if (!anon && !create) return { cartId: null, newKey: null };
  const k = ensureCartKey(c.req);
  return { cartId: await getOrCreateCart(tx, tenantId, { anonKey: k.key }), newKey: k.isNew ? k.key : null };
}

export async function cartView(tx: Tx, cartId: string | null, branchId: string) {
  if (!cartId) return { lines: [], subtotalMinor: 0, priceChanged: false, ok: false, branchId };
  const q = await priceCart(tx, cartId, branchId);
  // never expose cost to customers
  return { ...q, lines: q.lines.map(({ unitCostMinor: _c, inventoryItemId: _i, ...l }) => l), branchId };
}

