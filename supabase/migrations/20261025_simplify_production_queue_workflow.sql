begin;

alter table public.factory_production_queue_entries
  add column if not exists production_started_at timestamptz,
  add column if not exists production_completed_at timestamptz,
  add column if not exists production_started_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists production_completed_by_user_id uuid references public.users(id) on delete set null;

alter table public.factory_production_queue_entries drop constraint if exists factory_production_queue_entries_status_check;
update public.factory_production_queue_entries set
  status = 'in_production',
  production_started_at = coalesce(production_started_at, pattern_laid_at, ready_for_print_at, updated_at),
  production_started_by_user_id = coalesce(production_started_by_user_id, pattern_laid_by_user_id, ready_for_print_by_user_id, planner_user_id)
where status in ('pattern_laid','all_sizes_laid','ready_for_print');
update public.factory_production_queue_entries set
  production_started_at = coalesce(production_started_at, pattern_laid_at, ready_for_print_at, sent_to_factory_at),
  production_completed_at = coalesce(production_completed_at, ready_for_print_at, sent_to_factory_at),
  production_started_by_user_id = coalesce(production_started_by_user_id, pattern_laid_by_user_id, planner_user_id),
  production_completed_by_user_id = coalesce(production_completed_by_user_id, ready_for_print_by_user_id, planner_user_id)
where status = 'sent_to_factory';
alter table public.factory_production_queue_entries add constraint factory_production_queue_entries_status_check
  check (status in ('queued','in_production','awaiting_factory','sent_to_factory'));

create index if not exists factory_production_queue_entries_owner_stage_sequence_idx
  on public.factory_production_queue_entries (planner_user_id, status, queue_sequence);

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
  for q in select * from public.factory_production_queue_entries where id = any(p_ids) order by queue_sequence loop
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
        and earlier.status = 'queued' and earlier.queue_sequence < q.queue_sequence
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
-- Reassignment changes responsibility; recorded status actors remain historical facts.
create or replace function public.reassign_factory_production_queue_entry(
  p_id uuid, p_planner_user_id uuid, p_actor_user_id uuid, p_expected_planner_user_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare q public.factory_production_queue_entries;
begin
  if not exists (select 1 from public.users where id = p_actor_user_id and role = 'superadmin' and is_active = true) then
    raise exception 'forbidden';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('factory_production_queue_global_sequence', 0));
  -- Lock the recipient against deactivation while assigning the order.
  perform 1 from public.users where id = p_planner_user_id and is_active = true
    and role in ('production','factory-production','production-team') for share;
  if not found then raise exception 'invalid_planner_user'; end if;
  select * into q from public.factory_production_queue_entries where id = p_id for update;
  if not found then raise exception 'queue_not_found'; end if;
  if not exists (select 1 from public.factory_deposit_orders where id = q.factory_deposit_order_id
    and production_queue_entered_at is not null and not production_queue_legacy
    and status in ('submitted','approved','converted')) then raise exception 'queue_not_found'; end if;
  if q.planner_user_id is distinct from p_expected_planner_user_id then raise exception 'assignment_changed'; end if;
  if q.status = 'in_production' and exists (
    select 1 from public.factory_production_queue_entries other where other.id <> q.id
      and other.planner_user_id = p_planner_user_id and other.status = 'in_production'
      and public.is_current_factory_production_deposit(other.factory_deposit_order_id)
  ) then raise exception 'production_already_in_progress'; end if;
  if q.planner_user_id is not distinct from p_planner_user_id then return; end if;
  update public.factory_production_queue_entries set
    planner_user_id = p_planner_user_id,
    planner_reassigned_by_user_id = p_actor_user_id, planner_reassigned_at = clock_timestamp(),
    updated_by_user_id = p_actor_user_id, updated_at = clock_timestamp()
  where id = p_id;
end;
$$;

commit;
