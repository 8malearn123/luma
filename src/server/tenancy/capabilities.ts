/**
 * Capability catalog — the single source of truth for business permissions.
 * The migration runner syncs it into permissions / role_permissions.
 *
 * Effective capabilities of a membership =
 *   ROLE_DEFAULTS[role] ∪ (granted_caps ∩ delegable-to-role) − revoked_caps
 *
 * "If delegated" cells of the permissions matrix are delegable capabilities:
 * absent by default, grantable by the owner only to the listed roles.
 */
export type TenantRole = 'owner' | 'manager' | 'receptionist' | 'specialist' | 'finance';

export const ROLES: { key: TenantRole; nameAr: string; nameEn: string }[] = [
  { key: 'owner', nameAr: 'المالكة', nameEn: 'Owner' },
  { key: 'manager', nameAr: 'المديرة', nameEn: 'Manager' },
  { key: 'receptionist', nameAr: 'الاستقبال', nameEn: 'Receptionist' },
  { key: 'specialist', nameAr: 'الأخصائية', nameEn: 'Specialist' },
  { key: 'finance', nameAr: 'المالية', nameEn: 'Finance' },
];

interface PermDef {
  key: string;
  category: string;
  description: string;
  delegableTo: readonly TenantRole[];
}

const def = (key: string, category: string, description: string, delegableTo: readonly TenantRole[] = []): PermDef => ({
  key,
  category,
  description,
  delegableTo,
});

export const PERMISSIONS = [
  // business & subscription
  def('tenant.settings.manage', 'business', 'Edit business profile, branches, policies'),
  def('ownership.transfer', 'business', 'Transfer ownership (owner only, never delegable)'),
  def('subscription.manage', 'subscription', 'Change plan / subscription', ['manager']),
  def('subscription.view', 'subscription', 'View subscription and invoices', ['manager', 'finance']),
  def('team.manage', 'team', 'Invite members, change roles (never to owner)', ['manager']),
  def('audit.view', 'business', 'View the business audit log', ['manager']),
  // storefront
  def('storefront.edit', 'storefront', 'Edit storefront draft', ['manager', 'receptionist']),
  def('storefront.publish', 'storefront', 'Publish / roll back storefront', ['manager']),
  // catalog & people
  def('catalog.manage', 'catalog', 'Create/edit services, categories, packages, products', ['manager', 'receptionist']),
  def('catalog.price.approve', 'catalog', 'Approve price changes', ['manager']),
  def('staff.manage', 'team', 'Create/edit staff profiles and service assignments', ['manager']),
  def('staff.self_profile', 'team', 'Edit allowed fields of own staff profile'),
  def('schedule.manage', 'team', 'Edit schedules, overrides, blocked time'),
  def('schedule.self', 'team', 'View own schedule'),
  def('hr.manage', 'team', 'Approve leave/requests, correct attendance'),
  def('hr.self', 'team', 'Clock in/out, submit own leave & requests'),
  // bookings & customers
  def('bookings.manage', 'bookings', 'Create/edit/transition any booking of the business'),
  def('bookings.view_assigned', 'bookings', 'View & act on bookings assigned to me'),
  def('bookings.view_financial', 'bookings', 'Read-only booking view for financial purposes'),
  def('customers.view', 'customers', 'View business customers and visit history'),
  def('customers.notes', 'customers', 'Read/write private customer notes'),
  def('waitlist.manage', 'bookings', 'Manage waitlist and offers'),
  def('reviews.respond', 'bookings', 'Respond to / moderate reviews', ['manager']),
  // commerce
  def('orders.manage', 'commerce', 'Manage orders and fulfillment'),
  def('inventory.manage', 'commerce', 'Stock receipts, adjustments, recipes', ['receptionist']),
  def('payments.collect', 'finance', 'Record on-site collection (cash/terminal)'),
  def('payments.configure', 'finance', 'Connect payment provider / methods'),
  def('refunds.issue', 'finance', 'Issue refunds', ['manager']),
  def('finance.view', 'finance', 'View costs, profit, commissions, financial reports', ['manager']),
  def('finance.export', 'finance', 'Export financial data', ['manager']),
  def('expenses.manage', 'finance', 'Record expenses', ['manager']),
  // policy
  def('incidents.submit', 'policy', 'Submit customer incidents', ['manager', 'receptionist', 'specialist']),
  def('incidents.review', 'policy', 'Review incidents & tenant-scope decisions', ['manager']),
  // marketing & growth
  def('marketing.view', 'marketing', 'View Loom Marketing plans & recommendations', ['manager']),
  def('marketing.manage', 'marketing', 'Request analyses, edit plans, draft campaigns', ['manager']),
  def('campaign.approve', 'marketing', 'Approve plans and campaigns for sending', ['manager']),
  def('loyalty.manage', 'growth', 'Loyalty rules, coupons, gift cards, memberships', ['manager']),
  def('analytics.view', 'growth', 'Store analytics and performance indicators', ['manager']),
] as const satisfies readonly PermDef[];

