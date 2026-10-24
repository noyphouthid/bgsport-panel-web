begin;

-- Dispatch remains a queue participant for access and handoff, without piece credit.
create or replace function public.production_queue_credit_participants(q public.factory_production_queue_entries)
returns uuid[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct worker order by worker), '{}'::uuid[])
  from unnest(array[q.pattern_user_id,q.print_user_id]) as worker where worker is not null;
$$;

create or replace function public.choose_factory_production_planner(p_year integer,p_month integer)
returns uuid language sql security definer set search_path = public as $$
  select worker.id from public.users worker
  left join public.factory_production_queue_entries q on worker.id = any(public.production_queue_credit_participants(q))
    and q.queue_year=p_year and q.queue_month=p_month
  where worker.is_active=true and worker.role in ('production','factory-production','production-team')
  group by worker.id
  order by coalesce(sum(q.workload_piece_qty::numeric / nullif(cardinality(public.production_queue_credit_participants(q)),0))
      filter(where public.is_current_factory_production_deposit(q.factory_deposit_order_id)),0),
    count(q.id) filter(where public.is_current_factory_production_deposit(q.factory_deposit_order_id)),worker.id limit 1;
$$;

revoke all on function public.production_queue_credit_participants(public.factory_production_queue_entries) from public,anon,authenticated;

commit;
