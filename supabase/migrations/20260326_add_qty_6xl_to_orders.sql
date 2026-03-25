alter table public.orders
  add column if not exists qty_6xl integer not null default 0;
