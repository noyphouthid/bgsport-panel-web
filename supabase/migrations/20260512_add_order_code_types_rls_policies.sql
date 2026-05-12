alter table if exists public.order_code_types enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'order_code_types'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_code_types'
      and policyname = 'order_code_types_select_all'
  ) then
    create policy order_code_types_select_all
      on public.order_code_types
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'order_code_types'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_code_types'
      and policyname = 'order_code_types_insert_all'
  ) then
    create policy order_code_types_insert_all
      on public.order_code_types
      for insert
      with check (true);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'order_code_types'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_code_types'
      and policyname = 'order_code_types_update_all'
  ) then
    create policy order_code_types_update_all
      on public.order_code_types
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'order_code_types'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_code_types'
      and policyname = 'order_code_types_delete_all'
  ) then
    create policy order_code_types_delete_all
      on public.order_code_types
      for delete
      using (true);
  end if;
end $$;
