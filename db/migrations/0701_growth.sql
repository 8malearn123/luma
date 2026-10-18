-- LUMA 0701 — growth additions (workstream F)
-- Gift cards bought online: the code is generated at purchase, kept ENCRYPTED only
-- until the purchaser reveals it once, then wiped. Reports never select it.
alter table gift_cards add column code_ciphertext text;
alter table gift_cards add column code_revealed_at timestamptz;
alter table gift_cards add column complimentary boolean not null default false;
alter table gift_cards add column purchaser_user_id uuid references users(id);
create index gift_cards_status on gift_cards(tenant_id, status);

-- waitlist: track how many offers an entry received (declared ranking uses it)
alter table waitlist_entries add column offers_count int not null default 0;
alter table waitlist_entries add column service_variant_id uuid;
create index waitlist_entries_active on waitlist_entries(tenant_id, service_id, created_at) where status = 'active';

-- memberships: sale reference
alter table memberships add column payment_id uuid;
alter table memberships add column sold_by uuid references users(id);
