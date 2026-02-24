-- Expand allowed values for users.role to support reporting workflows.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      drop constraint users_role_check;
  end if;
end $$;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'manager', 'staff', 'graphic', 'accountant'));
