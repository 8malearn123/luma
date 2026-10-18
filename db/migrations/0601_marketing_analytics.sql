-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0601 — analytics & marketing configuration (workstream E)
-- ═══════════════════════════════════════════════════════════════════════════

-- Employee-performance indicator configuration. Weights are NOT approved final
-- values: defaults are explicitly labeled test values and editable per tenant.
create table analytics_settings (
  tenant_id            uuid primary key references tenants(id) on delete cascade,
  performance_weights  jsonb not null default '{"satisfaction":0.3,"repeat":0.2,"punctuality":0.2,"complaints":0.15,"productivity":0.15}',
  weights_are_test_values boolean not null default true,
  min_sample_visits    int not null default 20 check (min_sample_visits between 1 and 1000),
  min_sample_reviews   int not null default 5 check (min_sample_reviews between 1 and 1000),
  shrinkage_enabled    boolean not null default true,
  shrinkage_prior_weight int not null default 10 check (shrinkage_prior_weight between 0 and 1000),
  updated_by           uuid references users(id),
  updated_at           timestamptz not null default now()
);
select app.enable_tenant_rls('analytics_settings');

-- link a recommendation/trend to the weekly plan it was added to
alter table trend_assessments add column plan_id uuid;
alter table trend_assessments add constraint trend_assessments_plan_fk foreign key (tenant_id, plan_id) references marketing_plans(tenant_id, id);

create index recommendations_tenant_status on recommendations(tenant_id, status, created_at desc);
create index campaign_recipients_customer on campaign_recipients(tenant_id, tenant_customer_id, created_at desc);
