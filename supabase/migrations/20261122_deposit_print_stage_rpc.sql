begin;

-- Requires 20261121_deposit_print_stages.sql.
-- Confirming a print from the panel hit "new row violates row-level security
-- policy". The app now records both stages through this function. It looks the
-- caller up from auth.uid() itself, so a direct insert or update is no longer needed.
--   p_stage = 'printed'   records ພິມ for deposits that have no print status yet
--   p_stage = 'confirmed' records ຢືນຢັນພິມສຳເລັດ for deposits not yet confirmed
-- Agents reach only their own deposits; other active users reach any deposit.
-- Returns the number of deposits whose status changed.
create or replace function public.set_factory_deposit_print_stage(p_deposit_ids uuid[], p_stage text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_role text;
  v_count integer;
begin
  select u.id, u.role into v_user_id, v_role
  from public.users u
  where u.auth_user_id = auth.uid() and u.is_active
  limit 1;
  if v_user_id is null then
    raise exception 'Print status requires an active user' using errcode = '42501';
  end if;
  if p_stage not in ('printed', 'confirmed') then
    raise exception 'Unknown print stage %', p_stage using errcode = '22023';
  end if;

  if p_stage = 'printed' then
    insert into public.factory_deposit_order_print_confirmations (deposit_order_id, status, printed_by_user_id)
    select d.id, 'printed', v_user_id
    from public.factory_deposit_orders d
    where d.id = any(p_deposit_ids)
      and (v_role <> 'agent' or d.agent_user_id = v_user_id)
    on conflict (deposit_order_id) do nothing;
  else
    insert into public.factory_deposit_order_print_confirmations (deposit_order_id, status, confirmed_by_user_id)
    select d.id, 'confirmed', v_user_id
    from public.factory_deposit_orders d
    where d.id = any(p_deposit_ids)
      and (v_role <> 'agent' or d.agent_user_id = v_user_id)
    on conflict (deposit_order_id) do update
      set status = 'confirmed', confirmed_by_user_id = excluded.confirmed_by_user_id
      where public.factory_deposit_order_print_confirmations.status = 'printed';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.set_factory_deposit_print_stage(uuid[], text) from public, anon;
grant execute on function public.set_factory_deposit_print_stage(uuid[], text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
