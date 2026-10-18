import { z } from 'zod';
import { api } from '@/server/http/handler';
import { createTenant, createTenantSchema } from '@/server/services/tenants';
import { ensureExpertStaff } from '@/server/services/onboarding';
import { resolveTenantContext, tx } from '@/server/tenancy/context';

/**
 * Create a business. Trusted transaction: the authenticated caller becomes
 * the owner; no role is accepted from the browser.
 */
export const POST = api.user(
  async (c) => {
    const body = await c.json(createTenantSchema.extend({ branchName: z.string().trim().min(1).max(120).optional() }));
    const r = await createTenant(c.user, body, { requestId: c.requestId });
    if (body.businessType === 'expert') {
      const ctx = await resolveTenantContext(c.user, r.slug, c.requestId, c.ip);
      await tx(ctx, (db) => ensureExpertStaff(db, ctx));
    }
    return { tenantId: r.tenantId, slug: r.slug, next: `/onboarding/${r.slug}` };
  },
  { idempotent: true, rateLimit: [10, 3600] },
);
