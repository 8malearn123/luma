import type { Tx } from '../db';
import { runAi, recordValidation } from '../ai/run';
import { buildSnapshot, saveSnapshot, type Snapshot } from './snapshot';
import { generateRuleRecommendations, type GenerationResult, type RecommendationContent } from './recommendations';
import { checkClaims, enforceMargin } from './validate';
import type { AiFailureCode } from '../ai/types';

/**
 * Recommendation pipeline (spec §29):
 *  1. caller verified tenant + capability; runAi verifies plan & budget
 *  2. trusted metric snapshot (saved, hashed)
 *  3. rule-based candidates (always available, even without AI)
 *  4. optional AI refinement through the server-side adapter (JSON schema)
 *  5. validation: numbers/metrics must match the snapshot; margin rule enforced;
 *     unsupported claims → AI wording discarded and the item flagged
 *  6. saved with provenance; previous proposals of the same category superseded
 *     only when the data materially changed
 *  7. proposals only — nothing is published or sent
 */
const str = { type: 'string' };
const strArr = { type: 'array', items: str };
export const REFINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'keep', 'title_ar', 'title_en', 'opportunity_ar', 'opportunity_en', 'suggested_action_ar', 'suggested_action_en', 'draft_text_ar', 'draft_text_en', 'experiment_design_ar', 'experiment_design_en', 'extra_limitations_ar', 'extra_limitations_en'],
        properties: {
          index: { type: 'integer' },
          keep: { type: 'boolean' },
          title_ar: str, title_en: str, opportunity_ar: str, opportunity_en: str, suggested_action_ar: str, suggested_action_en: str,
          draft_text_ar: str, draft_text_en: str, experiment_design_ar: str, experiment_design_en: str,
          extra_limitations_ar: strArr, extra_limitations_en: strArr,
        },
      },
    },
  },
};

interface RefineItem {
  index: number;
  keep: boolean;
  title_ar: string; title_en: string; opportunity_ar: string; opportunity_en: string; suggested_action_ar: string; suggested_action_en: string;
  draft_text_ar: string; draft_text_en: string; experiment_design_ar: string; experiment_design_en: string;
  extra_limitations_ar: string[]; extra_limitations_en: string[];
}

export interface PipelineResult {
  snapshotId: string;
  snapshot: Snapshot;
  generation: GenerationResult;
  ai: { used: boolean; failure: AiFailureCode | null; runId: string | null; flagged: number; dropped: number };
  savedIds: string[];
}

