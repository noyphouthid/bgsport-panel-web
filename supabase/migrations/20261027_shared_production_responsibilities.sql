begin;

-- Install this dependency here as well for databases upgraded directly to shared responsibilities.
-- A priority edit takes effect without renumbering jobs or changing their owner.
create or replace function public.factory_production_queue_priority_rank(p_deposit_order_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.factory_deposit_orders
    where id = p_deposit_order_id and production_priority = 'urgent') then 0 else 1 end;
$$;
revoke all on function public.factory_production_queue_priority_rank(uuid) from public, anon, authenticated;

alter table public.factory_production_queue_entries
  add column if not exists pattern_user_id uuid references public.users(id) on delete set null,
  add column if not exists print_user_id uuid references public.users(id) on delete set null,
  add column if not exists dispatch_user_id uuid references public.users(id) on delete set null,
  add column if not exists pattern_completed_at timestamptz,
  add column if not exists pattern_completed_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists print_started_at timestamptz,
  add column if not exists print_started_by_user_id uuid references public.users(id) on delete set null;

update public.factory_production_queue_entries set
  pattern_user_id = coalesce(pattern_user_id, planner_user_id),
  print_user_id = coalesce(print_user_id, planner_user_id),
  dispatch_user_id = coalesce(dispatch_user_id, planner_user_id)
where pattern_user_id is null or print_user_id is null or dispatch_user_id is null;
update public.factory_production_queue_entries set
  pattern_completed_at = coalesce(pattern_completed_at, pattern_laid_at, production_completed_at, sent_to_factory_at),
  pattern_completed_by_user_id = coalesce(pattern_completed_by_user_id, pattern_laid_by_user_id, production_started_by_user_id),
  print_started_at = coalesce(print_started_at, production_started_at, production_completed_at, sent_to_factory_at),
  print_started_by_user_id = coalesce(print_started_by_user_id, production_completed_by_user_id, print_user_id)
where status in ('awaiting_factory','sent_to_factory');

-- Preserve explicit helpers when the legacy primary planner is automatically changed.
create or replace function public.normalize_production_stage_assignments()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pattern_user_id := coalesce(new.pattern_user_id, new.planner_user_id);
    new.print_user_id := coalesce(new.print_user_id, new.planner_user_id);
    new.dispatch_user_id := coalesce(new.dispatch_user_id, new.planner_user_id);
  elsif new.planner_user_id is distinct from old.planner_user_id and new.pattern_user_id is not distinct from old.pattern_user_id then
    if new.pattern_user_id is not distinct from old.pattern_user_id and old.pattern_user_id is not distinct from old.planner_user_id then new.pattern_user_id := new.planner_user_id; end if;
    if new.print_user_id is not distinct from old.print_user_id and old.print_user_id is not distinct from old.planner_user_id then new.print_user_id := new.planner_user_id; end if;
    if new.dispatch_user_id is not distinct from old.dispatch_user_id and old.dispatch_user_id is not distinct from old.planner_user_id then new.dispatch_user_id := new.planner_user_id; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists normalize_production_stage_assignments on public.factory_production_queue_entries;
create trigger normalize_production_stage_assignments before insert or update on public.factory_production_queue_entries
for each row execute function public.normalize_production_stage_assignments();

create or replace function public.production_queue_participants(q public.factory_production_queue_entries)
returns uuid[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct worker order by worker), '{}'::uuid[])
  from unnest(array[q.pattern_user_id,q.print_user_id,q.dispatch_user_id]) as worker where worker is not null;
$$;
create or replace function public.production_queue_active_worker(q public.factory_production_queue_entries)
returns uuid language sql immutable set search_path = public as $$
  select case when q.status = 'in_production' and q.pattern_completed_at is null then q.pattern_user_id
    when q.status = 'in_production' and q.print_started_at is not null then q.print_user_id else null end;
