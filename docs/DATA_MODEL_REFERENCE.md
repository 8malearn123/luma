# Data model reference (generated)

Generated from the migrated schema by `scripts/gen-data-model.ts`. Do not edit by hand.

Tables: 137. RLS-enabled: 113.

## ai_runs · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| job_id | uuid | yes |  |
| purpose | text |  |  |
| provider | text |  |  |
| model | text | yes |  |
| prompt_version | text | yes |  |
| status | text |  |  |
| error_code | text | yes |  |
| input_hash | text |  |  |
| input_summary | jsonb |  | '{}'::jsonb |
| output | jsonb | yes |  |
| validation | jsonb |  | '{}'::jsonb |
| tokens_in | integer | yes |  |
| tokens_out | integer | yes |  |
| cost_micro_usd | bigint | yes |  |
| latency_ms | integer | yes |  |
| cache_key | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `ai_runs_status_check`: CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'rejected'::text, 'unavailable'::text, 'cached'::text])))
- `ai_runs_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `ai_runs_job_id_fkey`: FOREIGN KEY (job_id) REFERENCES job_runs(id)
- `ai_runs_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `ai_runs_pkey`: PRIMARY KEY (id)
- `ai_runs_tenant_id_id_key`: UNIQUE (tenant_id, id)

## ai_usage · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| period | date |  |  |
| runs | integer |  | 0 |
| tokens_in | bigint |  | 0 |
| tokens_out | bigint |  | 0 |
| cost_micro_usd | bigint |  | 0 |

Constraints:
- `ai_usage_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `ai_usage_pkey`: PRIMARY KEY (tenant_id, period)

## analytics_events · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('analytics_events_id_seq'::regclass) |
| tenant_id | uuid |  |  |
| event_id | uuid |  |  |
| type | text |  |  |
| session_hash | text |  |  |
| visitor_hash | text | yes |  |
| entity_type | text | yes |  |
| entity_id | uuid | yes |  |
| path | text | yes |  |
| referrer_host | text | yes |  |
| utm_source | text | yes |  |
| utm_medium | text | yes |  |
| utm_campaign | text | yes |  |
| device | text |  | 'unknown'::text |
| is_bot | boolean |  | false |
| is_internal | boolean |  | false |
| at | timestamp with time zone |  | now() |

Constraints:
- `analytics_events_device_check`: CHECK ((device = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text, 'unknown'::text])))
- `analytics_events_type_check`: CHECK ((type = ANY (ARRAY['page_view'::text, 'service_view'::text, 'product_view'::text, 'booking_start'::text, 'checkout_start'::text, 'booking_confirmed'::text, 'order_paid'::text, 'search'::text, 'availability_miss'::
- `analytics_events_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `analytics_events_pkey`: PRIMARY KEY (id)
- `analytics_events_tenant_id_event_id_key`: UNIQUE (tenant_id, event_id)

## analytics_settings · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| performance_weights | jsonb |  | '{"repeat": 0.2, "complaints": 0.15, "punctuality": 0.2, "pr |
| weights_are_test_values | boolean |  | true |
| min_sample_visits | integer |  | 20 |
| min_sample_reviews | integer |  | 5 |
| shrinkage_enabled | boolean |  | true |
| shrinkage_prior_weight | integer |  | 10 |
| updated_by | uuid | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `analytics_settings_min_sample_reviews_check`: CHECK (((min_sample_reviews >= 1) AND (min_sample_reviews <= 1000)))
- `analytics_settings_min_sample_visits_check`: CHECK (((min_sample_visits >= 1) AND (min_sample_visits <= 1000)))
- `analytics_settings_shrinkage_prior_weight_check`: CHECK (((shrinkage_prior_weight >= 0) AND (shrinkage_prior_weight <= 1000)))
- `analytics_settings_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `analytics_settings_updated_by_fkey`: FOREIGN KEY (updated_by) REFERENCES users(id)
- `analytics_settings_pkey`: PRIMARY KEY (tenant_id)

## appeals

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| customer_user_id | uuid |  |  |
| decision_id | uuid | yes |  |
| incident_id | uuid | yes |  |
| tenant_id | uuid | yes |  |
| statement | text |  |  |
| status | text |  | 'submitted'::text |
| resolution_note | text | yes |  |
| resolved_by | uuid | yes |  |
| resolved_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `appeals_check`: CHECK (((decision_id IS NOT NULL) OR (incident_id IS NOT NULL)))
- `appeals_statement_check`: CHECK (((length(statement) >= 10) AND (length(statement) <= 2000)))
- `appeals_status_check`: CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'upheld'::text, 'overturned'::text, 'withdrawn'::text])))
- `appeals_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `appeals_decision_id_fkey`: FOREIGN KEY (decision_id) REFERENCES policy_decisions(id)
- `appeals_resolved_by_fkey`: FOREIGN KEY (resolved_by) REFERENCES users(id)
- `appeals_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `appeals_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX appeals_one_open_per_decision ON public.appeals USING btree (decision_id) WHERE (status = ANY (ARRAY['submitted'::text, 'under_review'::text]))

## assets · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| kind | text |  |  |
| status | text |  | 'pending'::text |
| storage_key | text |  |  |
| mime_type | text | yes |  |
| byte_size | bigint | yes |  |
| width | integer | yes |  |
| height | integer | yes |  |
| alt_text | text | yes |  |
| alt_text_en | text | yes |  |
| purpose | text |  | 'general'::text |
| variants | jsonb |  | '{}'::jsonb |
| dominant_colors | ARRAY |  | '{}'::text[] |
| uploaded_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| finalized_at | timestamp with time zone | yes |  |
| deleted_at | timestamp with time zone | yes |  |

Constraints:
- `assets_alt_text_check`: CHECK ((length(alt_text) <= 300))
- `assets_alt_text_en_check`: CHECK ((length(alt_text_en) <= 300))
- `assets_byte_size_check`: CHECK ((byte_size >= 0))
- `assets_kind_check`: CHECK ((kind = ANY (ARRAY['image'::text, 'document'::text])))
- `assets_purpose_check`: CHECK ((purpose = ANY (ARRAY['general'::text, 'logo'::text, 'cover'::text, 'service'::text, 'product'::text, 'staff'::text, 'gallery'::text, 'evidence'::text, 'invoice'::text])))
- `assets_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'rejected'::text, 'deleted'::text])))
- `assets_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `assets_uploaded_by_fkey`: FOREIGN KEY (uploaded_by) REFERENCES users(id)
- `assets_pkey`: PRIMARY KEY (id)
- `assets_storage_key_key`: UNIQUE (storage_key)
- `assets_tenant_id_id_key`: UNIQUE (tenant_id, id)

## attendance_events · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| kind | text |  |  |
| at | timestamp with time zone |  | now() |
| source | text |  | 'portal'::text |
| recorded_by | uuid | yes |  |
| note | text | yes |  |
| corrects_id | uuid | yes |  |

Constraints:
- `attendance_events_kind_check`: CHECK ((kind = ANY (ARRAY['clock_in'::text, 'clock_out'::text])))
- `attendance_events_source_check`: CHECK ((source = ANY (ARRAY['portal'::text, 'manager'::text, 'kiosk'::text])))
- `attendance_events_recorded_by_fkey`: FOREIGN KEY (recorded_by) REFERENCES users(id)
- `attendance_events_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `attendance_events_pkey`: PRIMARY KEY (id)

## audit_logs

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('audit_logs_id_seq'::regclass) |
| at | timestamp with time zone |  | now() |
| actor_user_id | uuid | yes |  |
| actor_kind | text |  |  |
| tenant_id | uuid | yes |  |
| action | text |  |  |
| target_type | text | yes |  |
| target_id | text | yes |  |
| request_id | text | yes |  |
| reason | text | yes |  |
| metadata | jsonb |  | '{}'::jsonb |
| ip | inet | yes |  |

Constraints:
- `audit_logs_actor_kind_check`: CHECK ((actor_kind = ANY (ARRAY['user'::text, 'platform'::text, 'support'::text, 'system'::text, 'customer'::text])))
- `audit_logs_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `audit_logs_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `audit_logs_pkey`: PRIMARY KEY (id)

## blocked_times · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid | yes |  |
| resource_id | uuid | yes |  |
| during | tstzrange |  |  |
| reason | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `blocked_times_check`: CHECK (((staff_id IS NULL) <> (resource_id IS NULL)))
- `blocked_times_during_check`: CHECK ((NOT isempty(during)))
- `blocked_times_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `blocked_times_tenant_id_resource_id_fkey`: FOREIGN KEY (tenant_id, resource_id) REFERENCES resources(tenant_id, id)
- `blocked_times_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `blocked_times_pkey`: PRIMARY KEY (id)

## booking_allocations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| booking_id | uuid | yes |  |
| booking_item_id | uuid | yes |  |
| group_session_id | uuid | yes |  |
| staff_id | uuid | yes |  |
| resource_id | uuid | yes |  |
| during | tstzrange |  |  |
| active | boolean |  | true |
| expires_at | timestamp with time zone | yes |  |
| released_at | timestamp with time zone | yes |  |
| release_reason | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `booking_allocations_check`: CHECK (((staff_id IS NULL) <> (resource_id IS NULL)))
- `booking_allocations_check1`: CHECK (((booking_item_id IS NOT NULL) <> (group_session_id IS NOT NULL)))
- `booking_allocations_check2`: CHECK ((active OR (released_at IS NOT NULL)))
- `booking_allocations_during_check`: CHECK ((NOT isempty(during)))
- `booking_allocations_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `booking_allocations_tenant_id_booking_item_id_fkey`: FOREIGN KEY (tenant_id, booking_item_id) REFERENCES booking_items(tenant_id, id)
- `booking_allocations_tenant_id_group_session_id_fkey`: FOREIGN KEY (tenant_id, group_session_id) REFERENCES group_sessions(tenant_id, id)
- `booking_allocations_tenant_id_resource_id_fkey`: FOREIGN KEY (tenant_id, resource_id) REFERENCES resources(tenant_id, id)
- `booking_allocations_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `booking_allocations_pkey`: PRIMARY KEY (id)
- `alloc_resource_no_overlap`: EXCLUDE USING gist (tenant_id WITH =, resource_id WITH =, during WITH &&) WHERE ((active AND (resource_id IS NOT NULL)))
- `alloc_staff_no_overlap`: EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, during WITH &&) WHERE ((active AND (staff_id IS NOT NULL)))

## booking_events · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('booking_events_id_seq'::regclass) |
| tenant_id | uuid |  |  |
| booking_id | uuid |  |  |
| from_status | text | yes |  |
| to_status | text | yes |  |
| kind | text |  |  |
| actor_user_id | uuid | yes |  |
| actor_role | text | yes |  |
| source | text | yes |  |
| reason | text | yes |  |
| data | jsonb |  | '{}'::jsonb |
| at | timestamp with time zone |  | now() |

Constraints:
- `booking_events_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `booking_events_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `booking_events_pkey`: PRIMARY KEY (id)

## booking_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| booking_id | uuid |  |  |
| seq | integer |  |  |
| service_id | uuid |  |  |
| variant_id | uuid | yes |  |
| staff_id | uuid |  |  |
| group_session_id | uuid | yes |  |
| service_name | text |  |  |
| service_name_en | text | yes |  |
| variant_name | text | yes |  |
| staff_name | text |  |  |
| price_minor | bigint |  |  |
| addons | jsonb |  | '[]'::jsonb |
| addons_minor | bigint |  | 0 |
| duration_min | integer |  |  |
| buffer_before_min | integer |  | 0 |
| buffer_after_min | integer |  | 0 |
| starts_at | timestamp with time zone |  |  |
| ends_at | timestamp with time zone |  |  |
| status | text |  | 'active'::text |
| actual_start_at | timestamp with time zone | yes |  |
| actual_end_at | timestamp with time zone | yes |  |
| materials_deducted_at | timestamp with time zone | yes |  |

Constraints:
- `booking_items_addons_minor_check`: CHECK ((addons_minor >= 0))
- `booking_items_check`: CHECK ((ends_at > starts_at))
- `booking_items_duration_min_check`: CHECK ((duration_min > 0))
- `booking_items_price_minor_check`: CHECK ((price_minor >= 0))
- `booking_items_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])))
- `booking_items_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `booking_items_tenant_id_group_session_id_fkey`: FOREIGN KEY (tenant_id, group_session_id) REFERENCES group_sessions(tenant_id, id)
- `booking_items_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `booking_items_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `booking_items_tenant_id_variant_id_fkey`: FOREIGN KEY (tenant_id, variant_id) REFERENCES service_variants(tenant_id, id)
- `booking_items_pkey`: PRIMARY KEY (id)
- `booking_items_tenant_id_booking_id_seq_key`: UNIQUE (tenant_id, booking_id, seq)
- `booking_items_tenant_id_id_key`: UNIQUE (tenant_id, id)

## booking_policies · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| version | integer |  | 1 |
| slot_increment_min | integer |  | 15 |
| min_notice_min | integer |  | 120 |
| max_advance_days | integer |  | 60 |
| hold_minutes | integer |  | 10 |
| cancellation_window_hours | integer |  | 24 |
| late_cancel_fee_bps | integer |  | 0 |
| no_show_grace_min | integer |  | 15 |
| no_show_fee_bps | integer |  | 0 |
| deposit_mode | text |  | 'none'::text |
| deposit_value | bigint |  | 0 |
| allow_on_site | boolean |  | true |
| allow_full_online | boolean |  | true |
| any_staff_rule | text |  | 'earliest_then_least_booked'::text |
| max_gap_min | integer |  | 30 |
| policy_text | text | yes |  |
| policy_text_en | text | yes |  |
| require_account | boolean |  | true |
| updated_by | uuid | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `booking_policies_any_staff_rule_check`: CHECK ((any_staff_rule = ANY (ARRAY['earliest_then_least_booked'::text, 'earliest_then_weight'::text])))
- `booking_policies_cancellation_window_hours_check`: CHECK (((cancellation_window_hours >= 0) AND (cancellation_window_hours <= 336)))
- `booking_policies_check`: CHECK (((deposit_mode <> 'percent'::text) OR (deposit_value <= 10000)))
- `booking_policies_deposit_mode_check`: CHECK ((deposit_mode = ANY (ARRAY['none'::text, 'percent'::text, 'fixed'::text])))
- `booking_policies_deposit_value_check`: CHECK ((deposit_value >= 0))
- `booking_policies_hold_minutes_check`: CHECK (((hold_minutes >= 2) AND (hold_minutes <= 60)))
- `booking_policies_late_cancel_fee_bps_check`: CHECK (((late_cancel_fee_bps >= 0) AND (late_cancel_fee_bps <= 10000)))
- `booking_policies_max_advance_days_check`: CHECK (((max_advance_days >= 1) AND (max_advance_days <= 365)))
- `booking_policies_max_gap_min_check`: CHECK (((max_gap_min >= 0) AND (max_gap_min <= 240)))
- `booking_policies_min_notice_min_check`: CHECK (((min_notice_min >= 0) AND (min_notice_min <= 20160)))
- `booking_policies_no_show_fee_bps_check`: CHECK (((no_show_fee_bps >= 0) AND (no_show_fee_bps <= 10000)))
- `booking_policies_no_show_grace_min_check`: CHECK (((no_show_grace_min >= 0) AND (no_show_grace_min <= 240)))
- `booking_policies_policy_text_check`: CHECK ((length(policy_text) <= 4000))
- `booking_policies_policy_text_en_check`: CHECK ((length(policy_text_en) <= 4000))
- `booking_policies_slot_increment_min_check`: CHECK ((slot_increment_min = ANY (ARRAY[5, 10, 15, 20, 30, 45, 60])))
- `booking_policies_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `booking_policies_updated_by_fkey`: FOREIGN KEY (updated_by) REFERENCES users(id)
- `booking_policies_pkey`: PRIMARY KEY (tenant_id)

