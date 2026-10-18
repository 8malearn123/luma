import { withTenant, type Tx } from '../db';
import { notFound } from '../errors';
import { tenantBySlug } from '../tenancy/context';
import { ensureTenantCustomer } from '../booking/service';

/**
 * Public (customer) access to one storefront's tenant scope. The tenant comes
 * from the published slug; the customer is the authenticated session user and
 * only ever sees her own rows.
 */
export async function withStorefront<T>(slug: string, userId: string, fn: (tx: Tx, tenantId: string) => Promise<T>): Promise<T> {
  const t = await tenantBySlug(slug);
  if (!t || t.status !== 'active') throw notFound('tenant');
  return withTenant({ tenantId: t.id, userId }, (tx) => fn(tx, t.id));
}

export async function myRelationship(tx: Tx, tenantId: string, userId: string, displayName: string) {
  return ensureTenantCustomer(tx, tenantId, { userId, displayName, source: 'waitlist' });
}
