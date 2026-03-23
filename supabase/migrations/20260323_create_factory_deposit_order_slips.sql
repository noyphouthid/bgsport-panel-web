create table if not exists public.factory_deposit_order_slips (
  id uuid primary key default gen_random_uuid(),
  deposit_order_id uuid not null references public.factory_deposit_orders (id) on delete cascade,
  file_name text not null default '',
  file_path text not null,
  file_url text null,
  note text null,
  uploaded_by_user_id uuid null references public.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists factory_deposit_order_slips_order_idx
  on public.factory_deposit_order_slips (deposit_order_id, uploaded_at desc);

alter table public.factory_deposit_order_slips enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_order_slips'
      and policyname = 'factory_deposit_order_slips_select_all'
  ) then
    create policy factory_deposit_order_slips_select_all
      on public.factory_deposit_order_slips
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_order_slips'
      and policyname = 'factory_deposit_order_slips_insert_all'
  ) then
    create policy factory_deposit_order_slips_insert_all
      on public.factory_deposit_order_slips
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'factory_deposit_order_slips'
      and policyname = 'factory_deposit_order_slips_delete_all'
  ) then
    create policy factory_deposit_order_slips_delete_all
      on public.factory_deposit_order_slips
      for delete
      using (true);
  end if;
end $$;