## bookings · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| number | text |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| status | text |  |  |
| financial_status | text |  | 'unpaid'::text |
| source | text |  |  |
| starts_at | timestamp with time zone |  |  |
| ends_at | timestamp with time zone |  |  |
| currency | character |  | 'SAR'::bpchar |
| subtotal_minor | bigint |  |  |
| discount_minor | bigint |  | 0 |
| tax_minor | bigint |  | 0 |
| total_minor | bigint |  |  |
| deposit_due_minor | bigint |  | 0 |
| paid_minor | bigint |  | 0 |
| refunded_minor | bigint |  | 0 |
| payment_terms | text |  | 'on_site'::text |
| terms_snapshot | jsonb |  | '{}'::jsonb |
| hold_expires_at | timestamp with time zone | yes |  |
| customer_note | text | yes |  |
| internal_note | text | yes |  |
| rescheduled_from_id | uuid | yes |  |
| rescheduled_to_id | uuid | yes |  |
| coupon_code | text | yes |  |
| checked_in_at | timestamp with time zone | yes |  |
| service_started_at | timestamp with time zone | yes |  |
| completed_at | timestamp with time zone | yes |  |
| cancelled_at | timestamp with time zone | yes |  |
| cancelled_by | uuid | yes |  |
| cancel_source | text | yes |  |
| cancel_reason | text | yes |  |
| no_show_at | timestamp with time zone | yes |  |
| created_by | uuid | yes |  |
| version | integer |  | 1 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `bookings_cancel_source_check`: CHECK ((cancel_source = ANY (ARRAY['customer'::text, 'business'::text, 'system'::text, 'platform'::text])))
- `bookings_check`: CHECK ((ends_at > starts_at))
- `bookings_check1`: CHECK ((total_minor = ((subtotal_minor - discount_minor) + tax_minor)))
- `bookings_check2`: CHECK ((deposit_due_minor <= total_minor))
- `bookings_customer_note_check`: CHECK ((length(customer_note) <= 1000))
- `bookings_deposit_due_minor_check`: CHECK ((deposit_due_minor >= 0))
- `bookings_discount_minor_check`: CHECK ((discount_minor >= 0))
- `bookings_financial_status_check`: CHECK ((financial_status = ANY (ARRAY['unpaid'::text, 'deposit_paid'::text, 'partially_paid'::text, 'paid'::text, 'refund_pending'::text, 'partially_refunded'::text, 'refunded'::text, 'not_required'::text])))
- `bookings_internal_note_check`: CHECK ((length(internal_note) <= 2000))
- `bookings_paid_minor_check`: CHECK ((paid_minor >= 0))
- `bookings_payment_terms_check`: CHECK ((payment_terms = ANY (ARRAY['full'::text, 'deposit'::text, 'on_site'::text, 'manual_approval'::text, 'none'::text])))
- `bookings_refunded_minor_check`: CHECK ((refunded_minor >= 0))
- `bookings_source_check`: CHECK ((source = ANY (ARRAY['online'::text, 'staff'::text, 'walk_in'::text, 'waitlist'::text, 'reschedule'::text])))
- `bookings_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'held'::text, 'pending_payment'::text, 'confirmed'::text, 'checked_in'::text, 'in_service'::text, 'completed'::text, 'expired'::text, 'cancelled'::text, 'no_show'::text])))
- `bookings_subtotal_minor_check`: CHECK ((subtotal_minor >= 0))
- `bookings_tax_minor_check`: CHECK ((tax_minor >= 0))
- `bookings_total_minor_check`: CHECK ((total_minor >= 0))
- `bookings_cancelled_by_fkey`: FOREIGN KEY (cancelled_by) REFERENCES users(id)
- `bookings_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `bookings_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `bookings_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `bookings_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `bookings_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `bookings_pkey`: PRIMARY KEY (id)
- `bookings_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `bookings_tenant_id_number_key`: UNIQUE (tenant_id, number)

## branches · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| city | text | yes |  |
| address | text | yes |  |
| phone | text | yes |  |
| timezone | text | yes |  |
| is_primary | boolean |  | false |
| status | text |  | 'active'::text |
| latitude | numeric | yes |  |
| longitude | numeric | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `branches_name_check`: CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
- `branches_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `branches_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `branches_pkey`: PRIMARY KEY (id)
- `branches_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX branches_one_primary ON public.branches USING btree (tenant_id) WHERE (is_primary AND (status = 'active'::text))

## breaks · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| weekday | smallint | yes |  |
| on_date | date | yes |  |
| start_time | time without time zone |  |  |
| end_time | time without time zone |  |  |
| label | text | yes |  |

Constraints:
- `breaks_check`: CHECK ((end_time > start_time))
- `breaks_check1`: CHECK (((weekday IS NULL) <> (on_date IS NULL)))
- `breaks_weekday_check`: CHECK (((weekday >= 0) AND (weekday <= 6)))
- `breaks_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `breaks_pkey`: PRIMARY KEY (id)

## campaign_events · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('campaign_events_id_seq'::regclass) |
| tenant_id | uuid |  |  |
| campaign_id | uuid |  |  |
| kind | text |  |  |
| ref_type | text | yes |  |
| ref_id | uuid | yes |  |
| value_minor | bigint | yes |  |
| dedupe_key | text | yes |  |
| at | timestamp with time zone |  | now() |

Constraints:
- `campaign_events_kind_check`: CHECK ((kind = ANY (ARRAY['click'::text, 'booking_attributed'::text, 'order_attributed'::text, 'opt_out'::text, 'refund_adjustment'::text])))
- `campaign_events_tenant_id_campaign_id_fkey`: FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id)
- `campaign_events_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX campaign_events_dedupe ON public.campaign_events USING btree (tenant_id, dedupe_key) WHERE (dedupe_key IS NOT NULL)

## campaign_recipients · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| campaign_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| arm | text |  |  |
| status | text |  | 'pending'::text |
| reason | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `campaign_recipients_arm_check`: CHECK ((arm = ANY (ARRAY['treatment'::text, 'holdout'::text])))
- `campaign_recipients_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'suppressed'::text, 'simulated'::text, 'sent'::text, 'failed'::text])))
- `campaign_recipients_tenant_id_campaign_id_fkey`: FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns(tenant_id, id)
- `campaign_recipients_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `campaign_recipients_pkey`: PRIMARY KEY (tenant_id, campaign_id, tenant_customer_id)

## campaign_segments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| definition | jsonb |  |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `campaign_segments_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `campaign_segments_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `campaign_segments_pkey`: PRIMARY KEY (id)
- `campaign_segments_tenant_id_id_key`: UNIQUE (tenant_id, id)

## campaigns · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| segment_id | uuid | yes |  |
| channel | text |  |  |
| status | text |  | 'draft'::text |
| content | jsonb |  | '{}'::jsonb |
| coupon_code | text | yes |  |
| utm_campaign | text |  |  |
| scheduled_at | timestamp with time zone | yes |  |
| attribution_window_days | integer |  | 7 |
| holdout_bps | integer |  | 0 |
| frequency_cap_days | integer |  | 7 |
| quiet_hours | jsonb |  | '{"end": "09:00", "start": "22:00"}'::jsonb |
| recommendation_id | uuid | yes |  |
| approved_by | uuid | yes |  |
| approved_at | timestamp with time zone | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `campaigns_attribution_window_days_check`: CHECK (((attribution_window_days >= 1) AND (attribution_window_days <= 60)))
- `campaigns_channel_check`: CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'instagram_post'::text, 'in_app'::text])))
- `campaigns_frequency_cap_days_check`: CHECK (((frequency_cap_days >= 1) AND (frequency_cap_days <= 90)))
- `campaigns_holdout_bps_check`: CHECK (((holdout_bps >= 0) AND (holdout_bps <= 5000)))
- `campaigns_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'paused'::text, 'failed'::text, 'completed'::text, 'cancelled'::text])))
- `campaigns_approved_by_fkey`: FOREIGN KEY (approved_by) REFERENCES users(id)
- `campaigns_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `campaigns_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `campaigns_tenant_id_recommendation_id_fkey`: FOREIGN KEY (tenant_id, recommendation_id) REFERENCES recommendations(tenant_id, id)
- `campaigns_tenant_id_segment_id_fkey`: FOREIGN KEY (tenant_id, segment_id) REFERENCES campaign_segments(tenant_id, id)
- `campaigns_pkey`: PRIMARY KEY (id)
- `campaigns_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `campaigns_tenant_id_utm_campaign_key`: UNIQUE (tenant_id, utm_campaign)

## cart_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| cart_id | uuid |  |  |
| product_id | uuid |  |  |
| variant_id | uuid | yes |  |
| quantity | integer |  |  |
| seen_price_minor | bigint |  |  |

Constraints:
- `cart_items_quantity_check`: CHECK (((quantity >= 1) AND (quantity <= 100)))
- `cart_items_tenant_id_cart_id_fkey`: FOREIGN KEY (tenant_id, cart_id) REFERENCES carts(tenant_id, id) ON DELETE CASCADE
- `cart_items_tenant_id_product_id_fkey`: FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
- `cart_items_tenant_id_variant_id_fkey`: FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
- `cart_items_pkey`: PRIMARY KEY (id)
- `cart_items_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX cart_items_line ON public.cart_items USING btree (tenant_id, cart_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))

## carts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| user_id | uuid | yes |  |
| anon_key_hash | bytea | yes |  |
| status | text |  | 'open'::text |
| expires_at | timestamp with time zone |  | (now() + '7 days'::interval) |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `carts_check`: CHECK (((user_id IS NOT NULL) OR (anon_key_hash IS NOT NULL)))
- `carts_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'converted'::text, 'abandoned'::text])))
- `carts_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `carts_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id)
- `carts_pkey`: PRIMARY KEY (id)
- `carts_tenant_id_id_key`: UNIQUE (tenant_id, id)

## categories · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| kind | text |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| sort | integer |  | 0 |
| status | text |  | 'active'::text |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `categories_kind_check`: CHECK ((kind = ANY (ARRAY['service'::text, 'product'::text])))
- `categories_name_check`: CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
- `categories_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text, 'archived'::text])))
- `categories_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `categories_pkey`: PRIMARY KEY (id)
- `categories_tenant_id_id_key`: UNIQUE (tenant_id, id)

## commission_entries · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| booking_item_id | uuid |  |  |
| kind | text |  |  |
| basis_minor | bigint |  |  |
| amount_minor | bigint |  |  |
| rule_snapshot | jsonb |  |  |
| reverses_id | uuid | yes |  |
| reason | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `commission_entries_kind_check`: CHECK ((kind = ANY (ARRAY['earned'::text, 'reversal'::text, 'correction'::text])))
- `commission_entries_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `commission_entries_tenant_id_booking_item_id_fkey`: FOREIGN KEY (tenant_id, booking_item_id) REFERENCES booking_items(tenant_id, id)
- `commission_entries_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `commission_entries_pkey`: PRIMARY KEY (id)
- `commission_entries_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX commission_earned_once ON public.commission_entries USING btree (tenant_id, booking_item_id) WHERE (kind = 'earned'::text)
- UNIQUE INDEX commission_reversed_once ON public.commission_entries USING btree (tenant_id, reverses_id) WHERE (kind = 'reversal'::text)

## commission_rules · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid | yes |  |
| service_id | uuid | yes |  |
| kind | text |  |  |
| rate_bps | integer | yes |  |
| fixed_minor | bigint | yes |  |
| effective_from | date |  | CURRENT_DATE |
| effective_to | date | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `commission_rules_check`: CHECK ((((kind = 'percentage'::text) AND (rate_bps IS NOT NULL)) OR ((kind = 'fixed'::text) AND (fixed_minor IS NOT NULL))))
- `commission_rules_fixed_minor_check`: CHECK ((fixed_minor >= 0))
- `commission_rules_kind_check`: CHECK ((kind = ANY (ARRAY['percentage'::text, 'fixed'::text])))
- `commission_rules_rate_bps_check`: CHECK (((rate_bps >= 0) AND (rate_bps <= 10000)))
- `commission_rules_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `commission_rules_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `commission_rules_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `commission_rules_pkey`: PRIMARY KEY (id)

## coupons · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| code | USER-DEFINED |  |  |
| kind | text |  |  |
| value | bigint |  |  |
| min_total_minor | bigint |  | 0 |
| max_redemptions | integer | yes |  |
| redeemed_count | integer |  | 0 |
| per_customer_limit | integer |  | 1 |
| starts_at | timestamp with time zone | yes |  |
| ends_at | timestamp with time zone | yes |  |
| status | text |  | 'active'::text |
| campaign_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `coupons_check`: CHECK (((kind <> 'percent'::text) OR (value <= 10000)))
- `coupons_check1`: CHECK (((max_redemptions IS NULL) OR (redeemed_count <= max_redemptions)))
- `coupons_kind_check`: CHECK ((kind = ANY (ARRAY['percent'::text, 'fixed'::text])))
- `coupons_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])))
- `coupons_value_check`: CHECK ((value > 0))
- `coupons_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `coupons_pkey`: PRIMARY KEY (id)
- `coupons_tenant_id_code_key`: UNIQUE (tenant_id, code)
- `coupons_tenant_id_id_key`: UNIQUE (tenant_id, id)

## customer_consents · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| user_id | uuid | yes |  |
| tenant_customer_id | uuid | yes |  |
| channel | text |  |  |
| purpose | text |  | 'marketing'::text |
| status | text |  |  |
| source | text |  |  |
| recorded_at | timestamp with time zone |  | now() |

