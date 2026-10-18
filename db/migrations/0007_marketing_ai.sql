-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0007 — analytics, metric snapshots, Loom Marketing (plans,
-- recommendations, campaigns), trend radar, AI runs/usage, customization
-- ═══════════════════════════════════════════════════════════════════════════

create table analytics_events (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  event_id      uuid not null,           -- client-generated; dedup key
  type          text not null check (type in ('page_view','service_view','product_view','booking_start','checkout_start','booking_confirmed','order_paid','search','availability_miss')),
  session_hash  text not null,           -- pseudonymous (HMAC of a first-party cookie)
  visitor_hash  text,
  entity_type   text,
  entity_id     uuid,
  path          text,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  device        text not null default 'unknown' check (device in ('mobile','tablet','desktop','unknown')),
  is_bot        boolean not null default false,
  is_internal   boolean not null default false,  -- owner preview / builder / staff
  at            timestamptz not null default now(),
  unique (tenant_id, event_id)
);
create index analytics_events_tenant_at on analytics_events(tenant_id, at);

create table daily_metrics (
  tenant_id uuid not null references tenants(id) on delete cascade,
  day       date not null,
  metric    text not null,
  dimension text not null default '',
  value     numeric not null,
  primary key (tenant_id, day, metric, dimension)
);

create table metric_snapshots (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  kind         text not null,
  period_start date not null,
  period_end   date not null,
  data         jsonb not null,
  data_hash    text not null,
  data_as_of   timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);

create table marketing_preferences (
  tenant_id            uuid primary key references tenants(id) on delete cascade,
  goals                text[] not null default '{}',
  monthly_budget_minor bigint check (monthly_budget_minor >= 0),
  max_discount_bps     int not null default 1500 check (max_discount_bps between 0 and 9000),
  channels             text[] not null default '{instagram,whatsapp}',
  tone                 text,
  avoid_topics         text[] not null default '{}',
  weekly_enabled       boolean not null default false,
  monthly_enabled      boolean not null default false,
  weekly_run_weekday   smallint not null default 0 check (weekly_run_weekday between 0 and 6),
  photo_resources      text check (length(photo_resources) <= 500),
  updated_at           timestamptz not null default now()
);

create table marketing_plans (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  horizon            text not null check (horizon in ('monthly','weekly')),
  period_start       date not null,
  period_end         date not null,
  parent_plan_id     uuid,
  title              text not null,
  status             text not null default 'draft' check (status in ('draft','proposed','under_review','approved','in_progress','completed','deferred','rejected')),
  current_version    int not null default 1,
  source             text not null check (source in ('ai','manual','example')),
  is_example         boolean not null default false,
  created_by         uuid references users(id),
  approved_by        uuid references users(id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (period_end >= period_start),
  check (horizon = 'weekly' or parent_plan_id is null),
  unique (tenant_id, id),
  foreign key (tenant_id, parent_plan_id) references marketing_plans(tenant_id, id)
);

create table plan_versions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  plan_id     uuid not null,
  number      int not null,
  content     jsonb not null,       -- goal, baseline, initiatives, activities, budget, metrics
  change_note text,
  ai_run_id   uuid,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  unique (tenant_id, plan_id, number),
  foreign key (tenant_id, plan_id) references marketing_plans(tenant_id, id)
);
create trigger plan_versions_no_update before update on plan_versions
  for each row execute function app.page_versions_immutable();

create table plan_comments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  plan_id    uuid not null,
  author_id  uuid not null references users(id),
  body       text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, plan_id) references marketing_plans(tenant_id, id)
);

create table recommendations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  plan_id      uuid,
  category     text not null check (category in ('quiet_periods','reactivation','seasonal','service_promotion','packages','cross_sell','loyalty','content','pricing_review','booking_experience','campaign_review','capacity')),
  horizon      text not null check (horizon in ('weekly','monthly','ongoing')),
  title        text not null,
  content      jsonb not null,       -- full structured recommendation (see AI_AND_MARKETING.md)
  validation   jsonb not null default '{}',   -- unsupported claims, failed checks
  status       text not null default 'proposed' check (status in ('proposed','accepted','dismissed','deferred','expired','superseded')),
  source_type  text not null check (source_type in ('ai','rules','example')),
  provenance   jsonb not null default '{}',   -- provider, model, prompt_version, snapshot id
  data_as_of   timestamptz not null,
  review_at    timestamptz,
  expires_at   timestamptz,
  ai_run_id    uuid,
  decided_by   uuid references users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, plan_id) references marketing_plans(tenant_id, id)
);

create table campaign_segments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null,
  -- explainable, allowlisted conditions compiled server-side to parameterized SQL
  definition  jsonb not null,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create table campaigns (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  name              text not null,
  segment_id        uuid,
  channel           text not null check (channel in ('email','sms','whatsapp','instagram_post','in_app')),
  status            text not null default 'draft' check (status in ('draft','approved','scheduled','sending','sent','paused','failed','completed','cancelled')),
  content           jsonb not null default '{}',
  coupon_code       text,
  utm_campaign      text not null,
  scheduled_at      timestamptz,
  attribution_window_days int not null default 7 check (attribution_window_days between 1 and 60),
  holdout_bps       int not null default 0 check (holdout_bps between 0 and 5000),
  frequency_cap_days int not null default 7 check (frequency_cap_days between 1 and 90),
  quiet_hours       jsonb not null default '{"start":"22:00","end":"09:00"}',
  recommendation_id uuid,
  approved_by       uuid references users(id),
  approved_at       timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, utm_campaign),
  foreign key (tenant_id, segment_id) references campaign_segments(tenant_id, id),
  foreign key (tenant_id, recommendation_id) references recommendations(tenant_id, id)
);

