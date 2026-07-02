alter table public.factory_production_queue_entries
  add column if not exists assigned_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists pattern_laid_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists all_sizes_laid_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists ready_for_print_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists sent_to_factory_by_user_id uuid null references public.users (id) on delete set null,
  add column if not exists last_status_updated_by_user_id uuid null references public.users (id) on delete set null;

create index if not exists factory_production_queue_entries_assigned_by_idx
  on public.factory_production_queue_entries (assigned_by_user_id);

create index if not exists factory_production_queue_entries_last_status_actor_idx
  on public.factory_production_queue_entries (last_status_updated_by_user_id);

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
      assigned_by_user_id = coalesce(factory_production_queue_entries.assigned_by_user_id, v_deposit.admin_user_id, p_actor_user_id),
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
    assigned_by_user_id,
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
    coalesce(v_deposit.admin_user_id, p_actor_user_id),
    coalesce(p_actor_user_id, v_deposit.created_by_user_id),
    p_actor_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;