Constraints:
- `customer_consents_channel_check`: CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'push'::text])))
- `customer_consents_check`: CHECK (((user_id IS NOT NULL) OR (tenant_customer_id IS NOT NULL)))
- `customer_consents_purpose_check`: CHECK ((purpose = ANY (ARRAY['marketing'::text, 'reminders'::text, 'waitlist'::text])))
- `customer_consents_status_check`: CHECK ((status = ANY (ARRAY['granted'::text, 'revoked'::text])))
- `customer_consents_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `customer_consents_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `customer_consents_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `customer_consents_pkey`: PRIMARY KEY (id)

## customer_incidents · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| booking_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| type | text |  |  |
| description | text |  |  |
| occurred_at | timestamp with time zone |  |  |
| submitted_by | uuid |  |  |
| status | text |  | 'submitted'::text |
| platform_review_requested | boolean |  | false |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `customer_incidents_description_check`: CHECK (((length(description) >= 10) AND (length(description) <= 2000)))
- `customer_incidents_status_check`: CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'confirmed'::text, 'rejected'::text, 'corrected'::text])))
- `customer_incidents_type_check`: CHECK ((type = ANY (ARRAY['no_show'::text, 'late_cancellation'::text, 'payment_dispute'::text, 'conduct'::text])))
- `customer_incidents_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `customer_incidents_submitted_by_fkey`: FOREIGN KEY (submitted_by) REFERENCES users(id)
- `customer_incidents_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `customer_incidents_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `customer_incidents_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `customer_incidents_pkey`: PRIMARY KEY (id)
- `customer_incidents_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX incidents_once ON public.customer_incidents USING btree (tenant_id, booking_id, type) WHERE (status <> 'rejected'::text)

## customer_preferences · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| key | text |  |  |
| value | jsonb |  |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `customer_preferences_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `customer_preferences_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `customer_preferences_pkey`: PRIMARY KEY (tenant_id, tenant_customer_id, key)

## customer_profiles

| column | type | null | default |
|---|---|---|---|
| user_id | uuid |  |  |
| full_name | text |  |  |
| preferred_locale | text |  | 'ar'::text |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `customer_profiles_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `customer_profiles_pkey`: PRIMARY KEY (user_id)

## customization_requests · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| prompt | text |  |  |
| patch | jsonb | yes |  |
| explanation | text | yes |  |
| rejected_ops | jsonb |  | '[]'::jsonb |
| status | text |  |  |
| base_draft_version | integer |  |  |
| applied_draft_version | integer | yes |  |
| ai_run_id | uuid | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| decided_at | timestamp with time zone | yes |  |

Constraints:
- `customization_requests_prompt_check`: CHECK (((length(prompt) >= 3) AND (length(prompt) <= 1000)))
- `customization_requests_status_check`: CHECK ((status = ANY (ARRAY['proposed'::text, 'applied'::text, 'rejected'::text, 'invalid'::text, 'unavailable'::text])))
- `customization_requests_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `customization_requests_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `customization_requests_pkey`: PRIMARY KEY (id)

## daily_metrics · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| day | date |  |  |
| metric | text |  |  |
| dimension | text |  | ''::text |
| value | numeric |  |  |

Constraints:
- `daily_metrics_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `daily_metrics_pkey`: PRIMARY KEY (tenant_id, day, metric, dimension)

## dev_outbox_messages

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| channel | text |  |  |
| destination | text |  |  |
| subject | text | yes |  |
| body | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `dev_outbox_messages_pkey`: PRIMARY KEY (id)

## domain_mappings · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| domain | USER-DEFINED |  |  |
| status | text |  | 'pending'::text |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `domain_mappings_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'disabled'::text])))
- `domain_mappings_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `domain_mappings_pkey`: PRIMARY KEY (id)
- `domain_mappings_domain_key`: UNIQUE (domain)

## entitlement_reservations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| entitlement_id | uuid |  |  |
| booking_item_id | uuid |  |  |
| status | text |  | 'reserved'::text |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `entitlement_reservations_status_check`: CHECK ((status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text])))
- `entitlement_reservations_tenant_id_booking_item_id_fkey`: FOREIGN KEY (tenant_id, booking_item_id) REFERENCES booking_items(tenant_id, id)
- `entitlement_reservations_tenant_id_entitlement_id_fkey`: FOREIGN KEY (tenant_id, entitlement_id) REFERENCES membership_entitlements(tenant_id, id)
- `entitlement_reservations_pkey`: PRIMARY KEY (id)
- `entitlement_reservations_tenant_id_booking_item_id_key`: UNIQUE (tenant_id, booking_item_id)

## expenses · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid | yes |  |
| category | text |  |  |
| amount_minor | bigint |  |  |
| currency | character |  | 'SAR'::bpchar |
| incurred_on | date |  |  |
| description | text | yes |  |
| receipt_asset_id | uuid | yes |  |
| recorded_by | uuid | yes |  |
| voided_at | timestamp with time zone | yes |  |
| void_reason | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `expenses_amount_minor_check`: CHECK ((amount_minor > 0))
- `expenses_category_check`: CHECK ((category = ANY (ARRAY['rent'::text, 'salaries'::text, 'supplies'::text, 'utilities'::text, 'marketing'::text, 'maintenance'::text, 'other'::text])))
- `expenses_recorded_by_fkey`: FOREIGN KEY (recorded_by) REFERENCES users(id)
- `expenses_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `expenses_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `expenses_tenant_id_receipt_asset_id_fkey`: FOREIGN KEY (tenant_id, receipt_asset_id) REFERENCES assets(tenant_id, id)
- `expenses_pkey`: PRIMARY KEY (id)
- `expenses_tenant_id_id_key`: UNIQUE (tenant_id, id)

## finance_settings · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| prices_include_tax | boolean |  | true |
| tax_rate_bps | integer |  | 0 |
| tax_label | text |  | 'VAT'::text |
| tax_registered | boolean |  | false |
| rounding | text |  | 'half_up'::text |
| legal_address | text | yes |  |
| invoice_footer | text | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `finance_settings_rounding_check`: CHECK ((rounding = ANY (ARRAY['half_up'::text, 'half_even'::text])))
- `finance_settings_tax_rate_bps_check`: CHECK (((tax_rate_bps >= 0) AND (tax_rate_bps <= 10000)))
- `finance_settings_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `finance_settings_pkey`: PRIMARY KEY (tenant_id)

## financial_entries · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('financial_entries_id_seq'::regclass) |
| tenant_id | uuid |  |  |
| txn_id | uuid |  |  |
| at | timestamp with time zone |  | now() |
| account | text |  |  |
| debit_minor | bigint |  | 0 |
| credit_minor | bigint |  | 0 |
| currency | character |  | 'SAR'::bpchar |
| ref_type | text |  |  |
| ref_id | uuid | yes |  |
| memo | text | yes |  |
| actor_user_id | uuid | yes |  |

Constraints:
- `financial_entries_account_check`: CHECK ((account = ANY (ARRAY['cash'::text, 'card_clearing'::text, 'provider_clearing'::text, 'customer_deposits'::text, 'gift_card_liability'::text, 'membership_liability'::text, 'service_revenue'::text, 'product_revenue
- `financial_entries_check`: CHECK (((debit_minor = 0) <> (credit_minor = 0)))
- `financial_entries_credit_minor_check`: CHECK ((credit_minor >= 0))
- `financial_entries_debit_minor_check`: CHECK ((debit_minor >= 0))
- `financial_entries_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `financial_entries_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `financial_entries_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX financial_entries_once ON public.financial_entries USING btree (tenant_id, ref_type, ref_id, account, ((debit_minor > 0))) WHERE (ref_type = ANY (ARRAY['payment'::text, 'refund'::text, 'service_completed'::t

## fulfillments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| order_id | uuid |  |  |
| method | text |  | 'pickup'::text |
| status | text |  | 'pending'::text |
| ready_at | timestamp with time zone | yes |  |
| collected_at | timestamp with time zone | yes |  |
| collected_by | uuid | yes |  |

Constraints:
- `fulfillments_method_check`: CHECK ((method = ANY (ARRAY['pickup'::text, 'delivery'::text])))
- `fulfillments_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'collected'::text, 'cancelled'::text])))
- `fulfillments_collected_by_fkey`: FOREIGN KEY (collected_by) REFERENCES users(id)
- `fulfillments_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `fulfillments_pkey`: PRIMARY KEY (id)
- `fulfillments_tenant_id_order_id_key`: UNIQUE (tenant_id, order_id)

## gift_card_entries · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| gift_card_id | uuid |  |  |
| kind | text |  |  |
| amount_minor | bigint |  |  |
| ref_type | text | yes |  |
| ref_id | uuid | yes |  |
| actor_user_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `gift_card_entries_kind_check`: CHECK ((kind = ANY (ARRAY['issue'::text, 'redeem'::text, 'refund'::text, 'expire'::text, 'void'::text])))
- `gift_card_entries_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `gift_card_entries_tenant_id_gift_card_id_fkey`: FOREIGN KEY (tenant_id, gift_card_id) REFERENCES gift_cards(tenant_id, id)
- `gift_card_entries_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX gift_card_entries_once ON public.gift_card_entries USING btree (tenant_id, gift_card_id, kind, ref_type, ref_id) WHERE (ref_id IS NOT NULL)

## gift_cards · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| code_hash | bytea |  |  |
| code_last4 | text |  |  |
| initial_minor | bigint |  |  |
| balance_minor | bigint |  |  |
| currency | character |  | 'SAR'::bpchar |
| status | text |  | 'pending'::text |
| template_key | text |  | 'classic'::text |
| recipient_name | text | yes |  |
| message | text | yes |  |
| purchaser_customer_id | uuid | yes |  |
| expires_at | timestamp with time zone | yes |  |
| activated_at | timestamp with time zone | yes |  |
| issued_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| code_ciphertext | text | yes |  |
| code_revealed_at | timestamp with time zone | yes |  |
| complimentary | boolean |  | false |
| purchaser_user_id | uuid | yes |  |

Constraints:
- `gift_cards_balance_minor_check`: CHECK ((balance_minor >= 0))
- `gift_cards_check`: CHECK ((balance_minor <= initial_minor))
- `gift_cards_initial_minor_check`: CHECK ((initial_minor > 0))
- `gift_cards_message_check`: CHECK ((length(message) <= 300))
- `gift_cards_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'redeemed'::text, 'expired'::text, 'void'::text])))
- `gift_cards_issued_by_fkey`: FOREIGN KEY (issued_by) REFERENCES users(id)
- `gift_cards_purchaser_user_id_fkey`: FOREIGN KEY (purchaser_user_id) REFERENCES users(id)
- `gift_cards_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `gift_cards_tenant_id_purchaser_customer_id_fkey`: FOREIGN KEY (tenant_id, purchaser_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `gift_cards_pkey`: PRIMARY KEY (id)
- `gift_cards_code_hash_key`: UNIQUE (code_hash)
- `gift_cards_tenant_id_id_key`: UNIQUE (tenant_id, id)

## group_session_bookings · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| group_session_id | uuid |  |  |
| booking_id | uuid |  |  |
| seats | integer |  | 1 |
| status | text |  | 'active'::text |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `group_session_bookings_seats_check`: CHECK (((seats >= 1) AND (seats <= 10)))
- `group_session_bookings_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'released'::text])))
- `group_session_bookings_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `group_session_bookings_tenant_id_group_session_id_fkey`: FOREIGN KEY (tenant_id, group_session_id) REFERENCES group_sessions(tenant_id, id)
- `group_session_bookings_pkey`: PRIMARY KEY (tenant_id, group_session_id, booking_id)

## group_sessions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| service_id | uuid |  |  |
| staff_id | uuid |  |  |
| resource_id | uuid | yes |  |
| starts_at | timestamp with time zone |  |  |
| ends_at | timestamp with time zone |  |  |
| capacity | integer |  |  |
| seats_taken | integer |  | 0 |
| price_minor | bigint |  |  |
| status | text |  | 'scheduled'::text |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `group_sessions_capacity_check`: CHECK (((capacity >= 1) AND (capacity <= 200)))
- `group_sessions_check`: CHECK ((ends_at > starts_at))
- `group_sessions_check1`: CHECK ((seats_taken <= capacity))
- `group_sessions_price_minor_check`: CHECK ((price_minor >= 0))
- `group_sessions_seats_taken_check`: CHECK ((seats_taken >= 0))
- `group_sessions_status_check`: CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text, 'completed'::text])))
- `group_sessions_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `group_sessions_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `group_sessions_tenant_id_resource_id_fkey`: FOREIGN KEY (tenant_id, resource_id) REFERENCES resources(tenant_id, id)
- `group_sessions_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `group_sessions_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `group_sessions_pkey`: PRIMARY KEY (id)
- `group_sessions_tenant_id_id_key`: UNIQUE (tenant_id, id)

## idempotency_records

| column | type | null | default |
|---|---|---|---|
| scope | text |  |  |
| key | text |  |  |
| request_hash | text |  |  |
| status | text |  | 'in_progress'::text |
| response_status | integer | yes |  |
| response_body | jsonb | yes |  |
| created_at | timestamp with time zone |  | now() |
| expires_at | timestamp with time zone |  | (now() + '24:00:00'::interval) |

Constraints:
- `idempotency_records_key_check`: CHECK (((length(key) >= 8) AND (length(key) <= 128)))
- `idempotency_records_status_check`: CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])))
- `idempotency_records_pkey`: PRIMARY KEY (scope, key)

## incident_evidence · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| incident_id | uuid |  |  |
| kind | text |  |  |
| ref | text |  |  |
| added_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| retain_until | date |  | (CURRENT_DATE + 730) |

Constraints:
- `incident_evidence_kind_check`: CHECK ((kind = ANY (ARRAY['booking_event'::text, 'asset'::text, 'note'::text])))
- `incident_evidence_added_by_fkey`: FOREIGN KEY (added_by) REFERENCES users(id)
- `incident_evidence_tenant_id_incident_id_fkey`: FOREIGN KEY (tenant_id, incident_id) REFERENCES customer_incidents(tenant_id, id)
- `incident_evidence_pkey`: PRIMARY KEY (id)

## incident_reviews · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| incident_id | uuid |  |  |
| reviewer_user_id | uuid |  |  |
| reviewer_scope | text |  |  |
| from_status | text |  |  |
| to_status | text |  |  |
| note | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `incident_reviews_note_check`: CHECK ((length(note) >= 5))
- `incident_reviews_reviewer_scope_check`: CHECK ((reviewer_scope = ANY (ARRAY['tenant'::text, 'platform'::text])))
- `incident_reviews_reviewer_user_id_fkey`: FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
- `incident_reviews_tenant_id_incident_id_fkey`: FOREIGN KEY (tenant_id, incident_id) REFERENCES customer_incidents(tenant_id, id)
- `incident_reviews_pkey`: PRIMARY KEY (id)

