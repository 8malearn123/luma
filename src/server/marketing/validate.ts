import type { Snapshot } from './snapshot';
import type { Loc, RecommendationContent } from './recommendations';

/**
 * Numeric-claim validation (spec §29 step 5). A number stated in a *claim*
 * field (title, opportunity, measured metrics) must match a snapshot value
 * (as-is, as a percentage of a ratio, or as SAR of a minor amount). Numbers in
 * proposals (timing, targets, experiment design) are not claims about the data.
 */
const NUM = /-?\d+(?:[.,]\d+)?/g;

export function supportedNumbers(s: Snapshot): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    for (const v of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100]) out.add(String(v));
  };
  for (const [k, v] of Object.entries(s.index)) {
    add(v);
    if (v > 0 && v <= 1 && !k.endsWith('_min')) add(v * 100); // ratios as percentages
    if (k.endsWith('_minor')) add(v / 100); // minor → SAR
  }
  // methodology constants used in rule wording (analysis windows, cadence multiplier)
  for (const c of [1.5, 7, 14, 30, 60, 90]) add(c);
  add(s.costs.servicesWithCost);
  add(s.costs.servicesTotal);
  return out;
}

export function numbersIn(text: string): string[] {
  const t = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return (t.match(NUM) ?? []).map((x) => String(Number(x.replace(',', '.'))));
}

export interface ClaimCheck {
  unsupportedClaims: string[];
  metricMismatches: string[];
  ok: boolean;
}

export function checkClaims(s: Snapshot, rec: Pick<RecommendationContent, 'title' | 'opportunity' | 'measured_metrics'>): ClaimCheck {
  const ok = supportedNumbers(s);
  const texts: Loc[] = [rec.title, rec.opportunity];
  const unsupported = new Set<string>();
  for (const l of texts) for (const lang of [l.ar, l.en]) for (const n of numbersIn(lang ?? '')) if (!ok.has(n)) unsupported.add(n);
  const mism: string[] = [];
  for (const [k, v] of Object.entries(rec.measured_metrics)) {
    if (!(k in s.index) || Math.abs(s.index[k] - v) > 1e-6) mism.push(k);
  }
  return { unsupportedClaims: [...unsupported], metricMismatches: mism, ok: unsupported.size === 0 && mism.length === 0 };
}

/** Margin rule: with unknown costs nothing may be asserted profitable. */
export function enforceMargin(s: Snapshot, rec: RecommendationContent): { rec: RecommendationContent; corrected: boolean } {
  const touchesPrice = ['packages', 'cross_sell', 'pricing_review', 'service_promotion', 'quiet_periods', 'reactivation', 'loyalty'].includes(rec.category);
  if (touchesPrice && rec.margin_check.status === 'ok') {
    const costKeys = Object.keys(rec.measured_metrics).filter((k) => k.endsWith('material_cost_minor'));
    const knownForAll = rec.category === 'packages' || rec.category === 'cross_sell' ? costKeys.length >= 2 : s.costs.complete || costKeys.length > 0;
    if (!knownForAll) {
      return {
        rec: { ...rec, margin_check: { status: 'unknown', note: { ar: 'التكاليف غير متوفرة — لا يمكن تأكيد الربحية.', en: 'Costs unavailable — profitability cannot be asserted.' } } },
        corrected: true,
      };
    }
  }
  return { rec, corrected: false };
}