$$;
create or replace function public.production_queue_ready_worker(q public.factory_production_queue_entries)
returns uuid language sql immutable set search_path = public as $$
  select case when q.status = 'queued' then q.pattern_user_id
    when q.status = 'in_production' and q.pattern_completed_at is not null and q.print_started_at is null then q.print_user_id else null end;
$$;
create or replace function public.production_queue_worker_busy(p_worker uuid,p_exclude uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.factory_production_queue_entries q where q.id <> p_exclude
    and public.production_queue_active_worker(q) = p_worker and public.is_current_factory_production_deposit(q.factory_deposit_order_id));
$$;
create or replace function public.assert_production_task_startable(q public.factory_production_queue_entries,p_worker uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_worker is null then raise exception 'queue_unassigned'; end if;
  if public.production_queue_worker_busy(p_worker,q.id) then raise exception 'production_already_in_progress'; end if;
  if exists(select 1 from public.factory_production_queue_entries earlier
    where earlier.id <> q.id and public.production_queue_ready_worker(earlier) = p_worker
      and public.is_current_factory_production_deposit(earlier.factory_deposit_order_id)
      and (public.factory_production_queue_priority_rank(earlier.factory_deposit_order_id),earlier.queue_sequence)
        < (public.factory_production_queue_priority_rank(q.factory_deposit_order_id),q.queue_sequence)) then raise exception 'queue_not_next'; end if;
end;
$$;

create or replace function public.choose_factory_production_planner(p_year integer,p_month integer)
returns uuid language sql security definer set search_path = public as $$
  select worker.id from public.users worker
  left join public.factory_production_queue_entries q on worker.id = any(public.production_queue_participants(q))
    and q.queue_year=p_year and q.queue_month=p_month
  where worker.is_active=true and worker.role in ('production','factory-production','production-team')
  group by worker.id
  order by coalesce(sum(q.workload_piece_qty::numeric / nullif(cardinality(public.production_queue_participants(q)),0))
      filter(where public.is_current_factory_production_deposit(q.factory_deposit_order_id)),0),
    count(q.id) filter(where public.is_current_factory_production_deposit(q.factory_deposit_order_id)),worker.id limit 1;
$$;

create or replace function public.assign_factory_production_stages(
  p_id uuid,p_pattern_user_id uuid,p_print_user_id uuid,p_dispatch_user_id uuid,p_actor_user_id uuid,
  p_expected_pattern_user_id uuid,p_expected_print_user_id uuid,p_expected_dispatch_user_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare q public.factory_production_queue_entries; v_id uuid; v_active uuid;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and is_active=true and role='superadmin') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence',0));
  foreach v_id in array array[p_pattern_user_id,p_print_user_id,p_dispatch_user_id] loop
    perform 1 from public.users where id=v_id and is_active=true and role in ('production','factory-production','production-team') for share;
    if not found then raise exception 'invalid_planner_user'; end if;
  end loop;
  select * into q from public.factory_production_queue_entries where id=p_id for update;
  if not found or not public.is_current_factory_production_deposit(q.factory_deposit_order_id) then raise exception 'queue_not_found'; end if;
  if q.pattern_user_id is distinct from p_expected_pattern_user_id or q.print_user_id is distinct from p_expected_print_user_id
    or q.dispatch_user_id is distinct from p_expected_dispatch_user_id then raise exception 'assignment_changed'; end if;
  v_active:=case when q.status='in_production' and q.pattern_completed_at is null then p_pattern_user_id
    when q.status='in_production' and q.print_started_at is not null then p_print_user_id else null end;
  if v_active is not null and public.production_queue_worker_busy(v_active,q.id) then raise exception 'production_already_in_progress'; end if;
  update public.factory_production_queue_entries set
    planner_user_id=p_pattern_user_id,pattern_user_id=p_pattern_user_id,print_user_id=p_print_user_id,dispatch_user_id=p_dispatch_user_id,
    planner_reassigned_by_user_id=p_actor_user_id,planner_reassigned_at=clock_timestamp(),updated_by_user_id=p_actor_user_id,updated_at=clock_timestamp()
  where id=p_id;
end;
$$;

-- Compatibility for callers changing all three roles to the same worker.
create or replace function public.reassign_factory_production_queue_entry(p_id uuid,p_planner_user_id uuid,p_actor_user_id uuid,p_expected_planner_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare q public.factory_production_queue_entries;
begin
  if not exists(select 1 from public.users where id=p_actor_user_id and role='superadmin' and is_active=true) then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence',0));
  select * into q from public.factory_production_queue_entries where id=p_id for update;
  if not found then raise exception 'queue_not_found'; end if;
  if q.planner_user_id is distinct from p_expected_planner_user_id then raise exception 'assignment_changed'; end if;
  perform public.assign_factory_production_stages(p_id,p_planner_user_id,p_planner_user_id,p_planner_user_id,p_actor_user_id,q.pattern_user_id,q.print_user_id,q.dispatch_user_id);
end;
$$;

create or replace function public.advance_factory_production_task(p_id uuid,p_action text,p_actor_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare q public.factory_production_queue_entries; v_role text; v_worker uuid;
begin
  select role into v_role from public.users where id=p_actor_user_id and is_active=true;
  if v_role is null or v_role not in ('superadmin','production','factory-production','production-team') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence',0));
  select * into q from public.factory_production_queue_entries where id=p_id for update;
  if not found or not public.is_current_factory_production_deposit(q.factory_deposit_order_id) then raise exception 'queue_not_found'; end if;
  v_worker:=case when p_action='complete_pattern' then q.pattern_user_id when p_action='start_print' then q.print_user_id else null end;
  if v_worker is null then raise exception 'invalid_task'; end if;
  if v_role<>'superadmin' and p_actor_user_id<>v_worker then raise exception 'forbidden'; end if;
  if q.status<>'in_production' then raise exception 'invalid_transition'; end if;
  if p_action='complete_pattern' then
    if q.pattern_completed_at is not null then return; end if;
    update public.factory_production_queue_entries set pattern_completed_at=clock_timestamp(),pattern_completed_by_user_id=p_actor_user_id,
      last_status_updated_by_user_id=p_actor_user_id,updated_by_user_id=p_actor_user_id,updated_at=clock_timestamp() where id=p_id;
  else
    if q.pattern_completed_at is null then raise exception 'pattern_not_completed'; end if;
    if q.print_started_at is not null then return; end if;
    perform public.assert_production_task_startable(q,v_worker);
    update public.factory_production_queue_entries set print_started_at=clock_timestamp(),print_started_by_user_id=p_actor_user_id,
      last_status_updated_by_user_id=p_actor_user_id,updated_by_user_id=p_actor_user_id,updated_at=clock_timestamp() where id=p_id;
  end if;
end;
$$;

create or replace function public.update_factory_production_queue_statuses(p_ids uuid[],p_target_status text,p_actor_user_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare q public.factory_production_queue_entries; v_role text; v_from integer; v_to integer; v_count integer; v_worker uuid;
begin
  select role into v_role from public.users where id=p_actor_user_id and is_active=true;
  if v_role is null or v_role not in ('superadmin','production','factory-production','production-team') then raise exception 'forbidden'; end if;
  v_to:=array_position(array['queued','in_production','awaiting_factory','sent_to_factory'],p_target_status);
  if v_to is null then raise exception 'invalid_target_status'; end if;
  select count(distinct id) into v_count from unnest(p_ids) id;
  if v_count=0 then raise exception 'missing_queue_ids'; end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence',0));
  perform 1 from public.factory_production_queue_entries where id=any(p_ids) order by id for update;
  if (select count(*) from public.factory_production_queue_entries where id=any(p_ids))<>v_count then raise exception 'queue_not_found'; end if;
  for q in select * from public.factory_production_queue_entries where id=any(p_ids)
    order by public.factory_production_queue_priority_rank(factory_deposit_order_id),queue_sequence loop
    if not public.is_current_factory_production_deposit(q.factory_deposit_order_id) then raise exception 'deposit_order_not_ready_for_queue'; end if;
    v_worker:=case when q.status='queued' then q.pattern_user_id when q.status='in_production' then
      case when q.pattern_completed_at is null then q.pattern_user_id else q.print_user_id end else q.dispatch_user_id end;
    if v_role<>'superadmin' and v_worker is distinct from p_actor_user_id then raise exception 'forbidden'; end if;
    if v_worker is null then raise exception 'queue_unassigned'; end if;
    v_from:=array_position(array['queued','in_production','awaiting_factory','sent_to_factory'],q.status);
    if v_from=v_to then continue; end if;
    if v_to<>v_from+1 and not(v_role='superadmin' and v_to=v_from-1) then raise exception 'invalid_transition'; end if;
    if q.status='queued' and p_target_status='in_production' then perform public.assert_production_task_startable(q,q.pattern_user_id); end if;
    if p_target_status='awaiting_factory' and v_from<v_to and (q.pattern_completed_at is null or q.print_started_at is null) then raise exception 'pattern_not_completed'; end if;
    if q.status='awaiting_factory' and p_target_status='in_production' and public.production_queue_worker_busy(q.print_user_id,q.id) then raise exception 'production_already_in_progress'; end if;
    update public.factory_production_queue_entries set status=p_target_status,
      production_started_at=case when v_to>=2 then coalesce(production_started_at,clock_timestamp()) else null end,
      production_started_by_user_id=case when v_to>=2 then coalesce(production_started_by_user_id,p_actor_user_id) else null end,
      pattern_completed_at=case when v_to>=2 then pattern_completed_at else null end,
      pattern_completed_by_user_id=case when v_to>=2 then pattern_completed_by_user_id else null end,
      print_started_at=case when v_to>=2 then print_started_at else null end,
      print_started_by_user_id=case when v_to>=2 then print_started_by_user_id else null end,
      production_completed_at=case when v_to>=3 then coalesce(production_completed_at,clock_timestamp()) else null end,
      production_completed_by_user_id=case when v_to>=3 then coalesce(production_completed_by_user_id,p_actor_user_id) else null end,
      sent_to_factory_at=case when v_to=4 then coalesce(sent_to_factory_at,clock_timestamp()) else null end,
      sent_to_factory_by_user_id=case when v_to=4 then coalesce(sent_to_factory_by_user_id,p_actor_user_id) else null end,
      last_status_updated_by_user_id=p_actor_user_id,updated_by_user_id=p_actor_user_id,updated_at=clock_timestamp() where id=q.id;
  end loop;
  return v_count;
end;
$$;

drop policy if exists factory_production_queue_entries_select_by_role on public.factory_production_queue_entries;
create policy factory_production_queue_entries_select_by_role on public.factory_production_queue_entries for select using(
  public.is_current_factory_production_deposit(factory_deposit_order_id) and exists(select 1 from public.users viewer
    where viewer.auth_user_id=auth.uid() and viewer.is_active=true and (viewer.role='superadmin' or
      (viewer.role in ('production','factory-production','production-team') and viewer.id=any(array[pattern_user_id,print_user_id,dispatch_user_id]))))
);
revoke all on function public.normalize_production_stage_assignments(),public.production_queue_participants(public.factory_production_queue_entries),
  public.production_queue_active_worker(public.factory_production_queue_entries),public.production_queue_ready_worker(public.factory_production_queue_entries),
  public.production_queue_worker_busy(uuid,uuid),public.assert_production_task_startable(public.factory_production_queue_entries,uuid),
  public.assign_factory_production_stages(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid),public.advance_factory_production_task(uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function public.assign_factory_production_stages(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid),public.advance_factory_production_task(uuid,text,uuid) to service_role;
commit;