## inventory_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| usage | text |  |  |
| product_id | uuid | yes |  |
| variant_id | uuid | yes |  |
| name | text |  |  |
| unit | text |  | 'piece'::text |
| on_hand | numeric |  | 0 |
| reserved | numeric |  | 0 |
| low_stock_threshold | numeric | yes |  |
| unit_cost_minor | bigint | yes |  |
| status | text |  | 'active'::text |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `inventory_items_check`: CHECK (((reserved >= (0)::numeric) AND (reserved <= on_hand)))
- `inventory_items_check1`: CHECK (((usage = 'material'::text) OR (product_id IS NOT NULL)))
- `inventory_items_on_hand_check`: CHECK ((on_hand >= (0)::numeric))
- `inventory_items_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `inventory_items_unit_check`: CHECK ((unit = ANY (ARRAY['piece'::text, 'ml'::text, 'l'::text, 'g'::text, 'kg'::text])))
- `inventory_items_unit_cost_minor_check`: CHECK ((unit_cost_minor >= 0))
- `inventory_items_usage_check`: CHECK ((usage = ANY (ARRAY['retail'::text, 'material'::text, 'both'::text])))
- `inventory_items_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `inventory_items_tenant_id_product_id_fkey`: FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
- `inventory_items_tenant_id_variant_id_fkey`: FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
- `inventory_items_pkey`: PRIMARY KEY (id)
- `inventory_items_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX inventory_items_product ON public.inventory_items USING btree (tenant_id, branch_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (product_id IS NOT NULL)

## invitations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| email | USER-DEFINED | yes |  |
| phone | text | yes |  |
| role | text |  |  |
| staff_profile_id | uuid | yes |  |
| token_hash | bytea |  |  |
| expires_at | timestamp with time zone |  |  |
| accepted_at | timestamp with time zone | yes |  |
| accepted_by | uuid | yes |  |
| revoked_at | timestamp with time zone | yes |  |
| invited_by | uuid |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `invitations_check`: CHECK (((email IS NOT NULL) OR (phone IS NOT NULL)))
- `invitations_role_check`: CHECK ((role <> 'owner'::text))
- `invitations_accepted_by_fkey`: FOREIGN KEY (accepted_by) REFERENCES users(id)
- `invitations_invited_by_fkey`: FOREIGN KEY (invited_by) REFERENCES users(id)
- `invitations_role_fkey`: FOREIGN KEY (role) REFERENCES roles(key)
- `invitations_staff_fk`: FOREIGN KEY (tenant_id, staff_profile_id) REFERENCES staff_profiles(tenant_id, id)
- `invitations_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `invitations_pkey`: PRIMARY KEY (id)
- `invitations_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `invitations_token_hash_key`: UNIQUE (token_hash)

## invoice_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| invoice_id | uuid |  |  |
| description | text |  |  |
| quantity | numeric |  |  |
| unit_price_minor | bigint |  |  |
| line_total_minor | bigint |  |  |
| tax_minor | bigint |  | 0 |

Constraints:
- `invoice_items_tenant_id_invoice_id_fkey`: FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoices(tenant_id, id)
- `invoice_items_pkey`: PRIMARY KEY (id)

## invoices · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| number | text |  |  |
| kind | text |  |  |
| booking_id | uuid | yes |  |
| order_id | uuid | yes |  |
| payment_id | uuid | yes |  |
| seller_snapshot | jsonb |  |  |
| buyer_snapshot | jsonb |  |  |
| currency | character |  | 'SAR'::bpchar |
| subtotal_minor | bigint |  |  |
| discount_minor | bigint |  | 0 |
| tax_minor | bigint |  | 0 |
| total_minor | bigint |  |  |
| tax_rule_snapshot | jsonb |  | '{}'::jsonb |
| status | text |  | 'issued'::text |
| credit_for_id | uuid | yes |  |
| issued_at | timestamp with time zone |  | now() |
| issued_by | uuid | yes |  |

Constraints:
- `invoices_kind_check`: CHECK ((kind = ANY (ARRAY['invoice'::text, 'receipt'::text, 'credit_note'::text])))
- `invoices_status_check`: CHECK ((status = ANY (ARRAY['issued'::text, 'void'::text])))
- `invoices_issued_by_fkey`: FOREIGN KEY (issued_by) REFERENCES users(id)
- `invoices_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `invoices_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `invoices_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `invoices_tenant_id_payment_id_fkey`: FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id)
- `invoices_pkey`: PRIMARY KEY (id)
- `invoices_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `invoices_tenant_id_number_key`: UNIQUE (tenant_id, number)

## job_runs

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| kind | text |  |  |
| idempotency_key | text |  |  |
| payload | jsonb |  | '{}'::jsonb |
| status | text |  | 'queued'::text |
| attempts | integer |  | 0 |
| max_attempts | integer |  | 3 |
| run_at | timestamp with time zone |  | now() |
| locked_at | timestamp with time zone | yes |  |
| locked_by | text | yes |  |
| finished_at | timestamp with time zone | yes |  |
| error | text | yes |  |
| result | jsonb | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `job_runs_status_check`: CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
- `job_runs_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `job_runs_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `job_runs_pkey`: PRIMARY KEY (id)
- `job_runs_idempotency_key_key`: UNIQUE (idempotency_key)

## leave_requests · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| starts_at | timestamp with time zone |  |  |
| ends_at | timestamp with time zone |  |  |
| type | text |  |  |
| status | text |  | 'pending'::text |
| reason | text | yes |  |
| requested_by | uuid | yes |  |
| reviewed_by | uuid | yes |  |
| reviewed_at | timestamp with time zone | yes |  |
| review_note | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `leave_requests_check`: CHECK ((ends_at > starts_at))
- `leave_requests_reason_check`: CHECK ((length(reason) <= 1000))
- `leave_requests_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
- `leave_requests_type_check`: CHECK ((type = ANY (ARRAY['annual'::text, 'sick'::text, 'emergency'::text, 'unpaid'::text, 'other'::text])))
- `leave_requests_requested_by_fkey`: FOREIGN KEY (requested_by) REFERENCES users(id)
- `leave_requests_reviewed_by_fkey`: FOREIGN KEY (reviewed_by) REFERENCES users(id)
- `leave_requests_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `leave_requests_pkey`: PRIMARY KEY (id)
- `leave_requests_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `leave_no_overlap`: EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = ANY (ARRAY['pending'::text, 'approved'::text])))

## loyalty_accounts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| balance | integer |  | 0 |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `loyalty_accounts_balance_check`: CHECK ((balance >= 0))
- `loyalty_accounts_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `loyalty_accounts_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `loyalty_accounts_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `loyalty_accounts_pkey`: PRIMARY KEY (id)
- `loyalty_accounts_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `loyalty_accounts_tenant_id_tenant_customer_id_key`: UNIQUE (tenant_id, tenant_customer_id)

## loyalty_rewards · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| points_cost | integer |  |  |
| reward_kind | text |  |  |
| reward_value | bigint |  |  |
| service_id | uuid | yes |  |
| status | text |  | 'active'::text |

Constraints:
- `loyalty_rewards_points_cost_check`: CHECK ((points_cost > 0))
- `loyalty_rewards_reward_kind_check`: CHECK ((reward_kind = ANY (ARRAY['discount_fixed'::text, 'discount_percent'::text, 'free_service'::text])))
- `loyalty_rewards_reward_value_check`: CHECK ((reward_value >= 0))
- `loyalty_rewards_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `loyalty_rewards_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `loyalty_rewards_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `loyalty_rewards_pkey`: PRIMARY KEY (id)
- `loyalty_rewards_tenant_id_id_key`: UNIQUE (tenant_id, id)

## loyalty_rules · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| enabled | boolean |  | false |
| points_per_sar | numeric |  | 1 |
| earn_on | text |  | 'completed_paid'::text |
| expiry_days | integer | yes |  |
| tiers | jsonb |  | '[]'::jsonb |
| reverse_on_refund | boolean |  | true |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `loyalty_rules_earn_on_check`: CHECK ((earn_on = 'completed_paid'::text))
- `loyalty_rules_expiry_days_check`: CHECK (((expiry_days >= 30) AND (expiry_days <= 1095)))
- `loyalty_rules_points_per_sar_check`: CHECK ((points_per_sar >= (0)::numeric))
- `loyalty_rules_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `loyalty_rules_pkey`: PRIMARY KEY (tenant_id)

## marketing_plans · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| horizon | text |  |  |
| period_start | date |  |  |
| period_end | date |  |  |
| parent_plan_id | uuid | yes |  |
| title | text |  |  |
| status | text |  | 'draft'::text |
| current_version | integer |  | 1 |
| source | text |  |  |
| is_example | boolean |  | false |
| created_by | uuid | yes |  |
| approved_by | uuid | yes |  |
| approved_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `marketing_plans_check`: CHECK ((period_end >= period_start))
- `marketing_plans_check1`: CHECK (((horizon = 'weekly'::text) OR (parent_plan_id IS NULL)))
- `marketing_plans_horizon_check`: CHECK ((horizon = ANY (ARRAY['monthly'::text, 'weekly'::text])))
- `marketing_plans_source_check`: CHECK ((source = ANY (ARRAY['ai'::text, 'manual'::text, 'example'::text])))
- `marketing_plans_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'proposed'::text, 'under_review'::text, 'approved'::text, 'in_progress'::text, 'completed'::text, 'deferred'::text, 'rejected'::text])))
- `marketing_plans_approved_by_fkey`: FOREIGN KEY (approved_by) REFERENCES users(id)
- `marketing_plans_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `marketing_plans_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `marketing_plans_tenant_id_parent_plan_id_fkey`: FOREIGN KEY (tenant_id, parent_plan_id) REFERENCES marketing_plans(tenant_id, id)
- `marketing_plans_pkey`: PRIMARY KEY (id)
- `marketing_plans_tenant_id_id_key`: UNIQUE (tenant_id, id)

## marketing_preferences · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| goals | ARRAY |  | '{}'::text[] |
| monthly_budget_minor | bigint | yes |  |
| max_discount_bps | integer |  | 1500 |
| channels | ARRAY |  | '{instagram,whatsapp}'::text[] |
| tone | text | yes |  |
| avoid_topics | ARRAY |  | '{}'::text[] |
| weekly_enabled | boolean |  | false |
| monthly_enabled | boolean |  | false |
| weekly_run_weekday | smallint |  | 0 |
| photo_resources | text | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `marketing_preferences_max_discount_bps_check`: CHECK (((max_discount_bps >= 0) AND (max_discount_bps <= 9000)))
- `marketing_preferences_monthly_budget_minor_check`: CHECK ((monthly_budget_minor >= 0))
- `marketing_preferences_photo_resources_check`: CHECK ((length(photo_resources) <= 500))
- `marketing_preferences_weekly_run_weekday_check`: CHECK (((weekly_run_weekday >= 0) AND (weekly_run_weekday <= 6)))
- `marketing_preferences_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `marketing_preferences_pkey`: PRIMARY KEY (tenant_id)

## membership_entitlements · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| membership_id | uuid |  |  |
| service_id | uuid |  |  |
| total | integer |  |  |
| reserved | integer |  | 0 |
| consumed | integer |  | 0 |

Constraints:
- `membership_entitlements_check`: CHECK (((reserved + consumed) <= total))
- `membership_entitlements_consumed_check`: CHECK ((consumed >= 0))
- `membership_entitlements_reserved_check`: CHECK ((reserved >= 0))
- `membership_entitlements_total_check`: CHECK ((total > 0))
- `membership_entitlements_tenant_id_membership_id_fkey`: FOREIGN KEY (tenant_id, membership_id) REFERENCES memberships(tenant_id, id)
- `membership_entitlements_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `membership_entitlements_pkey`: PRIMARY KEY (id)
- `membership_entitlements_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `membership_entitlements_tenant_id_membership_id_service_id_key`: UNIQUE (tenant_id, membership_id, service_id)

## membership_plans · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| price_minor | bigint |  |  |
| validity_days | integer |  |  |
| entitlements | jsonb |  |  |
| status | text |  | 'active'::text |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `membership_plans_price_minor_check`: CHECK ((price_minor >= 0))
- `membership_plans_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `membership_plans_validity_days_check`: CHECK (((validity_days >= 7) AND (validity_days <= 730)))
- `membership_plans_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `membership_plans_pkey`: PRIMARY KEY (id)
- `membership_plans_tenant_id_id_key`: UNIQUE (tenant_id, id)

## memberships · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| plan_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| status | text |  | 'active'::text |
| starts_at | timestamp with time zone |  | now() |
| ends_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone |  | now() |
| payment_id | uuid | yes |  |
| sold_by | uuid | yes |  |

Constraints:
- `memberships_status_check`: CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
- `memberships_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `memberships_sold_by_fkey`: FOREIGN KEY (sold_by) REFERENCES users(id)
- `memberships_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `memberships_tenant_id_plan_id_fkey`: FOREIGN KEY (tenant_id, plan_id) REFERENCES membership_plans(tenant_id, id)
- `memberships_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `memberships_pkey`: PRIMARY KEY (id)
- `memberships_tenant_id_id_key`: UNIQUE (tenant_id, id)

## metric_snapshots · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| kind | text |  |  |
| period_start | date |  |  |
| period_end | date |  |  |
| data | jsonb |  |  |
| data_hash | text |  |  |
| data_as_of | timestamp with time zone |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `metric_snapshots_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `metric_snapshots_pkey`: PRIMARY KEY (id)
- `metric_snapshots_tenant_id_id_key`: UNIQUE (tenant_id, id)

## notification_deliveries

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| channel | text |  |  |
| template | text |  |  |
| recipient_user_id | uuid | yes |  |
| recipient_ref | text | yes |  |
| status | text |  |  |
| provider | text | yes |  |
| provider_ref | text | yes |  |
| attempts | integer |  | 0 |
| dedupe_key | text |  |  |
| error | text | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `notification_deliveries_channel_check`: CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'push'::text, 'in_app'::text])))
- `notification_deliveries_status_check`: CHECK ((status = ANY (ARRAY['simulated'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'suppressed'::text])))
- `notification_deliveries_recipient_user_id_fkey`: FOREIGN KEY (recipient_user_id) REFERENCES users(id)
- `notification_deliveries_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `notification_deliveries_pkey`: PRIMARY KEY (id)
- `notification_deliveries_dedupe_key_key`: UNIQUE (dedupe_key)

## notifications

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| user_id | uuid |  |  |
| tenant_id | uuid | yes |  |
| type | text |  |  |
| title | text |  |  |
| body | text | yes |  |
| target_path | text | yes |  |
| dedupe_key | text | yes |  |
| read_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| expires_at | timestamp with time zone |  | (now() + '180 days'::interval) |

Constraints:
- `notifications_target_path_check`: CHECK (((target_path IS NULL) OR (target_path ~ '^/[^/\\]'::text)))
- `notifications_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `notifications_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `notifications_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX notifications_dedupe ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL)

