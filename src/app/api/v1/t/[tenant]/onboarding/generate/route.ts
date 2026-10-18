import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { generateFromAnswers } from '@/server/services/onboarding';

/** Deterministic first storefront draft from onboarding answers (works without AI). Never publishes. */
export const POST = api.tenant(
  'tenant.settings.manage',
  async (c) => {
    const b = await c.json(z.object({ overwrite: z.boolean().default(false) }));
    const r = await tx(c.t, (db) => generateFromAnswers(db, c.t, b));
    return { draftVersion: r.draftVersion, builder: `/app/${c.t.tenant.slug}/builder` };
  },
  { idempotent: true },
);
