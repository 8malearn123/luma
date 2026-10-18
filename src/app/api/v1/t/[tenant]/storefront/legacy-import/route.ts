import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { getDraft, saveDraft } from '@/server/storefront/drafts';
import { importLegacy, legacyInputSchema } from '@/server/storefront/legacy-import';
import { updateProfile } from '@/server/storefront/profile';

/** Owner-triggered import of the legacy browser settings. Creates a DRAFT only; never publishes. */
export const POST = api.tenant('storefront.edit', async (c) => {
  const b = await c.json(z.object({ data: legacyInputSchema, expectedVersion: z.number().int(), importProfile: z.boolean().default(true) }));
  return tx(c.t, async (db) => {
    const r = importLegacy(b.data, c.t.tenant.name, c.t.tenant.businessType);
    const saved = await saveDraft(db, c.t, r.document, b.expectedVersion, { source: 'legacy_import', note: r.precedence.join('; ') });
    if (b.importProfile && c.t.caps.has('tenant.settings.manage')) {
      await updateProfile(db, c.t, { tagline: r.profile.tagline ?? null, intro: r.profile.intro ?? null, contactPhone: r.profile.contactPhone ?? null, address: r.profile.address ?? null, socials: r.profile.socials });
    }
    const d = await getDraft(db);
    return { version: d.version, precedence: r.precedence, issues: saved.issues };
  });
}, { idempotent: true });
