import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { audit } from '@/server/audit';

const body = z.object({
  goals: z.array(z.string().max(80)).max(10),
  monthlyBudgetMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
  maxDiscountBps: z.number().int().min(0).max(9000),
  channels: z.array(z.enum(['instagram', 'whatsapp', 'sms', 'email', 'tiktok', 'snapchat', 'x'])).max(7),
  tone: z.string().max(200).nullable(),
  avoidTopics: z.array(z.string().max(80)).max(20),
  weeklyEnabled: z.boolean(),
  monthlyEnabled: z.boolean(),
  weeklyRunWeekday: z.number().int().min(0).max(6),
  photoResources: z.string().max(500).nullable(),
});

export const GET = api.tenant('marketing.view', async (c) => tx(c.t, async (db) => (await db`select * from marketing_preferences limit 1`)[0] ?? null));

export const PUT = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(body);
  return tx(c.t, async (db) => {
    await db`insert into marketing_preferences (tenant_id) values (${c.t.tenant.id}) on conflict do nothing`;
    await db`update marketing_preferences set goals = ${b.goals}, monthly_budget_minor = ${b.monthlyBudgetMinor}, max_discount_bps = ${b.maxDiscountBps},
             channels = ${b.channels}, tone = ${b.tone}, avoid_topics = ${b.avoidTopics}, weekly_enabled = ${b.weeklyEnabled}, monthly_enabled = ${b.monthlyEnabled},
             weekly_run_weekday = ${b.weeklyRunWeekday}, photo_resources = ${b.photoResources}, updated_at = now()`;
    await audit(db, { actorUserId: c.user.userId, actorKind: c.t.actorKind, tenantId: c.t.tenant.id, action: 'marketing.preferences_updated', requestId: c.requestId });
    return { ok: true };
  });
});