## onboarding_sessions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| current_step | integer |  | 1 |
| answers | jsonb |  | '{}'::jsonb |
| completed_steps | ARRAY |  | '{}'::integer[] |
| skipped_steps | ARRAY |  | '{}'::integer[] |
| palette_suggestions | jsonb | yes |  |
| draft_generated_at | timestamp with time zone | yes |  |
| completed_at | timestamp with time zone | yes |  |
| version | integer |  | 1 |
| updated_by | uuid | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `onboarding_sessions_current_step_check`: CHECK (((current_step >= 1) AND (current_step <= 8)))
- `onboarding_sessions_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `onboarding_sessions_updated_by_fkey`: FOREIGN KEY (updated_by) REFERENCES users(id)
- `onboarding_sessions_pkey`: PRIMARY KEY (tenant_id)

## order_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| order_id | uuid |  |  |
| product_id | uuid |  |  |
| variant_id | uuid | yes |  |
| inventory_item_id | uuid |  |  |
| name | text |  |  |
| variant_name | text | yes |  |
| unit_price_minor | bigint |  |  |
| unit_cost_minor | bigint | yes |  |
| quantity | integer |  |  |
| line_total_minor | bigint |  |  |
| returned_qty | integer |  | 0 |

Constraints:
- `order_items_check`: CHECK ((line_total_minor = (unit_price_minor * quantity)))
- `order_items_check1`: CHECK (((returned_qty >= 0) AND (returned_qty <= quantity)))
- `order_items_quantity_check`: CHECK (((quantity >= 1) AND (quantity <= 100)))
- `order_items_unit_price_minor_check`: CHECK ((unit_price_minor >= 0))
- `order_items_tenant_id_inventory_item_id_fkey`: FOREIGN KEY (tenant_id, inventory_item_id) REFERENCES inventory_items(tenant_id, id)
- `order_items_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `order_items_tenant_id_product_id_fkey`: FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
- `order_items_tenant_id_variant_id_fkey`: FOREIGN KEY (tenant_id, variant_id) REFERENCES product_variants(tenant_id, id)
- `order_items_pkey`: PRIMARY KEY (id)
- `order_items_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX order_items_line ON public.order_items USING btree (tenant_id, order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))

## orders · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| number | text |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| status | text |  |  |
| refund_status | text |  | 'none'::text |
| fulfillment_method | text |  | 'pickup'::text |
| booking_id | uuid | yes |  |
| currency | character |  | 'SAR'::bpchar |
| subtotal_minor | bigint |  |  |
| discount_minor | bigint |  | 0 |
| tax_minor | bigint |  | 0 |
| total_minor | bigint |  |  |
| paid_minor | bigint |  | 0 |
| refunded_minor | bigint |  | 0 |
| payment_terms | text |  | 'full'::text |
| terms_snapshot | jsonb |  | '{}'::jsonb |
| hold_expires_at | timestamp with time zone | yes |  |
| stock_released_at | timestamp with time zone | yes |  |
| cancelled_at | timestamp with time zone | yes |  |
| cancel_reason | text | yes |  |
| created_by | uuid | yes |  |
| version | integer |  | 1 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `orders_check`: CHECK ((total_minor = ((subtotal_minor - discount_minor) + tax_minor)))
- `orders_discount_minor_check`: CHECK ((discount_minor >= 0))
- `orders_fulfillment_method_check`: CHECK ((fulfillment_method = ANY (ARRAY['pickup'::text, 'delivery'::text])))
- `orders_fulfillment_method_check1`: CHECK ((fulfillment_method = 'pickup'::text))
- `orders_paid_minor_check`: CHECK ((paid_minor >= 0))
- `orders_payment_terms_check`: CHECK ((payment_terms = ANY (ARRAY['full'::text, 'on_site'::text, 'manual_approval'::text])))
- `orders_refund_status_check`: CHECK ((refund_status = ANY (ARRAY['none'::text, 'pending'::text, 'partial'::text, 'full'::text])))
- `orders_refunded_minor_check`: CHECK ((refunded_minor >= 0))
- `orders_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'pending_payment'::text, 'paid'::text, 'preparing'::text, 'ready'::text, 'collected'::text, 'cancelled'::text])))
- `orders_subtotal_minor_check`: CHECK ((subtotal_minor >= 0))
- `orders_tax_minor_check`: CHECK ((tax_minor >= 0))
- `orders_total_minor_check`: CHECK ((total_minor >= 0))
- `orders_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `orders_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `orders_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `orders_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `orders_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `orders_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `orders_pkey`: PRIMARY KEY (id)
- `orders_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `orders_tenant_id_number_key`: UNIQUE (tenant_id, number)

## outbox_events

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('outbox_events_id_seq'::regclass) |
| tenant_id | uuid | yes |  |
| topic | text |  |  |
| payload | jsonb |  |  |
| dedupe_key | text | yes |  |
| available_at | timestamp with time zone |  | now() |
| attempts | integer |  | 0 |
| processed_at | timestamp with time zone | yes |  |
| last_error | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `outbox_events_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `outbox_events_pkey`: PRIMARY KEY (id)
- `outbox_events_dedupe_key_key`: UNIQUE (dedupe_key)

## package_items · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| package_id | uuid |  |  |
| service_id | uuid |  |  |
| quantity | integer |  | 1 |
| sort | integer |  | 0 |

Constraints:
- `package_items_quantity_check`: CHECK (((quantity >= 1) AND (quantity <= 50)))
- `package_items_tenant_id_package_id_fkey`: FOREIGN KEY (tenant_id, package_id) REFERENCES packages(tenant_id, id)
- `package_items_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `package_items_pkey`: PRIMARY KEY (tenant_id, package_id, service_id)

## packages · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| description | text | yes |  |
| price_minor | bigint |  |  |
| status | text |  | 'active'::text |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `packages_price_minor_check`: CHECK ((price_minor >= 0))
- `packages_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'hidden'::text, 'archived'::text])))
- `packages_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `packages_pkey`: PRIMARY KEY (id)
- `packages_tenant_id_id_key`: UNIQUE (tenant_id, id)

## page_versions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| number | integer |  |  |
| document | jsonb |  |  |
| draft_version | integer |  |  |
| published_by | uuid | yes |  |
| published_at | timestamp with time zone |  | now() |
| restored_from_id | uuid | yes |  |
| note | text | yes |  |

Constraints:
- `page_versions_published_by_fkey`: FOREIGN KEY (published_by) REFERENCES users(id)
- `page_versions_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `page_versions_pkey`: PRIMARY KEY (id)
- `page_versions_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `page_versions_tenant_id_number_key`: UNIQUE (tenant_id, number)

## payment_accounts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| provider | text |  |  |
| mode | text |  | 'test'::text |
| status | text |  | 'disconnected'::text |
| publishable_key | text | yes |  |
| secret_ciphertext | text | yes |  |
| webhook_secret_ciphertext | text | yes |  |
| methods_enabled | ARRAY |  | '{}'::text[] |
| settlement_owner | text |  | 'tenant'::text |
| verified_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `payment_accounts_mode_check`: CHECK ((mode = ANY (ARRAY['test'::text, 'live'::text])))
- `payment_accounts_provider_check`: CHECK ((provider = ANY (ARRAY['sandbox'::text, 'moyasar'::text, 'manual'::text])))
- `payment_accounts_settlement_owner_check`: CHECK ((settlement_owner = ANY (ARRAY['tenant'::text, 'platform'::text])))
- `payment_accounts_status_check`: CHECK ((status = ANY (ARRAY['disconnected'::text, 'pending_verification'::text, 'active'::text, 'disabled'::text])))
- `payment_accounts_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `payment_accounts_pkey`: PRIMARY KEY (id)
- `payment_accounts_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX payment_accounts_one_active ON public.payment_accounts USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = 'active'::text)

## payment_attempts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| payment_id | uuid |  |  |
| provider | text |  |  |
| action | text |  |  |
| status | text |  |  |
| provider_ref | text | yes |  |
| error | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `payment_attempts_tenant_id_payment_id_fkey`: FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id)
- `payment_attempts_pkey`: PRIMARY KEY (id)

## payments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| payment_account_id | uuid | yes |  |
| purpose | text |  |  |
| booking_id | uuid | yes |  |
| order_id | uuid | yes |  |
| ref_id | uuid | yes |  |
| kind | text |  |  |
| method | text | yes |  |
| amount_minor | bigint |  |  |
| currency | character |  | 'SAR'::bpchar |
| status | text |  | 'pending'::text |
| provider | text |  |  |
| provider_payment_id | text | yes |  |
| checkout_url | text | yes |  |
| collected_by | uuid | yes |  |
| collection_ref | text | yes |  |
| idempotency_key | text |  |  |
| failure_reason | text | yes |  |
| refunded_minor | bigint |  | 0 |
| succeeded_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `payments_amount_minor_check`: CHECK ((amount_minor > 0))
- `payments_check`: CHECK ((refunded_minor <= amount_minor))
- `payments_check1`: CHECK (((purpose = 'booking'::text) = (booking_id IS NOT NULL)))
- `payments_check2`: CHECK (((purpose = 'order'::text) = (order_id IS NOT NULL)))
- `payments_kind_check`: CHECK ((kind = ANY (ARRAY['full'::text, 'deposit'::text, 'balance'::text, 'on_site'::text])))
- `payments_purpose_check`: CHECK ((purpose = ANY (ARRAY['booking'::text, 'order'::text, 'gift_card'::text, 'membership'::text])))
- `payments_refunded_minor_check`: CHECK ((refunded_minor >= 0))
- `payments_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'expired'::text, 'needs_review'::text])))
- `payments_collected_by_fkey`: FOREIGN KEY (collected_by) REFERENCES users(id)
- `payments_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `payments_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `payments_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `payments_tenant_id_payment_account_id_fkey`: FOREIGN KEY (tenant_id, payment_account_id) REFERENCES payment_accounts(tenant_id, id)
- `payments_pkey`: PRIMARY KEY (id)
- `payments_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `payments_tenant_id_idempotency_key_key`: UNIQUE (tenant_id, idempotency_key)
- UNIQUE INDEX payments_provider_ref ON public.payments USING btree (provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL)

## payouts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| provider | text |  |  |
| provider_payout_id | text |  |  |
| amount_minor | bigint |  |  |
| fees_minor | bigint |  | 0 |
| currency | character |  | 'SAR'::bpchar |
| settled_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `payouts_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `payouts_pkey`: PRIMARY KEY (id)
- `payouts_provider_provider_payout_id_key`: UNIQUE (provider, provider_payout_id)

## permissions

| column | type | null | default |
|---|---|---|---|
| key | text |  |  |
| category | text |  |  |
| description | text |  |  |
| delegable_to | ARRAY |  | '{}'::text[] |

Constraints:
- `permissions_pkey`: PRIMARY KEY (key)

## plan_comments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| plan_id | uuid |  |  |
| author_id | uuid |  |  |
| body | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `plan_comments_body_check`: CHECK (((length(body) >= 1) AND (length(body) <= 2000)))
- `plan_comments_author_id_fkey`: FOREIGN KEY (author_id) REFERENCES users(id)
- `plan_comments_tenant_id_plan_id_fkey`: FOREIGN KEY (tenant_id, plan_id) REFERENCES marketing_plans(tenant_id, id)
- `plan_comments_pkey`: PRIMARY KEY (id)

## plan_features

| column | type | null | default |
|---|---|---|---|
| plan_id | uuid |  |  |
| feature_key | text |  |  |
| enabled | boolean |  | true |
| limit_value | integer | yes |  |

Constraints:
- `plan_features_limit_value_check`: CHECK ((limit_value >= 0))
- `plan_features_plan_id_fkey`: FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
- `plan_features_pkey`: PRIMARY KEY (plan_id, feature_key)

## plan_versions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| plan_id | uuid |  |  |
| number | integer |  |  |
| content | jsonb |  |  |
| change_note | text | yes |  |
| ai_run_id | uuid | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `plan_versions_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `plan_versions_tenant_id_plan_id_fkey`: FOREIGN KEY (tenant_id, plan_id) REFERENCES marketing_plans(tenant_id, id)
- `plan_versions_pkey`: PRIMARY KEY (id)
- `plan_versions_tenant_id_plan_id_number_key`: UNIQUE (tenant_id, plan_id, number)

## plans

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| code | text |  |  |
| name_ar | text |  |  |
| name_en | text |  |  |
| price_monthly_minor | bigint | yes |  |
| price_yearly_minor | bigint | yes |  |
| price_is_test | boolean |  | true |
| currency | character |  | 'SAR'::bpchar |
| trial_days | integer |  | 14 |
| grace_days | integer |  | 7 |
| powered_by_required | boolean |  | true |
| status | text |  | 'active'::text |
| sort | integer |  | 0 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `plans_code_check`: CHECK ((code ~ '^[a-z0-9_]+$'::text))
- `plans_grace_days_check`: CHECK (((grace_days >= 0) AND (grace_days <= 60)))
- `plans_price_monthly_minor_check`: CHECK ((price_monthly_minor >= 0))
- `plans_price_yearly_minor_check`: CHECK ((price_yearly_minor >= 0))
- `plans_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))
- `plans_trial_days_check`: CHECK (((trial_days >= 0) AND (trial_days <= 90)))
- `plans_pkey`: PRIMARY KEY (id)
- `plans_code_key`: UNIQUE (code)

## platform_invoices · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| subscription_id | uuid |  |  |
| number | text |  |  |
| amount_minor | bigint |  |  |
| currency | character |  | 'SAR'::bpchar |
| status | text |  |  |
| is_test | boolean |  | true |
| issued_at | timestamp with time zone |  | now() |
| paid_at | timestamp with time zone | yes |  |
| provider_ref | text | yes |  |

Constraints:
- `platform_invoices_amount_minor_check`: CHECK ((amount_minor >= 0))
- `platform_invoices_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text])))
- `platform_invoices_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `platform_invoices_tenant_id_subscription_id_fkey`: FOREIGN KEY (tenant_id, subscription_id) REFERENCES subscriptions(tenant_id, id)
- `platform_invoices_pkey`: PRIMARY KEY (id)
- `platform_invoices_number_key`: UNIQUE (number)

## platform_staff

| column | type | null | default |
|---|---|---|---|
| user_id | uuid |  |  |
| role | text |  |  |
| status | text |  | 'active'::text |
| granted_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `platform_staff_role_check`: CHECK ((role = ANY (ARRAY['platform_owner'::text, 'support_admin'::text, 'policy_reviewer'::text, 'tech_admin'::text])))
- `platform_staff_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
- `platform_staff_granted_by_fkey`: FOREIGN KEY (granted_by) REFERENCES users(id)
- `platform_staff_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `platform_staff_pkey`: PRIMARY KEY (user_id)

## points_entries · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| account_id | uuid |  |  |
| kind | text |  |  |
| points | integer |  |  |
| ref_type | text | yes |  |
| ref_id | uuid | yes |  |
| reason | text | yes |  |
| expires_at | timestamp with time zone | yes |  |
| actor_user_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `points_entries_kind_check`: CHECK ((kind = ANY (ARRAY['earn'::text, 'redeem'::text, 'reverse'::text, 'expire'::text, 'adjust'::text])))
- `points_entries_points_check`: CHECK ((points <> 0))
- `points_entries_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `points_entries_tenant_id_account_id_fkey`: FOREIGN KEY (tenant_id, account_id) REFERENCES loyalty_accounts(tenant_id, id)
- `points_entries_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX points_entries_once ON public.points_entries USING btree (tenant_id, account_id, kind, ref_type, ref_id) WHERE ((ref_id IS NOT NULL) AND (kind = ANY (ARRAY['earn'::text, 'reverse'::text, 'redeem'::text])))

## policy_decisions

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| customer_user_id | uuid |  |  |
| scope | text |  |  |
| tenant_id | uuid | yes |  |
| action | text |  |  |
| reason_code | text |  |  |
| reason_internal | text |  |  |
| customer_explanation | text |  |  |
| evidence_refs | ARRAY |  | '{}'::uuid[] |
| reviewer_user_id | uuid |  |  |
| reviewer_role | text |  |  |
| effective_at | timestamp with time zone |  | now() |
| expires_at | timestamp with time zone | yes |  |
| review_at | timestamp with time zone | yes |  |
| supersedes_id | uuid | yes |  |
| status | text |  | 'active'::text |
| is_experimental | boolean |  | false |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `policy_decisions_action_check`: CHECK ((action = ANY (ARRAY['default'::text, 'require_deposit'::text, 'require_full_payment'::text, 'manual_approval'::text, 'suspend_account'::text])))
- `policy_decisions_check`: CHECK (((scope = 'platform'::text) = (tenant_id IS NULL)))
- `policy_decisions_check1`: CHECK (((expires_at IS NULL) OR (expires_at > effective_at)))
- `policy_decisions_check2`: CHECK (((action <> 'suspend_account'::text) OR (scope = 'platform'::text)))
- `policy_decisions_scope_check`: CHECK ((scope = ANY (ARRAY['tenant'::text, 'platform'::text])))
- `policy_decisions_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'revoked'::text, 'expired'::text])))
- `policy_decisions_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `policy_decisions_reviewer_user_id_fkey`: FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
- `policy_decisions_supersedes_id_fkey`: FOREIGN KEY (supersedes_id) REFERENCES policy_decisions(id)
- `policy_decisions_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `policy_decisions_pkey`: PRIMARY KEY (id)

