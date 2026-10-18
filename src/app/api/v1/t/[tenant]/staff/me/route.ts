import { api } from '@/server/http/handler';
import { forbidden } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getStaff, updateOwnProfile } from '@/server/services/team';
import { selfProfileInput } from '@/lib/validation/team';

/** A specialist's own profile. Only bio, photo and English name are editable. */
export const GET = api.tenant(['staff.self_profile', 'schedule.self'], async (c) => {
  if (!c.t.staffProfileId) throw forbidden();
  const s = await tx(c.t, (db) => getStaff(db, c.t.staffProfileId!));
  return { staff: s };
});

export const PATCH = api.tenant('staff.self_profile', async (c) => {
  const body = await c.json(selfProfileInput.strict());
  await tx(c.t, (db) => updateOwnProfile(db, c.t, body));
  return { ok: true };
});
