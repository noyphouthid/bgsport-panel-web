begin;

-- A priority edit takes effect without renumbering jobs or changing their owner.
create or replace function public.factory_production_queue_priority_rank(p_deposit_order_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.factory_deposit_orders
    where id = p_deposit_order_id and production_priority = 'urgent') then 0 else 1 end;
$$;
revoke all on function public.factory_production_queue_priority_rank(uuid) from public, anon, authenticated;

create or replace function public.update_factory_production_queue_statuses(p_ids uuid[], p_target_status text, p_actor_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare q public.factory_production_queue_entries; v_role text; v_count integer; v_from integer; v_to integer;
begin
  select role into v_role from public.users where id = p_actor_user_id and is_active = true;
  if v_role is null or v_role not in ('superadmin','production','factory-production','production-team') then raise exception 'forbidden'; end if;
  v_to := array_position(array['queued','in_production','awaiting_factory','sent_to_factory'], p_target_status);
  if v_to is null then raise exception 'invalid_target_status'; end if;
  select count(distinct id) into v_count from unnest(p_ids) as id;
  if v_count = 0 then raise exception 'missing_queue_ids'; end if;
  -- Same lock as assignment: simultaneous starts cannot claim two jobs for one worker.
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence', 0));
  perform 1 from public.factory_production_queue_entries where id = any(p_ids) order by id for update;
  if (select count(*) from public.factory_production_queue_entries where id = any(p_ids)) <> v_count then raise exception 'queue_not_found'; end if;
  for q in select * from public.factory_production_queue_entries where id = any(p_ids)
    order by public.factory_production_queue_priority_rank(factory_deposit_order_id), queue_sequence loop
    if v_role <> 'superadmin' and q.planner_user_id is distinct from p_actor_user_id then raise exception 'forbidden'; end if;
    if q.planner_user_id is null then raise exception 'queue_unassigned'; end if;
    if not public.is_current_factory_production_deposit(q.factory_deposit_order_id) then raise exception 'deposit_order_not_ready_for_queue'; end if;
    v_from := array_position(array['queued','in_production','awaiting_factory','sent_to_factory'], q.status);
    if v_from = v_to then continue; end if;
    if v_to <> v_from + 1 and not (v_role = 'superadmin' and v_to = v_from - 1) then raise exception 'invalid_transition'; end if;
    if p_target_status = 'in_production' then
      if exists (select 1 from public.factory_production_queue_entries other where other.planner_user_id = q.planner_user_id
        and other.id <> q.id and other.status = 'in_production' and public.is_current_factory_production_deposit(other.factory_deposit_order_id)) then
        raise exception 'production_already_in_progress';
      end if;
      if q.status = 'queued' and exists (select 1 from public.factory_production_queue_entries earlier where earlier.planner_user_id = q.planner_user_id
        and earlier.status = 'queued'
        and (public.factory_production_queue_priority_rank(earlier.factory_deposit_order_id), earlier.queue_sequence)
          < (public.factory_production_queue_priority_rank(q.factory_deposit_order_id), q.queue_sequence)
        and public.is_current_factory_production_deposit(earlier.factory_deposit_order_id)) then raise exception 'queue_not_next'; end if;
    end if;
    update public.factory_production_queue_entries set
      status = p_target_status,
      production_started_at = case when v_to >= 2 then coalesce(production_started_at, clock_timestamp()) else null end,
      production_started_by_user_id = case when v_to >= 2 then coalesce(production_started_by_user_id, p_actor_user_id) else null end,
      production_completed_at = case when v_to >= 3 then coalesce(production_completed_at, clock_timestamp()) else null end,
      production_completed_by_user_id = case when v_to >= 3 then coalesce(production_completed_by_user_id, p_actor_user_id) else null end,
      sent_to_factory_at = case when v_to = 4 then coalesce(sent_to_factory_at, clock_timestamp()) else null end,
      sent_to_factory_by_user_id = case when v_to = 4 then coalesce(sent_to_factory_by_user_id, p_actor_user_id) else null end,
      last_status_updated_by_user_id = p_actor_user_id, updated_by_user_id = p_actor_user_id, updated_at = clock_timestamp()
    where id = q.id;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.update_factory_production_queue_statuses(uuid[],text,uuid) from public,anon,authenticated;
grant execute on function public.update_factory_production_queue_statuses(uuid[],text,uuid) to service_role;

commit;