## policy_rules · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| scope | text |  |  |
| name | text |  |  |
| incident_type | text |  |  |
| min_confirmed_incidents | integer |  |  |
| window_days | integer |  |  |
| min_distinct_tenants | integer |  | 1 |
| suggested_action | text |  |  |
| is_experimental | boolean |  | true |
| enabled | boolean |  | false |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `policy_rules_check`: CHECK (((scope = 'platform'::text) = (tenant_id IS NULL)))
- `policy_rules_min_confirmed_incidents_check`: CHECK ((min_confirmed_incidents >= 1))
- `policy_rules_scope_check`: CHECK ((scope = ANY (ARRAY['tenant'::text, 'platform'::text])))
- `policy_rules_suggested_action_check`: CHECK ((suggested_action = ANY (ARRAY['require_deposit'::text, 'require_full_payment'::text, 'manual_approval'::text])))
- `policy_rules_window_days_check`: CHECK (((window_days >= 1) AND (window_days <= 730)))
- `policy_rules_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `policy_rules_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `policy_rules_pkey`: PRIMARY KEY (id)

## preview_tokens · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| token_hash | bytea |  |  |
| expires_at | timestamp with time zone |  |  |
| created_by | uuid |  |  |
| revoked_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `preview_tokens_check`: CHECK ((expires_at <= (created_at + '7 days'::interval)))
- `preview_tokens_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `preview_tokens_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `preview_tokens_pkey`: PRIMARY KEY (id)
- `preview_tokens_token_hash_key`: UNIQUE (token_hash)

## product_images · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| product_id | uuid |  |  |
| asset_id | uuid |  |  |
| sort | integer |  | 0 |

Constraints:
- `product_images_tenant_id_asset_id_fkey`: FOREIGN KEY (tenant_id, asset_id) REFERENCES assets(tenant_id, id)
- `product_images_tenant_id_product_id_fkey`: FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
- `product_images_pkey`: PRIMARY KEY (tenant_id, product_id, asset_id)

## product_variants · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| product_id | uuid |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| sku | text | yes |  |
| price_minor | bigint | yes |  |
| cost_minor | bigint | yes |  |
| status | text |  | 'active'::text |

Constraints:
- `product_variants_cost_minor_check`: CHECK ((cost_minor >= 0))
- `product_variants_price_minor_check`: CHECK ((price_minor >= 0))
- `product_variants_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `product_variants_tenant_id_product_id_fkey`: FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id)
- `product_variants_pkey`: PRIMARY KEY (id)
- `product_variants_tenant_id_id_key`: UNIQUE (tenant_id, id)

## products · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| category_id | uuid | yes |  |
| sku | text | yes |  |
| barcode | text | yes |  |
| name | text |  |  |
| name_en | text | yes |  |
| description | text | yes |  |
| description_en | text | yes |  |
| price_minor | bigint |  |  |
| cost_minor | bigint | yes |  |
| currency | character |  | 'SAR'::bpchar |
| status | text |  | 'active'::text |
| is_visible | boolean |  | true |
| hide_when_out_of_stock | boolean |  | false |
| max_per_order | integer |  | 10 |
| returnable | boolean |  | false |
| sort | integer |  | 0 |
| version | integer |  | 1 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `products_cost_minor_check`: CHECK ((cost_minor >= 0))
- `products_description_check`: CHECK ((length(description) <= 4000))
- `products_description_en_check`: CHECK ((length(description_en) <= 4000))
- `products_max_per_order_check`: CHECK (((max_per_order >= 1) AND (max_per_order <= 100)))
- `products_name_check`: CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 160)))
- `products_price_minor_check`: CHECK ((price_minor >= 0))
- `products_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
- `products_tenant_id_category_id_fkey`: FOREIGN KEY (tenant_id, category_id) REFERENCES categories(tenant_id, id)
- `products_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `products_pkey`: PRIMARY KEY (id)
- `products_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX products_sku ON public.products USING btree (tenant_id, sku) WHERE (sku IS NOT NULL)

## prompt_versions

| column | type | null | default |
|---|---|---|---|
| id | text |  |  |
| purpose | text |  |  |
| template_sha256 | text |  |  |
| notes | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `prompt_versions_pkey`: PRIMARY KEY (id)

## provider_events

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| provider | text |  |  |
| event_id | text |  |  |
| event_type | text |  |  |
| tenant_id | uuid | yes |  |
| signature_valid | boolean |  |  |
| payload | jsonb |  |  |
| received_at | timestamp with time zone |  | now() |
| processed_at | timestamp with time zone | yes |  |
| outcome | text | yes |  |
| error | text | yes |  |

Constraints:
- `provider_events_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `provider_events_pkey`: PRIMARY KEY (id)
- `provider_events_provider_event_id_key`: UNIQUE (provider, event_id)

## rate_limit_buckets

| column | type | null | default |
|---|---|---|---|
| key | text |  |  |
| window_start | timestamp with time zone |  |  |
| count | integer |  |  |

Constraints:
- `rate_limit_buckets_pkey`: PRIMARY KEY (key)

## recommendations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| plan_id | uuid | yes |  |
| category | text |  |  |
| horizon | text |  |  |
| title | text |  |  |
| content | jsonb |  |  |
| validation | jsonb |  | '{}'::jsonb |
| status | text |  | 'proposed'::text |
| source_type | text |  |  |
| provenance | jsonb |  | '{}'::jsonb |
| data_as_of | timestamp with time zone |  |  |
| review_at | timestamp with time zone | yes |  |
| expires_at | timestamp with time zone | yes |  |
| ai_run_id | uuid | yes |  |
| decided_by | uuid | yes |  |
| decided_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `recommendations_category_check`: CHECK ((category = ANY (ARRAY['quiet_periods'::text, 'reactivation'::text, 'seasonal'::text, 'service_promotion'::text, 'packages'::text, 'cross_sell'::text, 'loyalty'::text, 'content'::text, 'pricing_review'::text, 'boo
- `recommendations_horizon_check`: CHECK ((horizon = ANY (ARRAY['weekly'::text, 'monthly'::text, 'ongoing'::text])))
- `recommendations_source_type_check`: CHECK ((source_type = ANY (ARRAY['ai'::text, 'rules'::text, 'example'::text])))
- `recommendations_status_check`: CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'dismissed'::text, 'deferred'::text, 'expired'::text, 'superseded'::text])))
- `recommendations_decided_by_fkey`: FOREIGN KEY (decided_by) REFERENCES users(id)
- `recommendations_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `recommendations_tenant_id_plan_id_fkey`: FOREIGN KEY (tenant_id, plan_id) REFERENCES marketing_plans(tenant_id, id)
- `recommendations_pkey`: PRIMARY KEY (id)
- `recommendations_tenant_id_id_key`: UNIQUE (tenant_id, id)

## reconciliation_runs · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| kind | text |  |  |
| started_at | timestamp with time zone |  | now() |
| finished_at | timestamp with time zone | yes |  |
| checked | integer |  | 0 |
| mismatches | jsonb |  | '[]'::jsonb |
| actions | jsonb |  | '[]'::jsonb |
| status | text |  | 'running'::text |

Constraints:
- `reconciliation_runs_kind_check`: CHECK ((kind = ANY (ARRAY['payments'::text, 'holds'::text, 'stock'::text])))
- `reconciliation_runs_status_check`: CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
- `reconciliation_runs_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id)
- `reconciliation_runs_pkey`: PRIMARY KEY (id)

## refunds · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| payment_id | uuid |  |  |
| amount_minor | bigint |  |  |
| currency | character |  | 'SAR'::bpchar |
| status | text |  | 'pending'::text |
| reason | text |  |  |
| terms_basis | jsonb |  | '{}'::jsonb |
| provider_refund_id | text | yes |  |
| requested_by | uuid | yes |  |
| idempotency_key | text |  |  |
| failure_reason | text | yes |  |
| completed_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `refunds_amount_minor_check`: CHECK ((amount_minor > 0))
- `refunds_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
- `refunds_requested_by_fkey`: FOREIGN KEY (requested_by) REFERENCES users(id)
- `refunds_tenant_id_payment_id_fkey`: FOREIGN KEY (tenant_id, payment_id) REFERENCES payments(tenant_id, id)
- `refunds_pkey`: PRIMARY KEY (id)
- `refunds_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `refunds_tenant_id_idempotency_key_key`: UNIQUE (tenant_id, idempotency_key)
- UNIQUE INDEX refunds_provider_ref ON public.refunds USING btree (provider_refund_id) WHERE (provider_refund_id IS NOT NULL)

## resource_types · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| name | text |  |  |

Constraints:
- `resource_types_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `resource_types_pkey`: PRIMARY KEY (id)
- `resource_types_tenant_id_id_key`: UNIQUE (tenant_id, id)

## resources · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| resource_type_id | uuid |  |  |
| name | text |  |  |
| status | text |  | 'active'::text |

Constraints:
- `resources_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `resources_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `resources_tenant_id_resource_type_id_fkey`: FOREIGN KEY (tenant_id, resource_type_id) REFERENCES resource_types(tenant_id, id)
- `resources_pkey`: PRIMARY KEY (id)
- `resources_tenant_id_id_key`: UNIQUE (tenant_id, id)

## returns · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| order_id | uuid |  |  |
| order_item_id | uuid |  |  |
| quantity | integer |  |  |
| reason | text |  |  |
| status | text |  | 'requested'::text |
| restock | boolean |  | false |
| refund_id | uuid | yes |  |
| decided_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `returns_quantity_check`: CHECK ((quantity > 0))
- `returns_status_check`: CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'completed'::text])))
- `returns_decided_by_fkey`: FOREIGN KEY (decided_by) REFERENCES users(id)
- `returns_refund_fk`: FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds(tenant_id, id)
- `returns_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `returns_tenant_id_order_item_id_fkey`: FOREIGN KEY (tenant_id, order_item_id) REFERENCES order_items(tenant_id, id)
- `returns_pkey`: PRIMARY KEY (id)

## reviews · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| booking_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| staff_id | uuid | yes |  |
| rating | smallint |  |  |
| comment | text | yes |  |
| display_name | text |  |  |
| status | text |  | 'published'::text |
| business_response | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `reviews_business_response_check`: CHECK ((length(business_response) <= 2000))
- `reviews_comment_check`: CHECK ((length(comment) <= 2000))
- `reviews_rating_check`: CHECK (((rating >= 1) AND (rating <= 5)))
- `reviews_status_check`: CHECK ((status = ANY (ARRAY['published'::text, 'hidden'::text, 'flagged'::text])))
- `reviews_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `reviews_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `reviews_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `reviews_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `reviews_pkey`: PRIMARY KEY (id)
- `reviews_tenant_id_booking_id_key`: UNIQUE (tenant_id, booking_id)
- `reviews_tenant_id_id_key`: UNIQUE (tenant_id, id)

## reward_redemptions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| coupon_id | uuid | yes |  |
| reward_id | uuid | yes |  |
| points_entry_id | uuid | yes |  |
| booking_id | uuid | yes |  |
| order_id | uuid | yes |  |
| discount_minor | bigint |  |  |
| status | text |  | 'applied'::text |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `reward_redemptions_check`: CHECK (((coupon_id IS NOT NULL) OR (reward_id IS NOT NULL)))
- `reward_redemptions_discount_minor_check`: CHECK ((discount_minor >= 0))
- `reward_redemptions_status_check`: CHECK ((status = ANY (ARRAY['applied'::text, 'reversed'::text])))
- `reward_redemptions_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `reward_redemptions_tenant_id_coupon_id_fkey`: FOREIGN KEY (tenant_id, coupon_id) REFERENCES coupons(tenant_id, id)
- `reward_redemptions_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `reward_redemptions_tenant_id_reward_id_fkey`: FOREIGN KEY (tenant_id, reward_id) REFERENCES loyalty_rewards(tenant_id, id)
- `reward_redemptions_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `reward_redemptions_pkey`: PRIMARY KEY (id)

## role_permissions

| column | type | null | default |
|---|---|---|---|
| role_key | text |  |  |
| permission_key | text |  |  |

Constraints:
- `role_permissions_permission_key_fkey`: FOREIGN KEY (permission_key) REFERENCES permissions(key)
- `role_permissions_role_key_fkey`: FOREIGN KEY (role_key) REFERENCES roles(key)
- `role_permissions_pkey`: PRIMARY KEY (role_key, permission_key)

## roles

| column | type | null | default |
|---|---|---|---|
| key | text |  |  |
| name_ar | text |  |  |
| name_en | text |  |  |

Constraints:
- `roles_key_check`: CHECK ((key = ANY (ARRAY['owner'::text, 'manager'::text, 'receptionist'::text, 'specialist'::text, 'finance'::text])))
- `roles_pkey`: PRIMARY KEY (key)

## service_addons · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| price_minor | bigint |  |  |
| duration_min | integer |  | 0 |
| status | text |  | 'active'::text |

