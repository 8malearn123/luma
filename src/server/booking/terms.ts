import type { Tx } from '../db';

/**
 * Payment-options algorithm (spec §20):
 *  1. payment methods ACTUALLY available to the business (connected account + enabled methods; on-site per policy)
 *  2. business policy snapshot + active customer decisions (tenant scope and platform scope)
 *  3. compatible options; strictest active decision wins (suspend > manual > full > deposit > default)
 *  4. require_full excludes deposit/on-site — enforced here, never by the browser
 *  5. no compatible method → explicit contact/manual path (never silently weakened)
 *  6. internal reason recorded; customer gets an appropriate explanation + review route
 *  7. the computed terms are snapshotted on the hold; payment creation re-checks them
 */
export type TermKind = 'full' | 'deposit' | 'on_site' | 'manual_approval';
export type DecisionAction = 'default' | 'require_deposit' | 'require_full_payment' | 'manual_approval' | 'suspend_account';

export interface TermOption {
  kind: TermKind;
  dueNowMinor: number;
}

export interface ComputedTerms {
  options: TermOption[];
  blocked: boolean;
  /** when no option exists: contact the business / request manual approval */
  fallback: 'contact' | null;
  appliedAction: DecisionAction;
  decisionScope: 'tenant' | 'platform' | null;
  decisionIds: string[];
  reasonCode: string;
  customerExplanationKey: string;
  onlineMethods: string[];
  policyVersion: number;
  computedAt: string;
}

const STRICTNESS: Record<DecisionAction, number> = {
  default: 0,
  require_deposit: 1,
  require_full_payment: 2,
  manual_approval: 3,
  suspend_account: 4,
};

export function depositAmount(totalMinor: number, mode: string, value: number): number {
  if (mode === 'percent') return Math.min(totalMinor, Math.floor((totalMinor * value + 5000) / 10000)); // half-up on bps
  if (mode === 'fixed') return Math.min(totalMinor, value);
  return 0;
}

export interface TermsInputs {
  policy: { version: number; depositMode: string; depositValue: number; allowOnSite: boolean; allowFullOnline: boolean };
  onlineMethods: string[];
  decisions: { id: string; action: DecisionAction; scope: 'tenant' | 'platform' }[];
  totalMinor: number;
  now: Date;
}

/** Pure decision logic (unit-tested). */
export function decideTerms(i: TermsInputs): ComputedTerms {
  const strongest = i.decisions.reduce<TermsInputs['decisions'][number] | null>((best, d) => (!best || STRICTNESS[d.action] > STRICTNESS[best.action] ? d : best), null);
  const action: DecisionAction = strongest?.action ?? 'default';
  const online = i.onlineMethods.length > 0;
  const deposit = depositAmount(i.totalMinor, i.policy.depositMode, i.policy.depositValue);
  const base = {
    blocked: false,
    fallback: null as ComputedTerms['fallback'],
    appliedAction: action,
    decisionScope: strongest?.scope ?? null,
    decisionIds: i.decisions.map((d) => d.id),
    onlineMethods: i.onlineMethods,
    policyVersion: i.policy.version,
    computedAt: i.now.toISOString(),
  };
  const opts: TermOption[] = [];
  let reasonCode = 'business_policy';
  let expl = 'terms.explain_default';

  if (i.totalMinor === 0) {
    return { ...base, options: [{ kind: 'on_site', dueNowMinor: 0 }], reasonCode: 'free', customerExplanationKey: 'terms.explain_free' };
  }

  switch (action) {
    case 'suspend_account':
      return { ...base, options: [], blocked: true, fallback: 'contact', reasonCode: 'account_restricted', customerExplanationKey: 'terms.explain_suspended' };
    case 'manual_approval':
      return { ...base, options: [{ kind: 'manual_approval', dueNowMinor: 0 }], reasonCode: 'manual_approval_required', customerExplanationKey: 'terms.explain_manual' };
    case 'require_full_payment':
      if (online) opts.push({ kind: 'full', dueNowMinor: i.totalMinor });
      reasonCode = 'customer_requires_full_payment';
      expl = 'terms.explain_full_required';
      break;
    case 'require_deposit': {
      if (online) {
        // without a configured business deposit, the stricter full payment applies (no invented deposit rate)
        if (deposit > 0) opts.push({ kind: 'deposit', dueNowMinor: deposit });
        opts.push({ kind: 'full', dueNowMinor: i.totalMinor });
      }
      reasonCode = 'customer_requires_deposit';
      expl = 'terms.explain_deposit_required';
      break;
    }
    default: {
      if (i.policy.depositMode !== 'none' && deposit > 0) {
        if (online) {
          opts.push({ kind: 'deposit', dueNowMinor: deposit });
          if (i.policy.allowFullOnline) opts.push({ kind: 'full', dueNowMinor: i.totalMinor });
        }
        expl = 'terms.explain_business_deposit';
      } else {
        if (i.policy.allowOnSite) opts.push({ kind: 'on_site', dueNowMinor: 0 });
        if (online && i.policy.allowFullOnline) opts.push({ kind: 'full', dueNowMinor: i.totalMinor });
      }
    }
  }
  if (!opts.length) {
    return { ...base, options: [], fallback: 'contact', reasonCode: `${reasonCode}_no_method`, customerExplanationKey: 'terms.explain_no_method' };
  }
  return { ...base, options: opts, reasonCode, customerExplanationKey: expl };
}

export async function computePaymentTerms(tx: Tx, tenantId: string, customerUserId: string | null, totalMinor: number, now = new Date()): Promise<ComputedTerms> {
  const [policy] = await tx<{ version: number; depositMode: string; depositValue: number; allowOnSite: boolean; allowFullOnline: boolean }[]>`
    select version, deposit_mode, deposit_value, allow_on_site, allow_full_online from booking_policies limit 1`;
  const [acct] = await tx<{ methodsEnabled: string[]; provider: string }[]>`
    select methods_enabled, provider from payment_accounts where tenant_id = ${tenantId} and status = 'active' and provider <> 'manual' limit 1`;
  const decisions = customerUserId
    ? await tx<{ id: string; action: DecisionAction; scope: 'tenant' | 'platform' }[]>`
        select id, action, scope from policy_decisions
        where customer_user_id = ${customerUserId} and status = 'active' and effective_at <= ${now}
          and (expires_at is null or expires_at > ${now})
          and (scope = 'platform' or (scope = 'tenant' and tenant_id = ${tenantId}))`
    : [];
  return decideTerms({
    policy: policy ?? { version: 0, depositMode: 'none', depositValue: 0, allowOnSite: true, allowFullOnline: false },
    onlineMethods: acct?.methodsEnabled ?? [],
    decisions,
    totalMinor,
    now,
  });
}

/** Material change check between a snapshot and freshly computed terms. */
export function termsMateriallyChanged(prev: ComputedTerms, next: ComputedTerms, chosen: TermKind): boolean {
  const p = prev.options.find((o) => o.kind === chosen);
  const n = next.options.find((o) => o.kind === chosen);
  return !n || !p || n.dueNowMinor !== p.dueNowMinor || next.appliedAction !== prev.appliedAction;
}
