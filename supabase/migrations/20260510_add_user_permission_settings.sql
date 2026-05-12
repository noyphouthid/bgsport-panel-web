alter table public.users
  add column if not exists permission_settings jsonb not null default '{}'::jsonb;

update public.users
set permission_settings = '{}'::jsonb
where permission_settings is null;