Constraints:
- `service_addons_duration_min_check`: CHECK (((duration_min >= 0) AND (duration_min <= 240)))
- `service_addons_price_minor_check`: CHECK ((price_minor >= 0))
- `service_addons_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `service_addons_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_addons_pkey`: PRIMARY KEY (id)
- `service_addons_tenant_id_id_key`: UNIQUE (tenant_id, id)

## service_material_recipes · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| inventory_item_id | uuid |  |  |
| quantity | numeric |  |  |
| unit | text |  |  |
| approved_by | uuid | yes |  |
| approved_at | timestamp with time zone | yes |  |

Constraints:
- `service_material_recipes_quantity_check`: CHECK ((quantity > (0)::numeric))
- `service_material_recipes_unit_check`: CHECK ((unit = ANY (ARRAY['piece'::text, 'ml'::text, 'l'::text, 'g'::text, 'kg'::text])))
- `service_material_recipes_approved_by_fkey`: FOREIGN KEY (approved_by) REFERENCES users(id)
- `service_material_recipes_tenant_id_inventory_item_id_fkey`: FOREIGN KEY (tenant_id, inventory_item_id) REFERENCES inventory_items(tenant_id, id)
- `service_material_recipes_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_material_recipes_pkey`: PRIMARY KEY (tenant_id, service_id, inventory_item_id)

## service_price_changes · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| current_price_minor | bigint |  |  |
| proposed_price_minor | bigint |  |  |
| reason | text | yes |  |
| source | text |  | 'manual'::text |
| status | text |  | 'pending'::text |
| proposed_by | uuid | yes |  |
| decided_by | uuid | yes |  |
| decided_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `service_price_changes_proposed_price_minor_check`: CHECK ((proposed_price_minor >= 0))
- `service_price_changes_source_check`: CHECK ((source = ANY (ARRAY['manual'::text, 'recommendation'::text])))
- `service_price_changes_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])))
- `service_price_changes_decided_by_fkey`: FOREIGN KEY (decided_by) REFERENCES users(id)
- `service_price_changes_proposed_by_fkey`: FOREIGN KEY (proposed_by) REFERENCES users(id)
- `service_price_changes_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_price_changes_pkey`: PRIMARY KEY (id)

## service_price_rules · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| variant_id | uuid | yes |  |
| staff_id | uuid | yes |  |
| price_minor | bigint | yes |  |
| duration_min | integer | yes |  |

Constraints:
- `service_price_rules_check`: CHECK (((variant_id IS NOT NULL) OR (staff_id IS NOT NULL)))
- `service_price_rules_check1`: CHECK (((price_minor IS NOT NULL) OR (duration_min IS NOT NULL)))
- `service_price_rules_duration_min_check`: CHECK (((duration_min >= 5) AND (duration_min <= 720)))
- `service_price_rules_price_minor_check`: CHECK ((price_minor >= 0))
- `service_price_rules_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_price_rules_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `service_price_rules_tenant_id_variant_id_fkey`: FOREIGN KEY (tenant_id, variant_id) REFERENCES service_variants(tenant_id, id)
- `service_price_rules_pkey`: PRIMARY KEY (id)
- `service_price_rules_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX service_price_rules_uq ON public.service_price_rules USING btree (tenant_id, service_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(staff_id, '00000000-0000-0000-0000-000000

## service_resource_requirements · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| resource_type_id | uuid |  |  |
| quantity | integer |  | 1 |

Constraints:
- `service_resource_requirements_quantity_check`: CHECK (((quantity >= 1) AND (quantity <= 5)))
- `service_resource_requirements_tenant_id_resource_type_id_fkey`: FOREIGN KEY (tenant_id, resource_type_id) REFERENCES resource_types(tenant_id, id)
- `service_resource_requirements_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_resource_requirements_pkey`: PRIMARY KEY (tenant_id, service_id, resource_type_id)

## service_staff · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| staff_id | uuid |  |  |

Constraints:
- `service_staff_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_staff_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `service_staff_pkey`: PRIMARY KEY (tenant_id, service_id, staff_id)

## service_variants · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| service_id | uuid |  |  |
| name | text |  |  |
| name_en | text | yes |  |
| price_minor | bigint |  |  |
| duration_min | integer |  |  |
| status | text |  | 'active'::text |
| sort | integer |  | 0 |

Constraints:
- `service_variants_duration_min_check`: CHECK (((duration_min >= 5) AND (duration_min <= 720)))
- `service_variants_price_minor_check`: CHECK ((price_minor >= 0))
- `service_variants_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
- `service_variants_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `service_variants_pkey`: PRIMARY KEY (id)
- `service_variants_tenant_id_id_key`: UNIQUE (tenant_id, id)

## services · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid | yes |  |
| category_id | uuid | yes |  |
| name | text |  |  |
| name_en | text | yes |  |
| description | text | yes |  |
| description_en | text | yes |  |
| price_minor | bigint |  |  |
| price_is_from | boolean |  | false |
| currency | character |  | 'SAR'::bpchar |
| duration_min | integer |  |  |
| buffer_before_min | integer |  | 0 |
| buffer_after_min | integer |  | 0 |
| image_asset_id | uuid | yes |  |
| status | text |  | 'active'::text |
| is_visible | boolean |  | true |
| internal_booking_when_hidden | boolean |  | true |
| min_notice_min | integer | yes |  |
| max_advance_days | integer | yes |  |
| group_capacity | integer | yes |  |
| material_cost_minor | bigint | yes |  |
| sort | integer |  | 0 |
| version | integer |  | 1 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `services_buffer_after_min_check`: CHECK (((buffer_after_min >= 0) AND (buffer_after_min <= 240)))
- `services_buffer_before_min_check`: CHECK (((buffer_before_min >= 0) AND (buffer_before_min <= 240)))
- `services_description_check`: CHECK ((length(description) <= 4000))
- `services_description_en_check`: CHECK ((length(description_en) <= 4000))
- `services_duration_min_check`: CHECK (((duration_min >= 5) AND (duration_min <= 720)))
- `services_group_capacity_check`: CHECK (((group_capacity >= 2) AND (group_capacity <= 200)))
- `services_material_cost_minor_check`: CHECK ((material_cost_minor >= 0))
- `services_max_advance_days_check`: CHECK (((max_advance_days >= 1) AND (max_advance_days <= 365)))
- `services_min_notice_min_check`: CHECK (((min_notice_min >= 0) AND (min_notice_min <= 20160)))
- `services_name_check`: CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
- `services_price_minor_check`: CHECK ((price_minor >= 0))
- `services_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
- `services_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `services_tenant_id_category_id_fkey`: FOREIGN KEY (tenant_id, category_id) REFERENCES categories(tenant_id, id)
- `services_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `services_tenant_id_image_asset_id_fkey`: FOREIGN KEY (tenant_id, image_asset_id) REFERENCES assets(tenant_id, id)
- `services_pkey`: PRIMARY KEY (id)
- `services_tenant_id_id_key`: UNIQUE (tenant_id, id)

## sessions

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| user_id | uuid |  |  |
| token_hash | bytea |  |  |
| created_at | timestamp with time zone |  | now() |
| last_seen_at | timestamp with time zone |  | now() |
| expires_at | timestamp with time zone |  |  |
| idle_expires_at | timestamp with time zone |  |  |
| revoked_at | timestamp with time zone | yes |  |
| revoked_reason | text | yes |  |
| step_up_at | timestamp with time zone | yes |  |
| ip | inet | yes |  |
| user_agent | text | yes |  |

Constraints:
- `sessions_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `sessions_pkey`: PRIMARY KEY (id)
- `sessions_token_hash_key`: UNIQUE (token_hash)

## shift_overrides · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| staff_id | uuid | yes |  |
| on_date | date |  |  |
| kind | text |  |  |
| start_time | time without time zone | yes |  |
| end_time | time without time zone | yes |  |
| note | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `shift_overrides_check`: CHECK ((((kind = 'closed'::text) AND (start_time IS NULL) AND (end_time IS NULL)) OR ((kind = 'custom'::text) AND (start_time IS NOT NULL) AND (end_time > start_time))))
- `shift_overrides_kind_check`: CHECK ((kind = ANY (ARRAY['closed'::text, 'custom'::text])))
- `shift_overrides_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `shift_overrides_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `shift_overrides_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `shift_overrides_pkey`: PRIMARY KEY (id)

## staff_branch_assignments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| branch_id | uuid |  |  |

Constraints:
- `staff_branch_assignments_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `staff_branch_assignments_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `staff_branch_assignments_pkey`: PRIMARY KEY (tenant_id, staff_id, branch_id)

## staff_profiles · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| user_id | uuid | yes |  |
| display_name | text |  |  |
| display_name_en | text | yes |  |
| specialty | text | yes |  |
| bio | text | yes |  |
| photo_asset_id | uuid | yes |  |
| status | text |  | 'active'::text |
| public_visible | boolean |  | true |
| sort | integer |  | 0 |
| allocation_weight | integer |  | 100 |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |
| version | integer |  | 1 |

Constraints:
- `staff_profiles_allocation_weight_check`: CHECK (((allocation_weight >= 0) AND (allocation_weight <= 1000)))
- `staff_profiles_bio_check`: CHECK ((length(bio) <= 2000))
- `staff_profiles_display_name_check`: CHECK (((length(TRIM(BOTH FROM display_name)) >= 1) AND (length(TRIM(BOTH FROM display_name)) <= 120)))
- `staff_profiles_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])))
- `staff_profiles_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `staff_profiles_tenant_id_photo_asset_id_fkey`: FOREIGN KEY (tenant_id, photo_asset_id) REFERENCES assets(tenant_id, id)
- `staff_profiles_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
- `staff_profiles_pkey`: PRIMARY KEY (id)
- `staff_profiles_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX staff_profiles_user ON public.staff_profiles USING btree (tenant_id, user_id) WHERE (user_id IS NOT NULL)

## staff_requests · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| staff_id | uuid |  |  |
| kind | text |  |  |
| details | text |  |  |
| status | text |  | 'pending'::text |
| reviewed_by | uuid | yes |  |
| reviewed_at | timestamp with time zone | yes |  |
| review_note | text | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `staff_requests_details_check`: CHECK ((length(details) <= 2000))
- `staff_requests_kind_check`: CHECK ((kind = ANY (ARRAY['schedule_change'::text, 'advance'::text, 'equipment'::text, 'other'::text])))
- `staff_requests_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
- `staff_requests_reviewed_by_fkey`: FOREIGN KEY (reviewed_by) REFERENCES users(id)
- `staff_requests_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `staff_requests_pkey`: PRIMARY KEY (id)

## stock_movements · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| inventory_item_id | uuid |  |  |
| kind | text |  |  |
| on_hand_delta | numeric |  | 0 |
| reserved_delta | numeric |  | 0 |
| reason | text | yes |  |
| ref_type | text | yes |  |
| ref_id | uuid | yes |  |
| actor_user_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `stock_movements_kind_check`: CHECK ((kind = ANY (ARRAY['receipt'::text, 'reservation'::text, 'sale'::text, 'release'::text, 'return'::text, 'adjustment'::text, 'consumption'::text])))
- `stock_movements_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `stock_movements_tenant_id_inventory_item_id_fkey`: FOREIGN KEY (tenant_id, inventory_item_id) REFERENCES inventory_items(tenant_id, id)
- `stock_movements_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX stock_movements_once ON public.stock_movements USING btree (tenant_id, inventory_item_id, kind, ref_type, ref_id) WHERE ((ref_id IS NOT NULL) AND (kind = ANY (ARRAY['reservation'::text, 'sale'::text, 'releas

## stock_reservations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| inventory_item_id | uuid |  |  |
| order_id | uuid |  |  |
| quantity | numeric |  |  |
| status | text |  | 'active'::text |
| expires_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `stock_reservations_quantity_check`: CHECK ((quantity > (0)::numeric))
- `stock_reservations_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'consumed'::text, 'released'::text])))
- `stock_reservations_tenant_id_inventory_item_id_fkey`: FOREIGN KEY (tenant_id, inventory_item_id) REFERENCES inventory_items(tenant_id, id)
- `stock_reservations_tenant_id_order_id_fkey`: FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)
- `stock_reservations_pkey`: PRIMARY KEY (id)
- `stock_reservations_tenant_id_order_id_inventory_item_id_key`: UNIQUE (tenant_id, order_id, inventory_item_id)

## storefront_drafts · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| document | jsonb |  |  |
| version | integer |  | 1 |
| base_version_id | uuid | yes |  |
| updated_by | uuid | yes |  |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `storefront_drafts_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `storefront_drafts_updated_by_fkey`: FOREIGN KEY (updated_by) REFERENCES users(id)
- `storefront_drafts_pkey`: PRIMARY KEY (tenant_id)

## subscription_events · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | bigint |  | nextval('subscription_events_id_seq'::regclass) |
| tenant_id | uuid |  |  |
| subscription_id | uuid |  |  |
| type | text |  |  |
| from_status | text | yes |  |
| to_status | text | yes |  |
| data | jsonb |  | '{}'::jsonb |
| actor_user_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `subscription_events_actor_user_id_fkey`: FOREIGN KEY (actor_user_id) REFERENCES users(id)
- `subscription_events_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `subscription_events_tenant_id_subscription_id_fkey`: FOREIGN KEY (tenant_id, subscription_id) REFERENCES subscriptions(tenant_id, id)
- `subscription_events_pkey`: PRIMARY KEY (id)

## subscriptions · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| plan_id | uuid |  |  |
| status | text |  |  |
| trial_ends_at | timestamp with time zone | yes |  |
| current_period_start | timestamp with time zone | yes |  |
| current_period_end | timestamp with time zone | yes |  |
| grace_until | timestamp with time zone | yes |  |
| cancel_at | timestamp with time zone | yes |  |
| overage_state | text |  | 'none'::text |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `subscriptions_overage_state_check`: CHECK ((overage_state = ANY (ARRAY['none'::text, 'over_limit'::text])))
- `subscriptions_status_check`: CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'cancelled'::text, 'expired'::text])))
- `subscriptions_plan_id_fkey`: FOREIGN KEY (plan_id) REFERENCES plans(id)
- `subscriptions_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `subscriptions_pkey`: PRIMARY KEY (id)
- `subscriptions_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX subscriptions_one_live ON public.subscriptions USING btree (tenant_id) WHERE (status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text]))

## support_access_grants · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| platform_user_id | uuid |  |  |
| reason | text |  |  |
| access_level | text |  | 'read'::text |
| starts_at | timestamp with time zone |  | now() |
| expires_at | timestamp with time zone |  |  |
| revoked_at | timestamp with time zone | yes |  |
| created_by | uuid |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `support_access_grants_access_level_check`: CHECK ((access_level = ANY (ARRAY['read'::text, 'write'::text])))
- `support_access_grants_check`: CHECK (((expires_at > starts_at) AND (expires_at <= (starts_at + '24:00:00'::interval))))
- `support_access_grants_reason_check`: CHECK ((length(TRIM(BOTH FROM reason)) >= 10))
- `support_access_grants_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `support_access_grants_platform_user_id_fkey`: FOREIGN KEY (platform_user_id) REFERENCES users(id)
- `support_access_grants_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `support_access_grants_pkey`: PRIMARY KEY (id)

## suppression_list · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| channel | text |  |  |
| destination_hash | bytea |  |  |
| reason | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `suppression_list_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `suppression_list_pkey`: PRIMARY KEY (id)
- `suppression_list_tenant_id_channel_destination_hash_key`: UNIQUE (tenant_id, channel, destination_hash)

## templates · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| name | text |  |  |
| name_en | text | yes |  |
| description | text | yes |  |
| document | jsonb |  |  |
| status | text |  | 'approved'::text |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `templates_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'retired'::text])))
- `templates_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `templates_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `templates_pkey`: PRIMARY KEY (id)

## tenant_counters · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| name | text |  |  |
| value | bigint |  | 0 |

Constraints:
- `tenant_counters_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `tenant_counters_pkey`: PRIMARY KEY (tenant_id, name)

## tenant_customers · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| user_id | uuid | yes |  |
| customer_user_id | uuid | yes |  |
| display_name | text |  |  |
| phone | text | yes |  |
| email | USER-DEFINED | yes |  |
| private_notes | text | yes |  |
| tags | ARRAY |  | '{}'::text[] |
| source | text | yes |  |
| first_seen_at | timestamp with time zone |  | now() |
| archived_at | timestamp with time zone | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `tenant_customers_display_name_check`: CHECK (((length(TRIM(BOTH FROM display_name)) >= 1) AND (length(TRIM(BOTH FROM display_name)) <= 120)))
- `tenant_customers_private_notes_check`: CHECK ((length(private_notes) <= 4000))
- `tenant_customers_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `tenant_customers_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id)
- `tenant_customers_pkey`: PRIMARY KEY (id)
- `tenant_customers_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX tenant_customers_user ON public.tenant_customers USING btree (tenant_id, user_id) WHERE (user_id IS NOT NULL)

## tenant_memberships · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| user_id | uuid |  |  |
| role | text |  |  |
| status | text |  | 'active'::text |
| granted_caps | ARRAY |  | '{}'::text[] |
| revoked_caps | ARRAY |  | '{}'::text[] |
| staff_profile_id | uuid | yes |  |
| branch_ids | ARRAY | yes |  |
| invited_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `tenant_memberships_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'removed'::text])))
- `memberships_staff_fk`: FOREIGN KEY (tenant_id, staff_profile_id) REFERENCES staff_profiles(tenant_id, id)
- `tenant_memberships_invited_by_fkey`: FOREIGN KEY (invited_by) REFERENCES users(id)
- `tenant_memberships_role_fkey`: FOREIGN KEY (role) REFERENCES roles(key)
- `tenant_memberships_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `tenant_memberships_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `tenant_memberships_pkey`: PRIMARY KEY (id)
- `tenant_memberships_tenant_id_id_key`: UNIQUE (tenant_id, id)
- `tenant_memberships_tenant_id_user_id_key`: UNIQUE (tenant_id, user_id)
- UNIQUE INDEX memberships_one_owner ON public.tenant_memberships USING btree (tenant_id) WHERE ((role = 'owner'::text) AND (status = 'active'::text))

## tenant_profiles · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| tagline | text | yes |  |
| tagline_en | text | yes |  |
| intro | text | yes |  |
| intro_en | text | yes |  |
| contact_phone | text | yes |  |
| contact_email | USER-DEFINED | yes |  |
| whatsapp | text | yes |  |
| address | text | yes |  |
| socials | jsonb |  | '{}'::jsonb |
| logo_asset_id | uuid | yes |  |
| cover_asset_id | uuid | yes |  |
| wordmark_text | text | yes |  |
| brand_character | ARRAY |  | '{}'::text[] |
| brand_description | text | yes |  |
| excluded_colors | ARRAY |  | '{}'::text[] |
| target_audience | text | yes |  |
| store_priorities | ARRAY |  | '{booking,portfolio,products}'::text[] |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `tenant_profiles_brand_description_check`: CHECK ((length(brand_description) <= 1000))
- `tenant_profiles_intro_check`: CHECK ((length(intro) <= 4000))
- `tenant_profiles_intro_en_check`: CHECK ((length(intro_en) <= 4000))
- `tenant_profiles_tagline_check`: CHECK ((length(tagline) <= 160))
- `tenant_profiles_tagline_en_check`: CHECK ((length(tagline_en) <= 160))
- `tenant_profiles_target_audience_check`: CHECK ((length(target_audience) <= 500))
- `tenant_profiles_tenant_id_cover_asset_id_fkey`: FOREIGN KEY (tenant_id, cover_asset_id) REFERENCES assets(tenant_id, id)
- `tenant_profiles_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `tenant_profiles_tenant_id_logo_asset_id_fkey`: FOREIGN KEY (tenant_id, logo_asset_id) REFERENCES assets(tenant_id, id)
- `tenant_profiles_pkey`: PRIMARY KEY (tenant_id)

## tenants

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| slug | USER-DEFINED |  |  |
| name | text |  |  |
| business_type | text |  |  |
| city | text | yes |  |
| status | text |  | 'onboarding'::text |
| timezone | text |  | 'Asia/Riyadh'::text |
| default_locale | text |  | 'ar'::text |
| currency | character |  | 'SAR'::bpchar |
| legal_name | text | yes |  |
| tax_number | text | yes |  |
| is_demo | boolean |  | false |
| published_version_id | uuid | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `tenants_business_type_check`: CHECK ((business_type = ANY (ARRAY['salon'::text, 'expert'::text, 'spa'::text, 'clinic'::text, 'studio'::text])))
- `tenants_default_locale_check`: CHECK ((default_locale = ANY (ARRAY['ar'::text, 'en'::text])))
- `tenants_name_check`: CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 120)))
- `tenants_slug_check`: CHECK ((slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'::citext))
- `tenants_status_check`: CHECK ((status = ANY (ARRAY['onboarding'::text, 'active'::text, 'suspended'::text, 'archived'::text])))
- `tenants_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `tenants_published_version_fk`: FOREIGN KEY (id, published_version_id) REFERENCES page_versions(tenant_id, id) DEFERRABLE INITIALLY DEFERRED
- `tenants_pkey`: PRIMARY KEY (id)
- `tenants_slug_key`: UNIQUE (slug)

## trend_assessments · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| cluster_key | text |  |  |
| observation_ids | ARRAY |  |  |
| fit | text |  |  |
| rationale | text |  |  |
| application_idea | text | yes |  |
| est_effort | text | yes |  |
| est_cost | text | yes |  |
| valid_until | date | yes |  |
| ai_run_id | uuid | yes |  |
| status | text |  | 'open'::text |
| created_at | timestamp with time zone |  | now() |
| plan_id | uuid | yes |  |

Constraints:
- `trend_assessments_fit_check`: CHECK ((fit = ANY (ARRAY['good'::text, 'partial'::text, 'poor'::text])))
- `trend_assessments_status_check`: CHECK ((status = ANY (ARRAY['open'::text, 'added_to_plan'::text, 'dismissed'::text])))
- `trend_assessments_plan_fk`: FOREIGN KEY (tenant_id, plan_id) REFERENCES marketing_plans(tenant_id, id)
- `trend_assessments_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `trend_assessments_pkey`: PRIMARY KEY (id)

## trend_observations · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| source_id | uuid | yes |  |
| url | text |  |  |
| title | text |  |  |
| summary | text | yes |  |
| published_at | timestamp with time zone | yes |  |
| observed_at | timestamp with time zone |  | now() |
| region | text | yes |  |
| topic | text | yes |  |
| cluster_key | text | yes |  |
| metrics | jsonb |  | '{}'::jsonb |
| evidence_strength | text |  |  |
| content_hash | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `trend_observations_evidence_strength_check`: CHECK ((evidence_strength = ANY (ARRAY['single_example'::text, 'recurring'::text, 'quantified'::text])))
- `trend_observations_source_id_fkey`: FOREIGN KEY (source_id) REFERENCES trend_sources(id) ON DELETE SET NULL
- `trend_observations_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `trend_observations_pkey`: PRIMARY KEY (id)
- UNIQUE INDEX trend_observations_dedupe ON public.trend_observations USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash)

