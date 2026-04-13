alter table public.orders
  add column if not exists factory_production_status text null,
  add column if not exists factory_production_status_index integer null,
  add column if not exists factory_production_shipping_status text null,
  add column if not exists factory_production_due_date timestamptz null,
  add column if not exists factory_production_is_rush boolean not null default false,
  add column if not exists factory_production_source_updated_at timestamptz null,
  add column if not exists factory_production_synced_at timestamptz null,
  add column if not exists factory_production_payload jsonb null,
  add column if not exists factory_production_sync_error text null;

create index if not exists orders_factory_production_status_idx
  on public.orders (factory_production_status_index, factory_production_synced_at desc);
