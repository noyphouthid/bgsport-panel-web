alter table public.quotation_drafts
  add column if not exists sleeve_charge_qty integer not null default 0;

alter table public.factory_deposit_orders
  add column if not exists sleeve_charge_qty integer not null default 0;

alter table public.orders
  add column if not exists sleeve_charge_qty integer not null default 0;
