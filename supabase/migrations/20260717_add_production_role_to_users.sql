do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table public.users
      drop constraint users_role_check;
  end if;
end $$;

alter table public.users
  add constraint users_role_check
  check (role in ('superadmin', 'admin', 'manager', 'staff', 'graphic', 'production', 'accountant'));