export type Capability = (typeof PERMISSIONS)[number]['key'];

const ALL = PERMISSIONS.map((p) => p.key) as Capability[];

export const ROLE_DEFAULTS: Record<TenantRole, Capability[]> = {
  owner: ALL,
  manager: [
    'bookings.manage',
    'customers.view',
    'customers.notes',
    'waitlist.manage',
    'orders.manage',
    'inventory.manage',
    'payments.collect',
    'schedule.manage',
    'schedule.self',
    'hr.manage',
    'hr.self',
    'analytics.view',
    'staff.self_profile',
  ],
  receptionist: [
    'bookings.manage',
    'customers.view',
    'customers.notes',
    'waitlist.manage',
    'orders.manage',
    'payments.collect',
    'hr.self',
    'schedule.self',
  ],
  specialist: ['bookings.view_assigned', 'schedule.self', 'staff.self_profile', 'hr.self'],
  finance: ['finance.view', 'finance.export', 'refunds.issue', 'bookings.view_financial', 'expenses.manage', 'hr.self'],
};

const BY_KEY = new Map(PERMISSIONS.map((p) => [p.key as string, p as PermDef]));

export function isCapability(k: string): k is Capability {
  return BY_KEY.has(k);
}

export function canDelegate(cap: string, role: TenantRole): boolean {
  const p = BY_KEY.get(cap);
  return !!p && p.delegableTo.includes(role);
}

export function effectiveCapabilities(role: TenantRole, granted: string[], revoked: string[]): Set<Capability> {
  const caps = new Set<Capability>(ROLE_DEFAULTS[role]);
  if (role !== 'owner') {
    for (const g of granted) if (isCapability(g) && canDelegate(g, role)) caps.add(g);
  }
  for (const r of revoked) {
    // the owner can never lose ownership-level capabilities
    if (role === 'owner') continue;
    if (isCapability(r)) caps.delete(r);
  }
  return caps;
}

// ─────────────────────────────────────────────────────────────
// Platform (LUMA administration) capabilities — least privilege
// ─────────────────────────────────────────────────────────────
export type PlatformRole = 'platform_owner' | 'support_admin' | 'policy_reviewer' | 'tech_admin';
export type PlatformCapability =
  | 'platform.tenants.view'
  | 'platform.tenants.manage'
  | 'platform.users.manage'
  | 'platform.plans.manage'
  | 'platform.templates.manage'
  | 'platform.support.access'
  | 'platform.policy.review'
  | 'platform.policy.suspend'
  | 'platform.audit.view'
  | 'platform.integrations.view'
  | 'platform.ai_usage.view'
  | 'platform.revenue.view';

export const PLATFORM_ROLE_CAPS: Record<PlatformRole, PlatformCapability[]> = {
  platform_owner: [
    'platform.tenants.view',
    'platform.tenants.manage',
    'platform.users.manage',
    'platform.plans.manage',
    'platform.templates.manage',
    'platform.support.access',
    'platform.policy.review',
    'platform.policy.suspend',
    'platform.audit.view',
    'platform.integrations.view',
    'platform.ai_usage.view',
    'platform.revenue.view',
  ],
  support_admin: ['platform.tenants.view', 'platform.support.access', 'platform.audit.view'],
  policy_reviewer: ['platform.policy.review'],
  tech_admin: ['platform.integrations.view', 'platform.ai_usage.view', 'platform.tenants.view'],
};

/** Capabilities granted inside a tenant through a time-limited support grant. */
export const SUPPORT_READ_CAPS: Capability[] = [
  'customers.view',
  'bookings.view_financial',
  'analytics.view',
  'marketing.view',
  'subscription.view',
];
export const SUPPORT_WRITE_CAPS: Capability[] = [
  ...SUPPORT_READ_CAPS,
  'storefront.edit',
  'storefront.publish',
  'catalog.manage',
  'staff.manage',
  'bookings.manage',
  'schedule.manage',
];
