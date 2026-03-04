alter table public.users
  add column if not exists auth_user_id uuid;

update public.users u
set auth_user_id = a.id
from auth.users a
where u.auth_user_id is null
  and u.email is not null
  and lower(u.email) = lower(a.email);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_auth_user_id_key'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_user_id_key unique (auth_user_id);
  end if;
end $$;

