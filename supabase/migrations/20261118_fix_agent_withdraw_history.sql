begin;

-- Fixes 20261117_agent_withdraw_deposit.sql. The agent attachment guard from
-- 20261110 only lets agents write create/update/submit history, so the
-- withdrawal's 'agent_withdraw' entry was rejected and the whole withdrawal
-- rolled back ("Agent cannot record deposit approval or conversion").
-- The entry is now allowed only inside agent_withdraw_factory_deposit().

create or replace function public.guard_agent_deposit_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_sales_agent() then return new; end if;
  if not exists(select 1 from public.factory_deposit_orders d where d.id=new.deposit_order_id
    and d.agent_user_id=public.sales_agent_id() and d.status in ('draft','submitted')) then
    raise exception 'Agent deposit access denied' using errcode='42501';
  end if;
  if tg_table_name='factory_deposit_order_history' then
    if new.action not in ('create','update','submit')
      and not (new.action = 'agent_withdraw'
        and coalesce(current_setting('app.agent_deposit_withdraw', true), '') = new.deposit_order_id::text) then
      raise exception 'Agent cannot record deposit approval or conversion' using errcode='42501';
    end if;
    new.action_by_user_id := public.sales_agent_id();
  else
    new.uploaded_by_user_id := public.sales_agent_id();
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_deposit_attachment() from public,anon,authenticated;

-- Same as 20261117, but the history entry is written while the withdrawal
-- setting is still active.
create or replace function public.agent_withdraw_factory_deposit(p_deposit_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_agent uuid := public.sales_agent_id(); v_status text; v_owner uuid; v_order uuid;
begin
  if v_agent is null then
    raise exception 'Agent account required' using errcode = '42501';
  end if;
  select status, agent_user_id, order_id into v_status, v_owner, v_order
    from public.factory_deposit_orders where id = p_deposit_id for update;
  if not found or v_owner is distinct from v_agent then
    raise exception 'Agent deposit access denied' using errcode = '42501';
  end if;
  if v_status not in ('submitted', 'approved') or v_order is not null then
    raise exception 'Only sent deposits that are not orders yet can be withdrawn' using errcode = '42501';
  end if;
  if exists(select 1 from public.factory_production_queue_entries q
    where q.factory_deposit_order_id = p_deposit_id
      and (q.pattern_completed_at is not null or q.print_started_at is not null)) then
    raise exception 'Production has already started' using errcode = '42501';
  end if;

  -- Lets the guards accept this one status change and its history entry; the
  -- setting lasts only for this transaction and cannot be set through the API.
  perform set_config('app.agent_deposit_withdraw', p_deposit_id::text, true);
  update public.factory_deposit_orders
    set status = 'draft', approved_at = null, approved_by_user_id = null
    where id = p_deposit_id;
  insert into public.factory_deposit_order_history(deposit_order_id, action, detail, from_status, to_status, action_by_user_id)
    values (p_deposit_id, 'agent_withdraw', nullif(trim(coalesce(p_reason, '')), ''), v_status, 'draft', v_agent);
  perform set_config('app.agent_deposit_withdraw', '', true);
end $$;
revoke all on function public.agent_withdraw_factory_deposit(uuid, text) from public, anon;
grant execute on function public.agent_withdraw_factory_deposit(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
