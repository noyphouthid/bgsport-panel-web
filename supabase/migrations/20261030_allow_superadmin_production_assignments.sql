begin;

-- Superadmins can be manually assigned to any stage; automatic allocation
-- continues to select production staff through choose_factory_production_planner.
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
    perform 1 from public.users where id=v_id and is_active=true and role in ('superadmin','production','factory-production','production-team') for share;
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

-- Preserve an explicitly assigned superadmin during deposit edits and sync.
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
  if d.production_queue_legacy or d.production_queue_entered_at is null then return null; end if;
  select * into q from public.factory_production_queue_entries where factory_deposit_order_id = d.id for update;
  if found then
    v_planner := q.planner_user_id;
    if v_planner is null or not exists (
      select 1 from public.users where id = v_planner
        and role in ('superadmin','production','factory-production','production-team')
        and (q.status <> 'queued' or is_active = true)
    ) then
      v_planner := public.choose_factory_production_planner(q.queue_year, q.queue_month);
    end if;
    update public.factory_production_queue_entries set
      planner_user_id = v_planner,
      planner_reassigned_by_user_id = case when q.planner_user_id is distinct from v_planner then null else q.planner_reassigned_by_user_id end,
      planner_reassigned_at = case when q.planner_user_id is distinct from v_planner then null else q.planner_reassigned_at end,
      workload_piece_qty = public.factory_production_piece_qty(d),
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

revoke all on function public.assign_factory_production_stages(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid),
  public.enqueue_factory_production_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_factory_production_stages(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

commit;
