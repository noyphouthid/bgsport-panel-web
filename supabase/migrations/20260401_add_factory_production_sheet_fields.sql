alter table public.factory_deposit_orders
  add column if not exists team_name text not null default '',
  add column if not exists production_sent_date date null,
  add column if not exists production_items jsonb not null default '[]'::jsonb;
