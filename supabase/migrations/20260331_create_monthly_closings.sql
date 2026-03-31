create table if not exists public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  start_date date not null,
  end_date date not null,
  total_sales numeric(14,2) not null default 0,
  total_cost numeric(14,2) not null default 0,
  total_profit numeric(14,2) not null default 0,
  total_orders integer not null default 0,
  completed_orders integer not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  notes text null,
  summary_snapshot jsonb not null default '{}'::jsonb,
  closed_at timestamptz null,
  closed_by_user_id uuid null references public.users (id) on delete set null,
  closed_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists monthly_closings_month_key_key
  on public.monthly_closings (month_key);

create index if not exists monthly_closings_status_idx
  on public.monthly_closings (status, month_key desc);

alter table public.monthly_closings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_closings'
      and policyname = 'monthly_closings_select_all'
  ) then
    create policy monthly_closings_select_all
      on public.monthly_closings
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_closings'
      and policyname = 'monthly_closings_insert_all'
  ) then
    create policy monthly_closings_insert_all
      on public.monthly_closings
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'monthly_closings'
      and policyname = 'monthly_closings_update_all'
  ) then
    create policy monthly_closings_update_all
      on public.monthly_closings
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
      and tablename = 'monthly_closings'
      and policyname = 'monthly_closings_delete_all'
  ) then
    create policy monthly_closings_delete_all
      on public.monthly_closings
      for delete
      using (true);
  end if;
end $$;
