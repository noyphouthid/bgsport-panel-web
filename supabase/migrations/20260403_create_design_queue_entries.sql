create table if not exists public.design_queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_date date not null default current_date,
  queue_year integer not null,
  queue_month integer not null check (queue_month between 1 and 12),
  queue_sequence bigint not null,
  queue_number text not null,
  order_sequence integer not null,
  order_no text not null,
  type_code text not null,
  customer_name text not null default '',
  customer_phone text not null default '',
  style_name text not null default '',
  notes text not null default '',
  is_designed boolean not null default false,
  designed_at timestamptz null,
  graphic_user_id uuid null references public.users (id) on delete set null,
  created_by_user_id uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint design_queue_entries_queue_number_format check (queue_number ~ '^[0-9]+$'),
  constraint design_queue_entries_order_no_format check (order_no ~ '^[0-9]+$'),
  constraint design_queue_entries_type_code_format check (type_code ~ '^[A-Z0-9]+$')
);

alter table public.design_queue_entries
  add column if not exists graphic_user_id uuid null references public.users (id) on delete set null;

create unique index if not exists design_queue_entries_queue_sequence_key
  on public.design_queue_entries (queue_sequence);

create unique index if not exists design_queue_entries_queue_number_key
  on public.design_queue_entries (queue_number);

create unique index if not exists design_queue_entries_order_scope_key
  on public.design_queue_entries (queue_year, order_no);

create index if not exists design_queue_entries_status_idx
  on public.design_queue_entries (is_designed, queue_date desc, created_at desc);

create index if not exists design_queue_entries_date_idx
  on public.design_queue_entries (queue_year desc, queue_month desc, order_sequence desc);

create index if not exists design_queue_entries_graphic_idx
  on public.design_queue_entries (graphic_user_id);

create table if not exists public.design_queue_counters (
  scope_key text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.design_queue_monthly_counters (
  queue_year integer not null,
  queue_month integer not null check (queue_month between 1 and 12),
  last_order_sequence integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (queue_year, queue_month)
);

alter table public.design_queue_entries enable row level security;
alter table public.design_queue_counters enable row level security;
alter table public.design_queue_monthly_counters enable row level security;

drop policy if exists design_queue_entries_select_all on public.design_queue_entries;
drop policy if exists design_queue_entries_update_all on public.design_queue_entries;
drop policy if exists design_queue_entries_delete_all on public.design_queue_entries;
drop policy if exists design_queue_entries_select_by_role on public.design_queue_entries;
drop policy if exists design_queue_entries_update_by_role on public.design_queue_entries;
drop policy if exists design_queue_entries_delete_admin_only on public.design_queue_entries;

create policy design_queue_entries_select_by_role
  on public.design_queue_entries
  for select
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
    or graphic_user_id in (
      select viewer.id
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role = 'graphic'
    )
  );

create policy design_queue_entries_update_by_role
  on public.design_queue_entries
  for update
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
    or graphic_user_id in (
      select viewer.id
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role = 'graphic'
    )
  )
  with check (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
    or graphic_user_id in (
      select viewer.id
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role = 'graphic'
    )
  );

create policy design_queue_entries_delete_admin_only
  on public.design_queue_entries
  for delete
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
  );

create or replace function public.create_design_queue_entry(
  p_queue_date date default current_date,
  p_type_code text default '',
  p_customer_name text default '',
  p_customer_phone text default '',
  p_style_name text default '',
  p_notes text default '',
  p_graphic_user_id uuid default null,
  p_created_by_user_id uuid default null
)
returns public.design_queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_date date := coalesce(p_queue_date, current_date);
  v_year integer := extract(year from v_queue_date);
  v_month integer := extract(month from v_queue_date);
  v_year_short text := lpad((v_year % 100)::text, 2, '0');
  v_queue_sequence bigint;
  v_order_sequence integer;
  v_type_code text := upper(regexp_replace(coalesce(p_type_code, ''), '[^A-Z0-9]', '', 'g'));
  v_queue_number text;
  v_order_no text;
  v_row public.design_queue_entries;
begin
  perform pg_advisory_xact_lock(hashtextextended('design_queue_global_sequence', 0));

  select coalesce(max(entry.queue_sequence), 0) + 1
  into v_queue_sequence
  from public.design_queue_entries as entry;

  perform pg_advisory_xact_lock(hashtextextended(format('design_queue_month_%s_%s', v_year, v_month), 0));

  select coalesce(max(entry.order_sequence), 0) + 1
  into v_order_sequence
  from public.design_queue_entries as entry
  where entry.queue_year = v_year
    and entry.queue_month = v_month;

  if v_type_code = '' then
    v_type_code := 'DQ' || v_year_short;
  elsif v_type_code ~ '\d{2}$' then
    v_type_code := regexp_replace(v_type_code, '\d{2}$', v_year_short);
  else
    v_type_code := v_type_code || v_year_short;
  end if;

  v_queue_number := lpad(v_queue_sequence::text, 4, '0');
  v_order_no := v_month::text || lpad(v_order_sequence::text, 3, '0');

  insert into public.design_queue_entries (
    queue_date,
    queue_year,
    queue_month,
    queue_sequence,
    queue_number,
    order_sequence,
    order_no,
    type_code,
    customer_name,
    customer_phone,
    style_name,
    notes,
    graphic_user_id,
    created_by_user_id
  )
  values (
    v_queue_date,
    v_year,
    v_month,
    v_queue_sequence,
    v_queue_number,
    v_order_sequence,
    v_order_no,
    v_type_code,
    coalesce(trim(p_customer_name), ''),
    coalesce(trim(p_customer_phone), ''),
    coalesce(trim(p_style_name), ''),
    coalesce(trim(p_notes), ''),
    p_graphic_user_id,
    p_created_by_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_design_queue_entry(date, text, text, text, text, text, uuid, uuid)
  to anon, authenticated, service_role;
