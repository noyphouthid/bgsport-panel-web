create table if not exists public.income_expense_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('income', 'expense')),
  entry_date timestamptz not null default now(),
  category text not null,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text null check (payment_method in ('cash', 'transfer', 'other')),
  reference_code text null,
  note text null,
  created_by_user_id uuid null references public.users (id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_expense_entries_entry_date_idx
  on public.income_expense_entries (entry_date desc);

create index if not exists income_expense_entries_entry_type_idx
  on public.income_expense_entries (entry_type, entry_date desc);

alter table public.income_expense_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'income_expense_entries'
      and policyname = 'income_expense_entries_select_all'
  ) then
    create policy income_expense_entries_select_all
      on public.income_expense_entries
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'income_expense_entries'
      and policyname = 'income_expense_entries_insert_all'
  ) then
    create policy income_expense_entries_insert_all
      on public.income_expense_entries
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'income_expense_entries'
      and policyname = 'income_expense_entries_update_all'
  ) then
    create policy income_expense_entries_update_all
      on public.income_expense_entries
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'income_expense_entries'
      and policyname = 'income_expense_entries_delete_all'
  ) then
    create policy income_expense_entries_delete_all
      on public.income_expense_entries
      for delete
      using (true);
  end if;
end $$;
