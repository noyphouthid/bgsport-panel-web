create table if not exists public.order_code_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_code_types_code_format check (code ~ '^[A-Z0-9]+$')
);

insert into public.order_code_types (code, label, sort_order, is_active, is_system)
values
  ('PK26', null, 10, true, true),
  ('MK26', null, 20, true, true),
  ('PM26', null, 30, true, true),
  ('MM26', null, 40, true, true),
  ('PKF26', null, 50, true, true),
  ('PKLF26', null, 60, true, true),
  ('MKF26', null, 70, true, true),
  ('MKLF26', null, 80, true, true),
  ('PMF26', null, 90, true, true),
  ('PMLF26', null, 100, true, true),
  ('MMF26', null, 110, true, true),
  ('MMLF26', null, 120, true, true)
on conflict (code) do update
set
  sort_order = excluded.sort_order,
  is_system = true,
  updated_at = timezone('utc', now());