## trend_sources · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid | yes |  |
| kind | text |  |  |
| name | text |  |  |
| url | text |  |  |
| status | text |  | 'disconnected'::text |
| last_fetched_at | timestamp with time zone | yes |  |
| last_error | text | yes |  |
| created_by | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `trend_sources_kind_check`: CHECK ((kind = ANY (ARRAY['rss'::text, 'api'::text, 'user_link'::text])))
- `trend_sources_status_check`: CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text])))
- `trend_sources_created_by_fkey`: FOREIGN KEY (created_by) REFERENCES users(id)
- `trend_sources_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `trend_sources_pkey`: PRIMARY KEY (id)

## unit_conversions

| column | type | null | default |
|---|---|---|---|
| from_unit | text |  |  |
| to_unit | text |  |  |
| factor | numeric |  |  |

Constraints:
- `unit_conversions_factor_check`: CHECK ((factor > (0)::numeric))
- `unit_conversions_pkey`: PRIMARY KEY (from_unit, to_unit)

## usage_counters · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| tenant_id | uuid |  |  |
| metric | text |  |  |
| period | date |  |  |
| value | bigint |  | 0 |

Constraints:
- `usage_counters_tenant_id_fkey`: FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
- `usage_counters_pkey`: PRIMARY KEY (tenant_id, metric, period)

## users

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| email | USER-DEFINED | yes |  |
| phone | text | yes |  |
| email_verified_at | timestamp with time zone | yes |  |
| phone_verified_at | timestamp with time zone | yes |  |
| password_hash | text | yes |  |
| display_name | text |  |  |
| locale | text |  | 'ar'::text |
| status | text |  | 'active'::text |
| failed_login_count | integer |  | 0 |
| locked_until | timestamp with time zone | yes |  |
| password_changed_at | timestamp with time zone | yes |  |
| is_demo | boolean |  | false |
| created_at | timestamp with time zone |  | now() |
| updated_at | timestamp with time zone |  | now() |

Constraints:
- `users_contact`: CHECK (((email IS NOT NULL) OR (phone IS NOT NULL)))
- `users_display_name_check`: CHECK (((length(TRIM(BOTH FROM display_name)) >= 1) AND (length(TRIM(BOTH FROM display_name)) <= 120)))
- `users_locale_check`: CHECK ((locale = ANY (ARRAY['ar'::text, 'en'::text])))
- `users_phone_check`: CHECK ((phone ~ '^\+[1-9][0-9]{7,14}$'::text))
- `users_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'locked'::text, 'disabled'::text])))
- `users_pkey`: PRIMARY KEY (id)
- `users_email_key`: UNIQUE (email)
- `users_phone_key`: UNIQUE (phone)

## verification_codes

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| user_id | uuid | yes |  |
| channel | text |  |  |
| destination | text |  |  |
| purpose | text |  |  |
| code_hash | bytea |  |  |
| expires_at | timestamp with time zone |  |  |
| attempts | integer |  | 0 |
| max_attempts | integer |  | 5 |
| consumed_at | timestamp with time zone | yes |  |
| delivery_mode | text |  |  |
| created_at | timestamp with time zone |  | now() |

Constraints:
- `verification_codes_channel_check`: CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text])))
- `verification_codes_delivery_mode_check`: CHECK ((delivery_mode = ANY (ARRAY['provider'::text, 'dev_outbox'::text])))
- `verification_codes_purpose_check`: CHECK ((purpose = ANY (ARRAY['verify_contact'::text, 'login'::text, 'recovery'::text, 'step_up'::text])))
- `verification_codes_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
- `verification_codes_pkey`: PRIMARY KEY (id)

## waitlist_entries · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| tenant_customer_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| service_id | uuid |  |  |
| staff_id | uuid | yes |  |
| desired_from | date |  |  |
| desired_to | date |  |  |
| time_windows | jsonb |  | '[]'::jsonb |
| notify_consent | boolean |  | false |
| status | text |  | 'active'::text |
| expires_at | timestamp with time zone |  |  |
| created_at | timestamp with time zone |  | now() |
| offers_count | integer |  | 0 |
| service_variant_id | uuid | yes |  |

Constraints:
- `waitlist_entries_check`: CHECK ((desired_to >= desired_from))
- `waitlist_entries_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'offered'::text, 'fulfilled'::text, 'expired'::text, 'cancelled'::text])))
- `waitlist_entries_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `waitlist_entries_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `waitlist_entries_tenant_id_service_id_fkey`: FOREIGN KEY (tenant_id, service_id) REFERENCES services(tenant_id, id)
- `waitlist_entries_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `waitlist_entries_tenant_id_tenant_customer_id_fkey`: FOREIGN KEY (tenant_id, tenant_customer_id) REFERENCES tenant_customers(tenant_id, id)
- `waitlist_entries_pkey`: PRIMARY KEY (id)
- `waitlist_entries_tenant_id_id_key`: UNIQUE (tenant_id, id)

## waitlist_offers · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| waitlist_entry_id | uuid |  |  |
| customer_user_id | uuid | yes |  |
| staff_id | uuid |  |  |
| slot_start | timestamp with time zone |  |  |
| slot_end | timestamp with time zone |  |  |
| rank_reason | text |  |  |
| status | text |  | 'offered'::text |
| expires_at | timestamp with time zone |  |  |
| booking_id | uuid | yes |  |
| created_at | timestamp with time zone |  | now() |
| responded_at | timestamp with time zone | yes |  |

Constraints:
- `waitlist_offers_status_check`: CHECK ((status = ANY (ARRAY['offered'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'superseded'::text])))
- `waitlist_offers_customer_user_id_fkey`: FOREIGN KEY (customer_user_id) REFERENCES users(id)
- `waitlist_offers_tenant_id_booking_id_fkey`: FOREIGN KEY (tenant_id, booking_id) REFERENCES bookings(tenant_id, id)
- `waitlist_offers_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `waitlist_offers_tenant_id_waitlist_entry_id_fkey`: FOREIGN KEY (tenant_id, waitlist_entry_id) REFERENCES waitlist_entries(tenant_id, id)
- `waitlist_offers_pkey`: PRIMARY KEY (id)
- `waitlist_offers_tenant_id_id_key`: UNIQUE (tenant_id, id)
- UNIQUE INDEX waitlist_offers_one_live ON public.waitlist_offers USING btree (tenant_id, staff_id, slot_start) WHERE (status = 'offered'::text)

## working_hours · RLS (forced)

| column | type | null | default |
|---|---|---|---|
| id | uuid |  | gen_random_uuid() |
| tenant_id | uuid |  |  |
| branch_id | uuid |  |  |
| staff_id | uuid | yes |  |
| weekday | smallint |  |  |
| start_time | time without time zone |  |  |
| end_time | time without time zone |  |  |

Constraints:
- `working_hours_check`: CHECK ((end_time > start_time))
- `working_hours_weekday_check`: CHECK (((weekday >= 0) AND (weekday <= 6)))
- `working_hours_tenant_id_branch_id_fkey`: FOREIGN KEY (tenant_id, branch_id) REFERENCES branches(tenant_id, id)
- `working_hours_tenant_id_staff_id_fkey`: FOREIGN KEY (tenant_id, staff_id) REFERENCES staff_profiles(tenant_id, id)
- `working_hours_pkey`: PRIMARY KEY (id)
- `working_hours_tenant_id_id_key`: UNIQUE (tenant_id, id)

