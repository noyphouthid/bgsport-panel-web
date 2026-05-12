insert into public.order_code_types (code, label, sort_order, is_active, is_system)
values
  ('PK26', null, 10, true, true),
  ('MK26', null, 20, true, true),
  ('PM26', null, 30, true, true),
  ('MM26', null, 40, true, true),
  ('PKF26', null, 50, true, false),
  ('PKLF26', null, 60, true, false),
  ('MKF26', null, 70, true, false),
  ('MKLF26', null, 80, true, false),
  ('PMF26', null, 90, true, false),
  ('PMLF26', null, 100, true, false),
  ('MMF26', null, 110, true, false),
  ('MMLF26', null, 120, true, false)
on conflict (code) do update
set
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc', now());
