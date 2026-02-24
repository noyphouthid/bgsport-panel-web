-- Finance workflow foundation

-- 1) Factory payments (AP transaction ledger)
create table if not exists public.factory_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists factory_payments_order_id_idx
  on public.factory_payments (order_id);

create index if not exists factory_payments_paid_at_idx
  on public.factory_payments (paid_at desc);

alter table public.factory_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_payments'
      and policyname = 'factory_payments_select_all'
  ) then
    create policy factory_payments_select_all
      on public.factory_payments
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_payments'
      and policyname = 'factory_payments_insert_all'
  ) then
    create policy factory_payments_insert_all
      on public.factory_payments
      for insert
      with check (true);
  end if;
end $$;

-- 2) Order action history (audit-light)
create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  action text not null,
  detail text null,
  action_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id, action_at desc);

alter table public.order_status_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_status_history'
      and policyname = 'order_status_history_select_all'
  ) then
    create policy order_status_history_select_all
      on public.order_status_history
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_status_history'
      and policyname = 'order_status_history_insert_all'
  ) then
    create policy order_status_history_insert_all
      on public.order_status_history
      for insert
      with check (true);
  end if;
end $$;

-- 3) Milestone timestamps on orders
alter table public.orders
  add column if not exists production_completed_at timestamptz null,
  add column if not exists customer_paid_full_at timestamptz null,
  add column if not exists factory_paid_full_at timestamptz null,
  add column if not exists closed_at timestamptz null;
