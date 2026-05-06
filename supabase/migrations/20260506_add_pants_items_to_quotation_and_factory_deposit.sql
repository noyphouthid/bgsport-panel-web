alter table public.quotation_drafts
  add column if not exists pants_items jsonb not null default '[]'::jsonb;

alter table public.factory_deposit_orders
  add column if not exists pants_items jsonb not null default '[]'::jsonb;
