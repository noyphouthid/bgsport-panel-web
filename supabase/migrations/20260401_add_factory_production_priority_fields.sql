alter table public.factory_deposit_orders
  add column if not exists production_priority text not null default 'normal' check (production_priority in ('normal', 'urgent')),
  add column if not exists urgent_due_date date null;
