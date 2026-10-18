import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { AppError, notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { addPlanVersion, getPlan, type PlanContent } from '@/server/marketing/plans';

const loc = z.object({ ar: z.string().max(600), en: z.string().max(600) });
const activity = z.object({ id: z.string().max(60), title: loc, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), channel: z.string().max(30).nullable(), ownerRole: z.enum(['owner', 'manager', 'receptionist']), status: z.enum(['planned', 'done', 'skipped']), recommendationId: z.string().uuid().nullable().optional(), trendAssessmentId: z.string().uuid().nullable().optional() });
const edit = z.object({
  note: z.string().trim().min(1).max(300),
  goal: loc,
  initiatives: z.array(z.object({ id: z.string().max(60), title: loc, recommendationId: z.string().uuid().nullable(), activities: z.array(activity).max(20) })).max(20),
  budgetMinor: z.number().int().min(0).nullable(),
});

export const GET = api.tenant<{ id: string }>('marketing.view', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, (db) => getPlan(db, c.params.id));
});

/** Owner edit → new immutable version (proposal if the plan is already approved). */
export const PATCH = api.tenant<{ id: string }>('marketing.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(edit);
  return tx(c.t, async (db) => {
    const { current, plan } = await getPlan(db, c.params.id);
    const content: PlanContent = { ...current.content, goal: b.goal, initiatives: b.initiatives, budget: { ...current.content.budget, amountMinor: b.budgetMinor }, provenance: { ...current.content.provenance, source_type: 'manual' } };
    for (const i of content.initiatives) for (const a of i.activities) if (a.date < plan.periodStart || a.date > plan.periodEnd) throw new AppError('validation', 'errors.date_outside_plan');
    return addPlanVersion(db, c.t, c.params.id, content, b.note);
  });
});
