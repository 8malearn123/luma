import { covers, MIN, type Interval } from './intervals';

/**
 * Pure itinerary search for one or more services (no I/O; unit-tested).
 *
 * - Items are performed in the given order, back to back, with an optional
 *   gap between items of 0..maxGap (in slot increments). Different items may
 *   be performed by different specialists.
 * - A specialist's occupation = [start − bufferBefore, end + bufferAfter) and
 *   must lie inside her free time; two items of one itinerary assigned to the
 *   same specialist (or resource) must not overlap including buffers.
 * - Required resources (by type × quantity) are chosen from free resources.
 * - Search is bounded (maxExpansions per start) so pathological inputs stay
 *   fast; among feasible itineraries for a start we keep the smallest total
 *   gap, then the best allocation rank.
 */
export interface StaffCandidate {
  staffId: string;
  durationMin: number;
  priceMinor: number;
}

export interface ResourceNeed {
  resourceTypeId: string;
  quantity: number;
  resourceIds: string[];
}

export interface PlanItem {
  key: number;
  serviceId: string;
  candidates: StaffCandidate[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  resourceNeeds: ResourceNeed[];
}

export interface PlannedItem {
  key: number;
  serviceId: string;
  staffId: string;
  startsAt: number;
  endsAt: number;
  occStart: number;
  occEnd: number;
  priceMinor: number;
  durationMin: number;
  resourceIds: string[];
}

export interface Itinerary {
  startsAt: number;
  endsAt: number;
  totalGapMin: number;
  items: PlannedItem[];
}

export interface PlanInput {
  items: PlanItem[];
  staffFree: Map<string, Interval[]>;
  resourceFree: Map<string, Interval[]>;
  candidateStarts: number[];
  incrementMin: number;
  maxGapMin: number;
  /** lower = preferred (declared allocation rule) */
  staffRank: (staffId: string, dayKey: string) => number;
  dayKeyOf: (t: number) => string;
  maxExpansionsPerStart?: number;
  maxResults?: number;
}

interface Used {
  staff: Map<string, Interval[]>;
  res: Map<string, Interval[]>;
}

const overlapsAny = (list: Interval[] | undefined, s: number, e: number) => !!list?.some(([a, b]) => s < b && a < e);

function pickResources(needs: ResourceNeed[], free: Map<string, Interval[]>, used: Used, s: number, e: number): string[] | null {
  const picked: string[] = [];
  for (const need of needs) {
    let got = 0;
    for (const rid of need.resourceIds) {
      if (got >= need.quantity) break;
      if (picked.includes(rid)) continue;
      if (!covers(free.get(rid) ?? [], s, e)) continue;
      if (overlapsAny(used.res.get(rid), s, e)) continue;
      picked.push(rid);
      got++;
    }
    if (got < need.quantity) return null;
  }
  return picked;
}

export function planItineraries(input: PlanInput): Itinerary[] {
  const results: Itinerary[] = [];
  const maxExp = input.maxExpansionsPerStart ?? 3000;
  const maxResults = input.maxResults ?? 500;
  const gapSteps: number[] = [];
  for (let g = 0; g <= input.maxGapMin; g += input.incrementMin) gapSteps.push(g);

  for (const start of input.candidateStarts) {
    if (results.length >= maxResults) break;
    const day = input.dayKeyOf(start);
    let best: Itinerary | null = null;
    let bestScore = Infinity;
    let expansions = 0;
    const chosen: PlannedItem[] = [];
    const used: Used = { staff: new Map(), res: new Map() };

    const dfs = (idx: number, earliest: number, gapSoFar: number, rankSoFar: number) => {
      if (expansions++ > maxExp) return;
      if (idx === input.items.length) {
        const score = gapSoFar * 1000 + rankSoFar;
        if (score < bestScore) {
          bestScore = score;
          best = {
            startsAt: chosen[0].startsAt,
            endsAt: chosen[chosen.length - 1].endsAt,
            totalGapMin: gapSoFar,
            items: chosen.map((c) => ({ ...c, resourceIds: [...c.resourceIds] })),
          };
        }
        return;
      }
      const item = input.items[idx];
      const gaps = idx === 0 ? [0] : gapSteps;
      for (const g of gaps) {
        if (gapSoFar + g >= bestScore / 1000 && best) break; // cannot beat current best gap
        const s = earliest + g * MIN;
        const cands = [...item.candidates].sort((a, b) => input.staffRank(a.staffId, day) - input.staffRank(b.staffId, day));
        for (const c of cands) {
          const e = s + c.durationMin * MIN;
          const os = s - item.bufferBeforeMin * MIN;
          const oe = e + item.bufferAfterMin * MIN;
          if (!covers(input.staffFree.get(c.staffId) ?? [], os, oe)) continue;
          if (overlapsAny(used.staff.get(c.staffId), os, oe)) continue;
          const res = item.resourceNeeds.length ? pickResources(item.resourceNeeds, input.resourceFree, used, os, oe) : [];
          if (!res) continue;
          chosen.push({ key: item.key, serviceId: item.serviceId, staffId: c.staffId, startsAt: s, endsAt: e, occStart: os, occEnd: oe, priceMinor: c.priceMinor, durationMin: c.durationMin, resourceIds: res });
          const sl = used.staff.get(c.staffId) ?? [];
          sl.push([os, oe]);
          used.staff.set(c.staffId, sl);
          for (const r of res) {
            const rl = used.res.get(r) ?? [];
            rl.push([os, oe]);
            used.res.set(r, rl);
          }
          dfs(idx + 1, e, gapSoFar + g, rankSoFar + input.staffRank(c.staffId, day));
          chosen.pop();
          sl.pop();
          for (const r of res) used.res.get(r)!.pop();
          if (bestScore === 0 && best) return; // perfect: no gap, best ranks
        }
      }
    };
    dfs(0, start, 0, 0);
    if (best) results.push(best);
  }
  return results;
}
