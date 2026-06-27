create table if not exists public.factory_production_queue_entries (
  id uuid primary key default gen_random_uuid(),
  factory_deposit_order_id uuid not null references public.factory_deposit_orders (id) on delete cascade,
  queue_date date not null default current_date,
  queue_year integer not null,
  queue_month integer not null check (queue_month between 1 and 12),
  queue_sequence bigint not null,
  queue_number text not null,
  order_sequence integer not null,
  order_no text not null,
  planner_user_id uuid null references public.users (id) on delete set null,
  status text not null default 'queued' check (
    status in ('queued', 'pattern_laid', 'all_sizes_laid', 'ready_for_print', 'sent_to_factory')
  ),
  notes text not null default '',
  pattern_laid_at timestamptz null,
  all_sizes_laid_at timestamptz null,
  ready_for_print_at timestamptz null,
  sent_to_factory_at timestamptz null,
  created_by_user_id uuid null references public.users (id) on delete set null,
  updated_by_user_id uuid null references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_production_queue_entries_queue_number_format check (queue_number ~ '^[0-9]+$'),
  constraint factory_production_queue_entries_order_no_format check (order_no ~ '^[0-9]+$')
);

create unique index if not exists factory_production_queue_entries_deposit_order_key
  on public.factory_production_queue_entries (factory_deposit_order_id);

create unique index if not exists factory_production_queue_entries_queue_sequence_key
  on public.factory_production_queue_entries (queue_sequence);

create unique index if not exists factory_production_queue_entries_queue_number_key
  on public.factory_production_queue_entries (queue_number);

create unique index if not exists factory_production_queue_entries_order_scope_key
  on public.factory_production_queue_entries (queue_year, order_no);

create index if not exists factory_production_queue_entries_status_idx
  on public.factory_production_queue_entries (status, queue_date desc, created_at desc);

create index if not exists factory_production_queue_entries_date_idx
  on public.factory_production_queue_entries (queue_year desc, queue_month desc, order_sequence desc);

create index if not exists factory_production_queue_entries_planner_idx
  on public.factory_production_queue_entries (planner_user_id);

alter table public.factory_production_queue_entries enable row level security;

drop policy if exists factory_production_queue_entries_select_by_role on public.factory_production_queue_entries;
drop policy if exists factory_production_queue_entries_update_by_role on public.factory_production_queue_entries;
drop policy if exists factory_production_queue_entries_delete_admin_only on public.factory_production_queue_entries;

create policy factory_production_queue_entries_select_by_role
  on public.factory_production_queue_entries
  for select
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
    or planner_user_id in (
      select viewer.id
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role = 'graphic'
    )
  );

create policy factory_production_queue_entries_update_by_role
  on public.factory_production_queue_entries
  for update
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
    or planner_user_id in (
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
    or planner_user_id in (
      select viewer.id
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role = 'graphic'
    )
  );

create policy factory_production_queue_entries_delete_admin_only
  on public.factory_production_queue_entries
  for delete
  using (
    exists (
      select 1
      from public.users as viewer
      where viewer.auth_user_id = auth.uid()
        and viewer.role in ('superadmin', 'admin', 'manager', 'staff')
    )
  );

create or replace function public.upsert_factory_production_queue_entry(
  p_deposit_order_id uuid,
  p_actor_user_id uuid default null
)
returns public.factory_production_queue_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit public.factory_deposit_orders;
  v_queue_date date;
  v_year integer;
  v_month integer;
  v_queue_sequence bigint;
  v_order_sequence integer;
  v_queue_number text;
  v_order_no text;
  v_existing public.factory_production_queue_entries;
  v_row public.factory_production_queue_entries;
begin
  if p_deposit_order_id is null then
    raise exception 'missing_deposit_order_id';
  end if;

  select *
  into v_deposit
  from public.factory_deposit_orders
  where id = p_deposit_order_id
    and status in ('submitted', 'approved', 'converted');

  if not found then
    raise exception 'deposit_order_not_ready_for_queue';
  end if;

  select *
  into v_existing
  from public.factory_production_queue_entries
  where factory_deposit_order_id = p_deposit_order_id;

  if found then
    update public.factory_production_queue_entries
    set
      planner_user_id = coalesce(factory_production_queue_entries.planner_user_id, v_deposit.graphic_user_id),
      updated_by_user_id = coalesce(p_actor_user_id, factory_production_queue_entries.updated_by_user_id),
      updated_at = now()
    where id = v_existing.id
    returning * into v_row;

    return v_row;
  end if;

  v_queue_date := coalesce(v_deposit.production_sent_date, v_deposit.deposit_date, current_date);
  v_year := extract(year from v_queue_date);
  v_month := extract(month from v_queue_date);

  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence', 0));

  select coalesce(max(entry.queue_sequence), 0) + 1
  into v_queue_sequence
  from public.factory_production_queue_entries as entry;

  perform pg_advisory_xact_lock(hashtextextended(format('factory_production_queue_month_%s_%s', v_year, v_month), 0));

  select coalesce(max(entry.order_sequence), 0) + 1
  into v_order_sequence
  from public.factory_production_queue_entries as entry
  where entry.queue_year = v_year
    and entry.queue_month = v_month;

  v_queue_number := lpad(v_queue_sequence::text, 4, '0');
  v_order_no := v_month::text || lpad(v_order_sequence::text, 3, '0');

  insert into public.factory_production_queue_entries (
    factory_deposit_order_id,
    queue_date,
    queue_year,
    queue_month,
    queue_sequence,
    queue_number,
    order_sequence,
    order_no,
    planner_user_id,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    v_deposit.id,
    v_queue_date,
    v_year,
    v_month,
    v_queue_sequence,
    v_queue_number,
    v_order_sequence,
    v_order_no,
    v_deposit.graphic_user_id,
    coalesce(p_actor_user_id, v_deposit.created_by_user_id),
    p_actor_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.sync_factory_production_queue_entries(
  p_actor_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_deposit_id uuid;
begin
  delete from public.factory_production_queue_entries as queue
  where exists (
    select 1
    from public.factory_deposit_orders as deposit
    where deposit.id = queue.factory_deposit_order_id
      and deposit.status in ('draft', 'cancelled')
  );

  for v_deposit_id in
    select deposit.id
    from public.factory_deposit_orders as deposit
    where deposit.status in ('submitted', 'approved', 'converted')
    order by coalesce(deposit.production_sent_date, deposit.deposit_date, current_date), deposit.created_at
  loop
    perform public.upsert_factory_production_queue_entry(v_deposit_id, p_actor_user_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.upsert_factory_production_queue_entry(uuid, uuid)
  to anon, authenticated, service_role;

grant execute on function public.sync_factory_production_queue_entries(uuid)
  to anon, authenticated, service_role;
