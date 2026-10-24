begin;

-- Repair databases whose status RPC was installed without its urgent-priority helper.
-- Keep the deployed status/assignment functions and all queue data in place.
-- A priority edit takes effect without renumbering jobs or changing their owner.
create or replace function public.factory_production_queue_priority_rank(p_deposit_order_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.factory_deposit_orders
    where id = p_deposit_order_id and production_priority = 'urgent') then 0 else 1 end;
$$;
revoke all on function public.factory_production_queue_priority_rank(uuid) from public, anon, authenticated;

-- Refresh the API schema cache after installing the missing function.
notify pgrst, 'reload schema';

commit;
