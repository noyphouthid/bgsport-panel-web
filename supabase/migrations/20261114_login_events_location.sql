begin;

-- Requires 20261113_create_login_audit.sql.
-- ip_*: approximate place of the IP address (city level, from Netlify or ipinfo.io).
-- gps_*: the browser's own location, only when the person allows it at sign-in.
alter table public.login_events
  add column if not exists isp text check (isp is null or length(isp) <= 120),
  add column if not exists ip_latitude double precision check (ip_latitude is null or ip_latitude between -90 and 90),
  add column if not exists ip_longitude double precision check (ip_longitude is null or ip_longitude between -180 and 180),
  add column if not exists gps_status text check (gps_status is null or gps_status in ('granted', 'denied', 'unavailable', 'timeout', 'unsupported')),
  add column if not exists gps_latitude double precision check (gps_latitude is null or gps_latitude between -90 and 90),
  add column if not exists gps_longitude double precision check (gps_longitude is null or gps_longitude between -180 and 180),
  add column if not exists gps_accuracy_m integer check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  add column if not exists gps_recorded_at timestamptz;

notify pgrst, 'reload schema';
commit;
