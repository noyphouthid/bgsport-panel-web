begin;

alter table public.factory_production_queue_entries
  add column if not exists workload_piece_qty bigint not null default 0 check (workload_piece_qty >= 0);

-- Garments, including free garments and pants, are the unit of work.
create or replace function public.factory_production_piece_qty(p_deposit public.factory_deposit_orders)
returns bigint language sql immutable set search_path = public as $$
  select greatest(0, coalesce(p_deposit.short_qty, 0))::bigint
    + greatest(0, coalesce(p_deposit.long_qty, 0))
    + greatest(0, coalesce(p_deposit.free_qty, 0))
    + greatest(0, coalesce(p_deposit.qty_3xl, 0))
    + greatest(0, coalesce(p_deposit.qty_4xl, 0))
    + greatest(0, coalesce(p_deposit.qty_5xl, 0))
    + greatest(0, coalesce(p_deposit.qty_6xl, 0))
    + coalesce((select sum(
        greatest(0, coalesce(nullif(item->>'qty', '')::numeric, 0))
        + greatest(0, coalesce(nullif(coalesce(item->>'freeQty', item->>'free_qty'), '')::numeric, 0))
      )::bigint from jsonb_array_elements(case when jsonb_typeof(p_deposit.pants_items) = 'array'
        then p_deposit.pants_items else '[]'::jsonb end) as item), 0);
$$;

update public.factory_production_queue_entries q
set workload_piece_qty = public.factory_production_piece_qty(d)
from public.factory_deposit_orders d where d.id = q.factory_deposit_order_id;

-- Only actual production accounts participate; superadmins oversee all accounts.
create or replace function public.choose_factory_production_planner(p_year integer, p_month integer)
returns uuid language sql security definer set search_path = public as $$
  select worker.id from public.users worker
  left join public.factory_production_queue_entries q
    on q.planner_user_id = worker.id and q.queue_year = p_year and q.queue_month = p_month
  left join public.factory_deposit_orders d on d.id = q.factory_deposit_order_id
  where worker.is_active = true and worker.role in ('production', 'factory-production', 'production-team')
  group by worker.id
  order by coalesce(sum(q.workload_piece_qty) filter (where d.status in ('submitted','approved','converted')), 0),
    count(q.id) filter (where d.status in ('submitted','approved','converted')), worker.id
  limit 1;
$$;

-- Internal entry point: the lock covers both ownership and sequence allocation.
create or replace function public.enqueue_factory_production_internal(p_deposit_order_id uuid, p_actor_user_id uuid default null)
returns public.factory_production_queue_entries
language plpgsql security definer set search_path = public as $$
declare
  d public.factory_deposit_orders;
  q public.factory_production_queue_entries;
  v_date date;
  v_year integer;
  v_month integer;
  v_sequence bigint;
  v_order integer;
  v_planner uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence', 0));
  select * into d from public.factory_deposit_orders where id = p_deposit_order_id;
  if not found or d.status not in ('submitted','approved','converted') then
    raise exception 'deposit_order_not_ready_for_queue';
  end if;
  select * into q from public.factory_production_queue_entries where factory_deposit_order_id = d.id for update;
  if found then
    v_planner := q.planner_user_id;
    if v_planner is null or not exists (
      select 1 from public.users where id = v_planner
        and role in ('production','factory-production','production-team')
        and (q.status <> 'queued' or is_active = true)
    ) then
      v_planner := public.choose_factory_production_planner(q.queue_year, q.queue_month);
    end if;
    update public.factory_production_queue_entries set
      planner_user_id = v_planner, workload_piece_qty = public.factory_production_piece_qty(d),
      assigned_by_user_id = coalesce(q.assigned_by_user_id, d.admin_user_id, p_actor_user_id),
      updated_at = now()
    where id = q.id and (planner_user_id is distinct from v_planner
      or workload_piece_qty is distinct from public.factory_production_piece_qty(d))
    returning * into q;
    if not found then select * into q from public.factory_production_queue_entries where factory_deposit_order_id = d.id; end if;
    return q;
  end if;
  v_date := coalesce(d.production_sent_date, d.deposit_date, (now() at time zone 'Asia/Vientiane')::date);
  v_year := extract(year from v_date); v_month := extract(month from v_date);
  select coalesce(max(queue_sequence), 0) + 1 into v_sequence from public.factory_production_queue_entries;
  select coalesce(max(order_sequence), 0) + 1 into v_order from public.factory_production_queue_entries
    where queue_year = v_year and queue_month = v_month;
  v_planner := public.choose_factory_production_planner(v_year, v_month);
  insert into public.factory_production_queue_entries (
    factory_deposit_order_id, queue_date, queue_year, queue_month, queue_sequence, queue_number,
    order_sequence, order_no, planner_user_id, workload_piece_qty, assigned_by_user_id, created_by_user_id, updated_by_user_id
  ) values (d.id, v_date, v_year, v_month, v_sequence, lpad(v_sequence::text, greatest(4,length(v_sequence::text)), '0'),
    v_order, v_month::text || lpad(v_order::text, greatest(3,length(v_order::text)), '0'), v_planner,
    public.factory_production_piece_qty(d), coalesce(d.admin_user_id, p_actor_user_id),
    coalesce(p_actor_user_id, d.created_by_user_id), p_actor_user_id) returning * into q;
  return q;
