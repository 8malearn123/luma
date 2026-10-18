-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0006 — incidents, reviews of incidents, policy rules & decisions, appeals
--
-- Principles: no public blacklist; a single report never changes platform-wide
-- eligibility; decisions are made by authorized humans, expire, and can be
-- appealed; customers never see other salons' reports.
-- ═══════════════════════════════════════════════════════════════════════════

create table customer_incidents (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  booking_id         uuid not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  type               text not null check (type in ('no_show','late_cancellation','payment_dispute','conduct')),
  description        text not null check (length(description) between 10 and 2000),
  occurred_at        timestamptz not null,
  submitted_by       uuid not null references users(id),
  status             text not null default 'submitted' check (status in ('submitted','under_review','confirmed','rejected','corrected')),
  -- the business may only request platform review; it cannot decide it
  platform_review_requested boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);
-- same incident cannot be reported twice
create unique index incidents_once on customer_incidents(tenant_id, booking_id, type)
  where status <> 'rejected';

create table incident_evidence (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  incident_id uuid not null,
  kind        text not null check (kind in ('booking_event','asset','note')),
  ref         text not null,          -- booking_event id | asset id | short note
  added_by    uuid references users(id),
  created_at  timestamptz not null default now(),
  retain_until date not null default (current_date + 730),
  foreign key (tenant_id, incident_id) references customer_incidents(tenant_id, id)
);

create table incident_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  incident_id uuid not null,
  reviewer_user_id uuid not null references users(id),
  reviewer_scope text not null check (reviewer_scope in ('tenant','platform')),
  from_status text not null,
  to_status   text not null,
  note        text not null check (length(note) >= 5),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, incident_id) references customer_incidents(tenant_id, id)
);

-- configurable criteria (platform rows: tenant_id NULL). No final threshold is
-- invented: seeded rows are labeled experimental and only *suggest* review.
create table policy_rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  scope        text not null check (scope in ('tenant','platform')),
  name         text not null,
  incident_type text not null,
  min_confirmed_incidents int not null check (min_confirmed_incidents >= 1),
  window_days  int not null check (window_days between 1 and 730),
  min_distinct_tenants int not null default 1,
  suggested_action text not null check (suggested_action in ('require_deposit','require_full_payment','manual_approval')),
  is_experimental boolean not null default true,
  enabled      boolean not null default false,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  check ((scope = 'platform') = (tenant_id is null))
);

create table policy_decisions (
  id               uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references users(id),
  scope            text not null check (scope in ('tenant','platform')),
  tenant_id        uuid references tenants(id),
  action           text not null check (action in ('default','require_deposit','require_full_payment','manual_approval','suspend_account')),
  reason_code      text not null,
  reason_internal  text not null,
  customer_explanation text not null,
  evidence_refs    uuid[] not null default '{}',     -- incident ids
  reviewer_user_id uuid not null references users(id),
  reviewer_role    text not null,
  effective_at     timestamptz not null default now(),
  expires_at       timestamptz,
  review_at        timestamptz,
  supersedes_id    uuid references policy_decisions(id),
  status           text not null default 'active' check (status in ('active','superseded','revoked','expired')),
  is_experimental  boolean not null default false,
  created_at       timestamptz not null default now(),
  check ((scope = 'platform') = (tenant_id is null)),
  check (expires_at is null or expires_at > effective_at),
  check (action <> 'suspend_account' or scope = 'platform')
);
create index policy_decisions_customer on policy_decisions(customer_user_id, status);

create table appeals (
  id               uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references users(id),
  decision_id      uuid references policy_decisions(id),
  incident_id      uuid,
  tenant_id        uuid references tenants(id),
  statement        text not null check (length(statement) between 10 and 2000),
  status           text not null default 'submitted' check (status in ('submitted','under_review','upheld','overturned','withdrawn')),
  resolution_note  text,
  resolved_by      uuid references users(id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (decision_id is not null or incident_id is not null)
);
create unique index appeals_one_open_per_decision on appeals(decision_id) where status in ('submitted','under_review');

select app.enable_tenant_rls('customer_incidents');
select app.enable_tenant_rls('incident_evidence');
select app.enable_tenant_rls('incident_reviews');
select app.enable_tenant_rls('policy_rules', true);
-- policy_decisions / appeals span scopes; access is mediated by the policy service
-- (customers: own rows; tenants: own-scope rows only; platform reviewers: all).