export async function generateAndSaveRecommendations(
  tx: Tx,
  opts: { tenantId: string; userId: string | null; jobId?: string | null; horizon: 'weekly' | 'monthly'; fromDate: string; days: number; planPeriod?: { from: string; to: string }; useAi: boolean; signal?: AbortSignal },
): Promise<PipelineResult> {
  const snapshot = await buildSnapshot(tx, opts.tenantId, opts.fromDate, opts.days);
  const snapshotId = await saveSnapshot(tx, snapshot);
  const gen = generateRuleRecommendations(snapshot, opts.horizon, opts.planPeriod);
  const ai = { used: false, failure: null as AiFailureCode | null, runId: null as string | null, flagged: 0, dropped: 0 };
  let final: (RecommendationContent & { _validation: Record<string, unknown> })[] = gen.recommendations.map((r) => ({ ...r, _validation: { checked: 'rules' } }));

  if (opts.useAi && gen.recommendations.length && !gen.insufficientData) {
    const res = await runAi(tx, {
      tenantId: opts.tenantId,
      userId: opts.userId,
      jobId: opts.jobId,
      purpose: 'marketing_recommendations',
      promptId: 'marketing.recommendations@1',
      task: `Locale: ${snapshot.business.locale}. Refine these ${gen.recommendations.length} candidate recommendations (index = position). Keep numbers exactly as in the snapshot.`,
      data: {
        snapshot: { ...snapshot, services: snapshot.services.map((s) => ({ ...s, serviceId: undefined })), tenantId: undefined },
        candidates: gen.recommendations.map((r, i) => ({ index: i, category: r.category, title: r.title, opportunity: r.opportunity, suggested_action: r.suggested_action, measured_metrics: r.measured_metrics })),
      },
      schemaName: 'loom_refinement',
      schema: REFINE_SCHEMA,
      signal: opts.signal,
    });
    ai.runId = res.runId;
    if (!res.ok) ai.failure = res.code;
    else {
      ai.used = true;
      const items = ((res.output as { items?: RefineItem[] })?.items ?? []).filter((x) => Number.isInteger(x.index) && x.index >= 0 && x.index < gen.recommendations.length);
      const validation: Record<string, unknown>[] = [];
      final = gen.recommendations.flatMap((base, i): (RecommendationContent & { _validation: Record<string, unknown> })[] => {
        const it = items.find((x) => x.index === i);
        if (it && !it.keep) {
          ai.dropped++;
          return [];
        }
        if (!it) return [{ ...base, _validation: { checked: 'rules', ai: 'not_returned' } }];
        const refined: RecommendationContent = {
          ...base,
          title: { ar: it.title_ar, en: it.title_en },
          opportunity: { ar: it.opportunity_ar, en: it.opportunity_en },
          suggested_action: { ar: it.suggested_action_ar, en: it.suggested_action_en },
          draft_content: base.draft_content ? { ...base.draft_content, text: { ar: it.draft_text_ar, en: it.draft_text_en } } : null,
          experiment_design: { ar: it.experiment_design_ar, en: it.experiment_design_en },
          limitations: [...base.limitations, ...it.extra_limitations_ar.map((ar, j) => ({ ar, en: it.extra_limitations_en[j] ?? '' }))],
          provenance: { source_type: 'ai', provider: res.provider, model: res.model, prompt_version: res.promptVersion, snapshot_hash: snapshot.hash },
        };
        const claims = checkClaims(snapshot, refined);
        validation.push({ index: i, ...claims });
        if (!claims.ok) {
          ai.flagged++;
          // unsupported claims: keep the rule-based wording, flag for review
          return [{ ...base, _validation: { checked: 'ai_rejected', unsupportedClaims: claims.unsupportedClaims, metricMismatches: claims.metricMismatches, flagged: true } }];
        }
        return [{ ...refined, _validation: { checked: 'ai', ok: true } }];
      });
      await recordValidation(tx, res.runId, { items: validation, flagged: ai.flagged, dropped: ai.dropped });
    }
  }

  const savedIds: string[] = [];
  for (const r of final) {
    const { rec, corrected } = enforceMargin(snapshot, r);
    const { _validation, ...content } = rec as typeof r;
    const validation = { ..._validation, marginCorrected: corrected };
    // supersede older open proposals of the same category only when the data changed
    await tx`update recommendations set status = 'superseded'
             where category = ${content.category} and horizon = ${content.horizon} and status in ('proposed','deferred')
               and coalesce(provenance->>'snapshot_hash', '') <> ${snapshot.hash}`;
    const [dup] = await tx`select id from recommendations where category = ${content.category} and status = 'proposed' and provenance->>'snapshot_hash' = ${snapshot.hash} and title = ${content.title.ar}`;
    if (dup) continue;
    const [row] = await tx<{ id: string }[]>`
      insert into recommendations (tenant_id, category, horizon, title, content, validation, status, source_type, provenance, data_as_of, review_at, expires_at, ai_run_id)
      values (${opts.tenantId}, ${content.category}, ${content.horizon}, ${content.title.ar}, ${tx.json(content as never)}, ${tx.json(validation as never)},
              'proposed', ${content.provenance.source_type}, ${tx.json({ ...content.provenance, snapshot_id: snapshotId } as never)}, ${snapshot.dataAsOf},
              ${content.review_at}, ${content.expires_at}, ${content.provenance.source_type === 'ai' ? ai.runId : null})
      returning id`;
    savedIds.push(row.id);
  }
  return { snapshotId, snapshot, generation: { ...gen, recommendations: final }, ai, savedIds };
}