end;
$$;

create or replace function public.upsert_factory_production_queue_entry(p_deposit_order_id uuid, p_actor_user_id uuid default null)
returns public.factory_production_queue_entries
language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  if current_setting('role', true) = 'service_role' then v_actor := p_actor_user_id;
  else
    select id into v_actor from public.users where auth_user_id = auth.uid() and is_active = true
      and role in ('superadmin','admin','manager','staff');
    if v_actor is null then raise exception 'forbidden'; end if;
  end if;
  return public.enqueue_factory_production_internal(p_deposit_order_id, v_actor);
end;
$$;

create or replace function public.sync_factory_production_queue_entries(p_actor_user_id uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count integer := 0; v_actor uuid;
begin
  if current_setting('role', true) = 'service_role' then v_actor := p_actor_user_id;
  else
    select id into v_actor from public.users where auth_user_id = auth.uid() and is_active = true
      and role in ('superadmin','admin','manager','staff');
    if v_actor is null then raise exception 'forbidden'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence', 0));
  delete from public.factory_production_queue_entries q using public.factory_deposit_orders d
    where d.id = q.factory_deposit_order_id and d.status in ('draft','cancelled');
  -- Large unassigned orders first reduces imbalance when recovering a backlog.
  for v_id in select d.id from public.factory_deposit_orders d
    where d.status in ('submitted','approved','converted')
    order by public.factory_production_piece_qty(d) desc, d.created_at, d.id
  loop
    perform public.enqueue_factory_production_internal(v_id, v_actor);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.sync_factory_production_deposit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('submitted','approved','converted') then
    perform public.enqueue_factory_production_internal(new.id, new.created_by_user_id);
  else
    delete from public.factory_production_queue_entries where factory_deposit_order_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists factory_deposit_production_queue_sync on public.factory_deposit_orders;
create trigger factory_deposit_production_queue_sync
after insert or update of status, short_qty, long_qty, free_qty, qty_3xl, qty_4xl, qty_5xl, qty_6xl, pants_items
on public.factory_deposit_orders for each row execute function public.sync_factory_production_deposit_trigger();

drop policy if exists factory_production_queue_entries_select_by_role on public.factory_production_queue_entries;
drop policy if exists factory_production_queue_entries_update_by_role on public.factory_production_queue_entries;
create policy factory_production_queue_entries_select_by_role on public.factory_production_queue_entries for select using (
  exists (select 1 from public.users viewer where viewer.auth_user_id = auth.uid() and viewer.is_active = true
    and (viewer.role = 'superadmin' or (viewer.role in ('production','factory-production','production-team') and planner_user_id = viewer.id)))
);
-- Mutations go through the authenticated server and the atomic RPC below.
revoke update, insert, delete on public.factory_production_queue_entries from anon, authenticated;

create or replace function public.update_factory_production_queue_statuses(p_ids uuid[], p_target_status text, p_actor_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare q public.factory_production_queue_entries; v_role text; v_count integer;
begin
  select role into v_role from public.users where id = p_actor_user_id and is_active = true;
  if v_role is null or v_role not in ('superadmin','production','factory-production','production-team') then raise exception 'forbidden'; end if;
  if p_target_status not in ('queued','pattern_laid','ready_for_print','sent_to_factory') then raise exception 'invalid_target_status'; end if;
  select count(distinct id) into v_count from unnest(p_ids) as id;
  if v_count = 0 then raise exception 'missing_queue_ids'; end if;
  -- Validate the entire batch under row locks before changing any row.
  perform 1 from public.factory_production_queue_entries where id = any(p_ids) order by id for update;
  if (select count(*) from public.factory_production_queue_entries where id = any(p_ids)) <> v_count then raise exception 'queue_not_found'; end if;
  for q in select * from public.factory_production_queue_entries where id = any(p_ids) loop
    if v_role <> 'superadmin' and q.planner_user_id is distinct from p_actor_user_id then raise exception 'forbidden'; end if;
    if q.planner_user_id is null then raise exception 'queue_unassigned'; end if;
    if not exists (select 1 from public.factory_deposit_orders where id = q.factory_deposit_order_id and status in ('submitted','approved','converted')) then
      raise exception 'deposit_order_not_ready_for_queue';
    end if;
  end loop;
  update public.factory_production_queue_entries set
    status = p_target_status,
    pattern_laid_at = case when p_target_status = 'queued' then null else coalesce(pattern_laid_at, now()) end,
    pattern_laid_by_user_id = case when p_target_status = 'queued' then null else planner_user_id end,
    all_sizes_laid_at = null, all_sizes_laid_by_user_id = null,
    ready_for_print_at = case when p_target_status in ('ready_for_print','sent_to_factory') then coalesce(ready_for_print_at, now()) else null end,
    ready_for_print_by_user_id = case when p_target_status in ('ready_for_print','sent_to_factory') then planner_user_id else null end,
    sent_to_factory_at = case when p_target_status = 'sent_to_factory' then coalesce(sent_to_factory_at, now()) else null end,
    sent_to_factory_by_user_id = case when p_target_status = 'sent_to_factory' then planner_user_id else null end,
    last_status_updated_by_user_id = p_actor_user_id, updated_by_user_id = p_actor_user_id, updated_at = now()
  where id = any(p_ids);
  return v_count;
end;
$$;

revoke all on function public.factory_production_piece_qty(public.factory_deposit_orders),
  public.choose_factory_production_planner(integer,integer), public.enqueue_factory_production_internal(uuid,uuid),
  public.sync_factory_production_deposit_trigger(), public.update_factory_production_queue_statuses(uuid[],text,uuid)
  from public, anon, authenticated;
grant execute on function public.update_factory_production_queue_statuses(uuid[],text,uuid) to service_role;
revoke all on function public.upsert_factory_production_queue_entry(uuid,uuid), public.sync_factory_production_queue_entries(uuid) from public, anon;
grant execute on function public.upsert_factory_production_queue_entry(uuid,uuid), public.sync_factory_production_queue_entries(uuid) to authenticated, service_role;

-- Backfill without resetting work that has already started.
do $$ declare v_id uuid; begin
  delete from public.factory_production_queue_entries q using public.factory_deposit_orders d
    where d.id = q.factory_deposit_order_id and d.status in ('draft','cancelled');
  for v_id in select d.id from public.factory_deposit_orders d where d.status in ('submitted','approved','converted')
    order by public.factory_production_piece_qty(d) desc, d.created_at, d.id
  loop perform public.enqueue_factory_production_internal(v_id, null); end loop;
end $$;

commit;