create table campaign_recipients (
  tenant_id          uuid not null,
  campaign_id        uuid not null,
  tenant_customer_id uuid not null,
  arm                text not null check (arm in ('treatment','holdout')),
  status             text not null default 'pending' check (status in ('pending','suppressed','simulated','sent','failed')),
  reason             text,
  created_at         timestamptz not null default now(),
  primary key (tenant_id, campaign_id, tenant_customer_id),
  foreign key (tenant_id, campaign_id) references campaigns(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);

create table campaign_events (
  id          bigserial primary key,
  tenant_id   uuid not null,
  campaign_id uuid not null,
  kind        text not null check (kind in ('click','booking_attributed','order_attributed','opt_out','refund_adjustment')),
  ref_type    text,
  ref_id      uuid,
  value_minor bigint,
  dedupe_key  text,
  at          timestamptz not null default now(),
  foreign key (tenant_id, campaign_id) references campaigns(tenant_id, id)
);
create unique index campaign_events_dedupe on campaign_events(tenant_id, dedupe_key) where dedupe_key is not null;

create table trend_sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade,  -- NULL = platform-provided feed
  kind            text not null check (kind in ('rss','api','user_link')),
  name            text not null,
  url             text not null,
  status          text not null default 'disconnected' check (status in ('connected','disconnected','error')),
  last_fetched_at timestamptz,
  last_error      text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create table trend_observations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references tenants(id) on delete cascade,
  source_id        uuid references trend_sources(id) on delete set null,
  url              text not null,
  title            text not null,
  summary          text,
  published_at     timestamptz,
  observed_at      timestamptz not null default now(),
  region           text,
  topic            text,
  cluster_key      text,
  metrics          jsonb not null default '{}',   -- only values present in the source
  evidence_strength text not null check (evidence_strength in ('single_example','recurring','quantified')),
  content_hash     text not null,
  created_at       timestamptz not null default now()
);
create unique index trend_observations_dedupe on trend_observations(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), content_hash);

create table trend_assessments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  cluster_key      text not null,
  observation_ids  uuid[] not null,
  fit              text not null check (fit in ('good','partial','poor')),
  rationale        text not null,
  application_idea text,
  est_effort       text,
  est_cost         text,
  valid_until      date,
  ai_run_id        uuid,
  status           text not null default 'open' check (status in ('open','added_to_plan','dismissed')),
  created_at       timestamptz not null default now()
);

create table prompt_versions (
  id          text primary key,             -- e.g. 'marketing.monthly@1'
  purpose     text not null,
  template_sha256 text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create table ai_runs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  job_id         uuid references job_runs(id),
  purpose        text not null,
  provider       text not null,
  model          text,
  prompt_version text,
  status         text not null check (status in ('succeeded','failed','rejected','unavailable','cached')),
  error_code     text,
  input_hash     text not null,
  input_summary  jsonb not null default '{}',   -- redacted: no names/phones/secrets
  output         jsonb,
  validation     jsonb not null default '{}',
  tokens_in      int,
  tokens_out     int,
  cost_micro_usd bigint,                         -- NULL when pricing isn't documented
  latency_ms     int,
  cache_key      text,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  unique (tenant_id, id)
);
create index ai_runs_cache on ai_runs(tenant_id, cache_key) where status = 'succeeded';

create table ai_usage (
  tenant_id      uuid not null references tenants(id) on delete cascade,
  period         date not null,               -- first day of month
  runs           int not null default 0,
  tokens_in      bigint not null default 0,
  tokens_out     bigint not null default 0,
  cost_micro_usd bigint not null default 0,
  primary key (tenant_id, period)
);

create table customization_requests (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  prompt                text not null check (length(prompt) between 3 and 1000),
  patch                 jsonb,
  explanation           text,
  rejected_ops          jsonb not null default '[]',
  status                text not null check (status in ('proposed','applied','rejected','invalid','unavailable')),
  base_draft_version    int not null,
  applied_draft_version int,
  ai_run_id             uuid,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now(),
  decided_at            timestamptz
);

select app.enable_tenant_rls('analytics_events');
select app.enable_tenant_rls('daily_metrics');
select app.enable_tenant_rls('metric_snapshots');
select app.enable_tenant_rls('marketing_preferences');
select app.enable_tenant_rls('marketing_plans');
select app.enable_tenant_rls('plan_versions');
select app.enable_tenant_rls('plan_comments');
select app.enable_tenant_rls('recommendations');
select app.enable_tenant_rls('campaign_segments');
select app.enable_tenant_rls('campaigns');
select app.enable_tenant_rls('campaign_recipients');
select app.enable_tenant_rls('campaign_events');
select app.enable_tenant_rls('trend_sources', true);
select app.enable_tenant_rls('trend_observations', true);
select app.enable_tenant_rls('trend_assessments');
select app.enable_tenant_rls('ai_runs');
select app.enable_tenant_rls('ai_usage');
select app.enable_tenant_rls('customization_requests');
