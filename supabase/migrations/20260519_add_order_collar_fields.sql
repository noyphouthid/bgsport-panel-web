alter table public.orders
  add column if not exists collar_type text not null default 'none'
    check (collar_type in ('none', 'polo', 'mandarin')),
  add column if not exists collar_qty integer not null default 0;
