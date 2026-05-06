create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  line_no integer not null default 1,
  product_type text not null check (product_type in ('shirt_printed', 'pants_printed')),
  product_name text not null default '',
  fabric_id uuid null references public.fabrics (id) on delete set null,
  fabric_name text not null default '',
  qty integer not null default 0,
  free_qty integer not null default 0,
  unit_price numeric(14,2) not null default 0,
  extra_charge numeric(14,2) not null default 0,
  line_discount numeric(14,2) not null default 0,
  gross_total numeric(14,2) not null default 0,
  net_total numeric(14,2) not null default 0,
  factory_cost_total numeric(14,2) not null default 0,
  size_breakdown jsonb not null default '{}'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items (order_id, line_no asc);

create index if not exists order_items_type_idx
  on public.order_items (product_type, created_at desc);

alter table public.order_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_select_all'
  ) then
    create policy order_items_select_all
      on public.order_items
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_insert_all'
  ) then
    create policy order_items_insert_all
      on public.order_items
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_update_all'
  ) then
    create policy order_items_update_all
      on public.order_items
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_delete_all'
  ) then
    create policy order_items_delete_all
      on public.order_items
      for delete
      using (true);
  end if;
end $$;
