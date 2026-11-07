begin;

-- A browser profile that has signed in. The key is a random id kept in that
-- browser's localStorage; the label is a name a superadmin gives the computer.
create table if not exists public.login_devices (
  id uuid primary key default gen_random_uuid(),
  device_key text not null unique check (device_key ~ '^[0-9a-f-]{36}$'),
  label text check (label is null or length(trim(label)) between 1 and 100),
  last_user_agent text check (last_user_agent is null or length(last_user_agent) <= 500),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One row per sign-in attempt. Successful rows are written by the server from a
-- verified session; failed rows are reported by the login page.
create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.users(id) on delete set null,
  email text check (email is null or length(email) <= 320),
  success boolean not null,
  failure_reason text check (failure_reason is null or length(failure_reason) <= 200),
  ip text check (ip is null or length(ip) <= 64),
  country text check (country is null or length(country) <= 8),
  region text check (region is null or length(region) <= 100),
  city text check (city is null or length(city) <= 100),
  user_agent text check (user_agent is null or length(user_agent) <= 500),
  browser text check (browser is null or length(browser) <= 60),
  os text check (os is null or length(os) <= 60),
  device_type text check (device_type is null or device_type in ('desktop', 'mobile', 'tablet')),
  device_id uuid references public.login_devices(id) on delete set null,
  is_new_device boolean not null default false,
  is_new_ip boolean not null default false
);

create index if not exists login_events_created_at_idx on public.login_events (created_at desc);
create index if not exists login_events_user_created_idx on public.login_events (user_id, created_at desc);
create index if not exists login_events_ip_created_idx on public.login_events (ip, created_at desc);
create index if not exists login_events_device_idx on public.login_events (device_id);

-- Only the server (service role) reads or writes these tables; the admin page
-- goes through superadmin-checked API routes.
alter table public.login_devices enable row level security;
alter table public.login_events enable row level security;
revoke all on public.login_devices from public, anon, authenticated;
revoke all on public.login_events from public, anon, authenticated;
grant all on public.login_devices to service_role;
grant all on public.login_events to service_role;

notify pgrst, 'reload schema';
commit;
